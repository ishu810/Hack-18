import { Travel } from '../models/travel.model.js';
import { ChatOpenAI } from '@langchain/openai';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildItineraryPrompt } from '../utils/itineraryPrompt.js';
import { computeRoute as computeRouteService } from '../services/routing/routing.service.js';
import { fetchGoogleVenueRecommendations } from '../services/places/googlePlaces.service.js';
import axios from 'axios';

const withTimeout = (promise, ms, label = 'operation') => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`[Timeout] ${label} exceeded ${ms}ms`)), ms)),
]);

const FALLBACK_IMAGE = 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg';
const GEOAPIFY_BASE_URL = 'https://api.geoapify.com';

const getGeoapifyKey = () => {
  const raw = process.env.GEOAPIFY_API_KEY || process.env.GEOAPIFY_KEY || '';
  return raw.trim();
};

const getWeatherApiKey = () => {
  const raw = process.env.WEATHERAPI_KEY || process.env.WEATHER_API_KEY || '';
  return raw.trim();
};

const KIWI_CITY_IATA = {
  delhi: 'DEL',
  mumbai: 'BOM',
  bengaluru: 'BLR',
  bangalore: 'BLR',
  hyderabad: 'HYD',
  chennai: 'MAA',
  kolkata: 'CCU',
  pune: 'PNQ',
  ahmedabad: 'AMD',
  jaipur: 'JAI',
  lucknow: 'LKO',
  agra: 'AGR',
  mathura: 'DEL',
  udaipur: 'UDR',
  varanasi: 'VNS',
  goa: 'GOI',
  kochi: 'COK',
  kochin: 'COK',
  chandigarh: 'IXC',
  indore: 'IDR',
  nagpur: 'NAG',
  surat: 'STV',
  bhopal: 'BHO',
  patna: 'PAT',
  ranchi: 'IXR',
  amritsar: 'ATQ',
  dehradun: 'DED',
  srinagar: 'SXR',
  guwahati: 'GAU',
  bhubaneswar: 'BBI',
  trivandrum: 'TRV',
  visakhapatnam: 'VTZ',
  mysore: 'MYQ',
};

const normalizeCityToken = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[^a-z\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const resolveIataForCity = (value = '') => {
  const normalized = normalizeCityToken(value);
  if (!normalized) return '';

  if (KIWI_CITY_IATA[normalized]) return KIWI_CITY_IATA[normalized];

  const parts = normalized.split(' ').filter(Boolean);
  for (const part of parts) {
    if (KIWI_CITY_IATA[part]) return KIWI_CITY_IATA[part];
  }

  return '';
};

const extractKiwiItinerarySummary = (payload = {}) => {
  const itineraries = Array.isArray(payload?.itineraries) ? payload.itineraries : [];
  if (!itineraries.length) return null;

  const normalizePrice = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  };

  const durationMinutesFromSeconds = (value) => {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : null;
  };

  const ranked = itineraries
    .map((itinerary) => {
      const price = normalizePrice(itinerary?.price?.amount ?? itinerary?.priceEur?.amount);
      const duration = durationMinutesFromSeconds(itinerary?.outbound?.duration ?? itinerary?.duration ?? itinerary?.outbound?.durationInMinutes);
      return price ? { price, duration } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.price - right.price);

  return ranked[0] || null;
};

const maskKey = (value = '') => {
  const key = String(value || '').trim();
  if (!key) return '[missing]';
  if (key.length <= 10) return `${key.slice(0, 3)}***`;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
};

const normalizeForecastDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const buildTripDateList = (dates = [], tripDays = 1) => {
  const days = Math.max(1, Number(tripDays) || 1);
  const startRaw = Array.isArray(dates) && dates.length ? dates[0] : null;
  const start = startRaw ? new Date(startRaw) : new Date();

  if (Number.isNaN(start.getTime())) {
    const today = new Date();
    return Array.from({ length: days }, (_, index) => {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
  }

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
};

const summarizeWeatherForNarrative = (details = {}) => {
  const condition = details.condition || 'Unknown conditions';
  const avg = Number.isFinite(details.avg_temp_c) ? `${details.avg_temp_c}C avg` : 'temp N/A';
  const rain = Number.isFinite(details.daily_chance_of_rain) ? `${details.daily_chance_of_rain}% rain chance` : 'rain chance N/A';
  const wind = Number.isFinite(details.max_wind_kph) ? `${details.max_wind_kph} kph winds` : 'wind N/A';
  return `${condition}, ${avg}, ${rain}, ${wind}`;
};

const formatWeatherHeadline = (details = {}) => {
  const condition = details.condition || 'Forecast unavailable';
  const min = Number.isFinite(details.min_temp_c) ? `${details.min_temp_c}C` : 'N/A';
  const max = Number.isFinite(details.max_temp_c) ? `${details.max_temp_c}C` : 'N/A';
  const rain = Number.isFinite(details.daily_chance_of_rain) ? `${details.daily_chance_of_rain}%` : 'N/A';
  return `${condition} | ${min}-${max} | Rain ${rain}`;
};

const formatWeatherNote = (details = {}) => {
  const parts = [];
  if (Number.isFinite(details.avg_temp_c)) parts.push(`Average ${details.avg_temp_c}C`);
  if (Number.isFinite(details.avg_humidity)) parts.push(`Humidity ${details.avg_humidity}%`);
  if (Number.isFinite(details.total_precip_mm)) parts.push(`Precipitation ${details.total_precip_mm} mm`);
  if (Number.isFinite(details.max_wind_kph)) parts.push(`Max wind ${details.max_wind_kph} kph`);
  if (Number.isFinite(details.uv)) parts.push(`UV ${details.uv}`);
  if (details.sunrise || details.sunset) parts.push(`Sunrise ${details.sunrise || 'N/A'} / Sunset ${details.sunset || 'N/A'}`);
  if (details.alerts_summary) parts.push(`Alerts: ${details.alerts_summary}`);
  return parts.join(' | ');
};

const isMetricHeavyNarrative = (text = '') => {
  const value = String(text || '').trim();
  if (!value) return false;
  const metricMatches = value.match(/\b\d+(?:\.\d+)?\s?(?:c|°c|f|%|mm|kph|km|uv|hrs?|minutes?)\b/gi) || [];
  const separatorMatches = value.match(/[|;]/g) || [];
  return metricMatches.length >= 3 || separatorMatches.length >= 2;
};

const buildAdviceOnlyNarrative = (details = {}) => {
  const condition = String(details?.condition || 'today').toLowerCase();
  const opening = condition.includes('rain')
    ? 'Plan the outdoor part early and keep an indoor stop ready if the rain picks up later.'
    : condition.includes('cloud')
      ? 'Use the softer weather to cover the main sights first and keep the afternoon flexible.'
      : condition.includes('sun') || condition.includes('clear')
        ? 'Start with the bigger outdoor stop while the day is easier, then move into slower sightseeing later.'
        : 'Keep the day flexible and decide the pace based on how the weather feels by mid-morning.';

  const middle = 'Break the day into one strong outdoor block and one easier backup block so you do not feel rushed.';
  const tip = condition.includes('rain')
    ? 'Carry a compact umbrella and choose lunch spots that are easy to reach without a long walk.'
    : condition.includes('sun') || condition.includes('clear')
      ? 'Keep water handy and take short shade breaks so the sightseeing stays comfortable.'
      : 'A light layer and a relaxed pace will help you stay comfortable through the day.';
  const close = 'Overall, this is still a good day for sightseeing if you keep the timing smart and stay a little flexible.';

  return [opening, middle, tip, close].join(' ');
};

const mergeWeatherNarrative = (narrative = '', details = {}) => {
  const text = String(narrative || '').trim();
  if (text && !isMetricHeavyNarrative(text)) return text;
  if (text && isMetricHeavyNarrative(text)) return buildAdviceOnlyNarrative(details);
  return buildAdviceOnlyNarrative(details);
};

const getFallbackWeatherReason = (place, details = {}) => {
  const placeName = place?.name || 'This stop';
  const condition = details.condition || 'today\'s weather';
  const rain = Number.isFinite(details.daily_chance_of_rain) ? `${details.daily_chance_of_rain}%` : 'unknown';
  const avg = Number.isFinite(details.avg_temp_c) ? `${details.avg_temp_c}C` : 'unknown';
  const wind = Number.isFinite(details.max_wind_kph) ? `${details.max_wind_kph} kph` : 'unknown';
  return `${placeName}: Good pick for today (${condition}, avg ${avg}, rain ${rain}, wind ${wind}).`;
};

const getGenericPlaceReason = (place, activity = {}, fallbackCity = '') => {
  const cleanActivityLabel = (value = '') => String(value || '')
    .replace(/\|\s*duration\s*:[^|]*/gi, '')
    .replace(/\|\s*type\s*:[^|]*/gi, '')
    .replace(/^\s*after\s+reaching\s+[^,]+,\s*/i, '')
    .replace(/^\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s*-\s*/i, '')
    .replace(/^\s*(morning\s+visit\s+to|evening\s+visit\s+to|visit|explore|discover|tour|boat\s+ride\s+on|walk\s+through|lunch\s+at|dinner\s+at)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const placeName = cleanActivityLabel(place?.name || activity?.title || 'This place') || 'This place';
  const city = String(place?.location || activity?.location || fallbackCity || '').trim();
  const key = normalizePlaceName(placeName);

  if (key.includes('taj mahal')) {
    return 'Famous for its white-marble Mughal architecture and symmetry; expect iconic views and moderate crowds.';
  }
  if (key.includes('agra fort')) {
    return 'Known for grand Mughal courtyards and history-rich interiors; expect a rewarding heritage walk.';
  }
  if (key.includes('city palace')) {
    return 'A heritage landmark known for royal architecture, museum spaces, and panoramic old-city views.';
  }
  if (key.includes('jagdish temple')) {
    return 'A well-known historic temple admired for intricate carvings and a vibrant local spiritual atmosphere.';
  }
  if (key.includes('lake pichola') || key.includes('pichola')) {
    return 'Famous for calm waters, palace backdrops, and scenic sunset views; expect a relaxed, photogenic stop.';
  }
  if (key.includes('mathura')) {
    return 'Popular for Krishna heritage and lively local culture; expect temples, local markets, and devotional charm.';
  }

  if (city) {
    return `${placeName} is a well-known highlight in ${city}, popular for local character, memorable views, and cultural value.`;
  }

  return `${placeName} is a popular highlight known for its atmosphere, local significance, and visitor-friendly experience.`;
};

const fetchWeatherForCity = async ({ city, tripDays }) => {
  const key = getWeatherApiKey();
  if (!key || !city) return null;

  const cappedDays = Math.max(1, Math.min(14, Number(tripDays) || 1));
  const response = await axios.get('https://api.weatherapi.com/v1/forecast.json', {
    params: {
      key,
      q: city,
      days: cappedDays,
      aqi: 'yes',
      alerts: 'yes'
    },
    timeout: 12000
  });

  return response.data || null;
};

const buildWeatherByDayInput = async ({ groupedPlacesByDay = [], tripDates = [], tripDays = 1, destination = '' }) => {
  const cityByDay = groupedPlacesByDay.map((dayPlaces) => dayPlaces?.[0]?.location || destination || '');
  const uniqueCities = [...new Set(cityByDay.map((city) => String(city || '').trim()).filter(Boolean))];
  const weatherByCity = new Map();

  await Promise.all(uniqueCities.map(async (city) => {
    try {
      const data = await fetchWeatherForCity({ city, tripDays });
      if (data) weatherByCity.set(city.toLowerCase(), data);
    } catch (error) {
      console.warn(`WeatherAPI fetch failed for ${city}:`, error?.response?.data || error?.message || error);
    }
  }));

  const dayDates = buildTripDateList(tripDates, tripDays);

  return dayDates.map((dateLabel, index) => {
    const city = cityByDay[index] || destination || '';
    const weatherPayload = weatherByCity.get(city.toLowerCase());
    const forecastDays = weatherPayload?.forecast?.forecastday || [];
    const alerts = weatherPayload?.alerts?.alert || [];

    let forecast = forecastDays.find((entry) => normalizeForecastDate(entry?.date) === dateLabel) || null;
    if (!forecast) forecast = forecastDays[index] || forecastDays[forecastDays.length - 1] || null;

    const day = forecast?.day || {};
    const astro = forecast?.astro || {};
    const detail = {
      date: dateLabel,
      city,
      condition: day?.condition?.text || '',
      avg_temp_c: toFiniteNumber(day?.avgtemp_c),
      min_temp_c: toFiniteNumber(day?.mintemp_c),
      max_temp_c: toFiniteNumber(day?.maxtemp_c),
      avg_humidity: toFiniteNumber(day?.avghumidity),
      daily_chance_of_rain: toFiniteNumber(day?.daily_chance_of_rain),
      total_precip_mm: toFiniteNumber(day?.totalprecip_mm),
      max_wind_kph: toFiniteNumber(day?.maxwind_kph),
      uv: toFiniteNumber(day?.uv),
      sunrise: astro?.sunrise || '',
      sunset: astro?.sunset || '',
      alerts_summary: alerts.length
        ? alerts.slice(0, 2).map((alert) => `${alert?.event || 'Weather alert'} (${alert?.severity || 'unknown severity'})`).join('; ')
        : 'No severe alerts'
    };

    return detail;
  });
};

const llm = new ChatOpenAI({
  openaiApiKey: process.env.OPENAI_API_KEY,
  modelName: 'gpt-3.5-turbo',
  temperature: 0.7
});

const getTripDaysFromDates = (dates) => {
  if (!Array.isArray(dates) || dates.length === 0) return 1;
  if (dates.length === 1) return 1;

  const start = new Date(dates[0]);
  const end = new Date(dates[dates.length - 1]);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return Math.max(1, dates.length);
  }

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, diffDays);
};

const buildRouteCitySequence = (trip = {}) => {
  const raw = [...(Array.isArray(trip?.stops) ? trip.stops : []), trip?.destination]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const seen = new Set();
  const sequence = [];
  raw.forEach((city) => {
    const key = normalizePlaceName(city);
    if (!key || seen.has(key)) return;
    seen.add(key);
    sequence.push(city);
  });

  return sequence;
};

const normalizePlaceName = (value = '') => value
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\b(the|a|an)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toRad = (value) => (value * Math.PI) / 180;

const distanceKm = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const val = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(val), Math.sqrt(1 - val));
};

const buildNearbyDayGrouping = (selectedPlaces = [], tripDays = 1, routeOrderedCities = []) => {
  const days = Math.max(1, Number(tripDays) || 1);
  const cleanedPlaces = (Array.isArray(selectedPlaces) ? selectedPlaces : [])
    .filter((place) => place && place.name)
    .map((place) => ({
      ...place,
      location: String(place.location || '').trim(),
      lat: toFiniteNumber(place.lat),
      lng: toFiniteNumber(place.lng)
    }));

  const groupedPlacesByDay = Array.from({ length: days }, () => []);
  if (!cleanedPlaces.length) {
    return {
      orderedPlaces: [],
      groupedPlacesByDay
    };
  }

  const byLocation = new Map();
  cleanedPlaces.forEach((place) => {
    const key = normalizePlaceName(place.location || 'unspecified');
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key).push(place);
  });

  const locationGroups = [...byLocation.values()].sort((a, b) => b.length - a.length);
  const groupedKeys = new Set();

  // Keep itinerary progression aligned with route order (stops -> destination).
  const orderedCityKeys = (Array.isArray(routeOrderedCities) ? routeOrderedCities : [])
    .map((city) => normalizePlaceName(city))
    .filter(Boolean);

  orderedCityKeys.forEach((cityKey, index) => {
    if (!cityKey) return;
    const exactGroup = byLocation.get(cityKey);
    let resolvedGroup = exactGroup;

    if (!resolvedGroup) {
      const fuzzyMatch = [...byLocation.entries()].find(([locKey]) => locKey.includes(cityKey) || cityKey.includes(locKey));
      resolvedGroup = fuzzyMatch?.[1] || null;
    }

    if (!resolvedGroup?.length) return;

    const resolvedKey = normalizePlaceName(resolvedGroup[0]?.location || cityKey);
    if (groupedKeys.has(resolvedKey)) return;
    groupedKeys.add(resolvedKey);

    const targetDay = Math.min(index, days - 1);
    groupedPlacesByDay[targetDay].push(...resolvedGroup);
  });

  locationGroups.forEach((group) => {
    const key = normalizePlaceName(group?.[0]?.location || '');
    if (key && groupedKeys.has(key)) return;

    let targetDay = 0;
    for (let index = 1; index < groupedPlacesByDay.length; index += 1) {
      if (groupedPlacesByDay[index].length < groupedPlacesByDay[targetDay].length) {
        targetDay = index;
      }
    }
    groupedPlacesByDay[targetDay].push(...group);
  });

  // Ensure every day gets at least one place when possible.
  for (let dayIndex = 0; dayIndex < groupedPlacesByDay.length; dayIndex += 1) {
    if (groupedPlacesByDay[dayIndex].length) continue;

    let donorDay = -1;
    for (let index = 0; index < groupedPlacesByDay.length; index += 1) {
      if (groupedPlacesByDay[index].length > 1 && (donorDay === -1 || groupedPlacesByDay[index].length > groupedPlacesByDay[donorDay].length)) {
        donorDay = index;
      }
    }

    if (donorDay !== -1) {
      groupedPlacesByDay[dayIndex].push(groupedPlacesByDay[donorDay].pop());
    }
  }

  const orderedPlaces = groupedPlacesByDay.flat();
  return {
    orderedPlaces,
    groupedPlacesByDay
  };
};

const scorePlaceForSelection = (place = {}) => {
  const popularity = Number(place?.popularity) || 0;
  const rating = Number(place?.rating) || 0;
  const name = normalizePlaceName(place?.name);
  const type = normalizePlaceName(place?.type);

  const highPriorityTerms = [
    'taj mahal', 'fort', 'palace', 'lake', 'heritage', 'temple', 'monument', 'castle',
    'viewpoint', 'ghat', 'jagdish', 'sajjangarh', 'city palace', 'lake pichola', 'bagore',
    'haveli', 'museum', 'old city',
  ];

  const mediumPriorityTerms = ['garden', 'park', 'market', 'memorial', 'hill', 'biological', 'wildlife'];
  const genericPenaltyTerms = ['foundation', 'institute', 'office', 'residence', 'residential', 'school', 'university', 'park'];

  const highPriorityBonus = highPriorityTerms.reduce((bonus, term) => (
    name.includes(term) || type.includes(term) ? bonus + 34 : bonus
  ), 0);

  const mediumPriorityBonus = mediumPriorityTerms.reduce((bonus, term) => (
    name.includes(term) || type.includes(term) ? bonus + 10 : bonus
  ), 0);

  const genericPenalty = genericPenaltyTerms.reduce((penalty, term) => (
    name.includes(term) || type.includes(term) ? penalty - 16 : penalty
  ), 0);

  return (popularity * 1.2) + (rating * 2.4) + highPriorityBonus + mediumPriorityBonus + genericPenalty;
};

const sortPlacesBySelectionScore = (places = []) => [...places].sort((a, b) => {
  const scoreDelta = scorePlaceForSelection(b) - scorePlaceForSelection(a);
  if (scoreDelta !== 0) return scoreDelta;
  const locationDelta = normalizePlaceName(a?.location).localeCompare(normalizePlaceName(b?.location));
  if (locationDelta !== 0) return locationDelta;
  return normalizePlaceName(a?.name).localeCompare(normalizePlaceName(b?.name));
});

const buildStrictShortlist = (candidates = [], destination = '', days = 1) => {
  const destinationKey = normalizePlaceName(destination);
  const intermediateKeys = [...new Set(
    candidates
      .map((item) => normalizePlaceName(item?.location))
      .filter((loc) => loc && loc !== destinationKey)
  )];

  const destinationCap = days === 3 ? 5 : Math.max(2, Math.min(5, days + 2));
  const perIntermediateCap = 2;

  const shortlist = [];
  const seen = new Set();

  const takeTop = (items = [], cap = Infinity) => {
    let taken = 0;
    for (const item of sortPlacesBySelectionScore(items)) {
      const key = `${normalizePlaceName(item?.name)}|${normalizePlaceName(item?.location)}`;
      if (!item?.name || seen.has(key)) continue;
      seen.add(key);
      shortlist.push(item);
      taken += 1;
      if (taken >= cap) break;
    }
  };

  takeTop(candidates.filter((item) => normalizePlaceName(item?.location) === destinationKey), destinationCap);

  for (const locationKey of intermediateKeys) {
    takeTop(candidates.filter((item) => normalizePlaceName(item?.location) === locationKey), perIntermediateCap);
  }

  // If the route still has room, backfill with the next best places without changing caps.
  if (shortlist.length < Math.min(days * 3, candidates.length)) {
    const locationCounts = new Map();
    shortlist.forEach((item) => {
      const key = normalizePlaceName(item?.location);
      locationCounts.set(key, (locationCounts.get(key) || 0) + 1);
    });

    const maxCount = Math.min(days * 3, candidates.length);
    for (const item of sortPlacesBySelectionScore(candidates)) {
      if (shortlist.length >= maxCount) break;
      const locKey = normalizePlaceName(item?.location);
      const isDestination = locKey === destinationKey;
      const locCap = isDestination ? destinationCap : perIntermediateCap;
      const currentCount = locationCounts.get(locKey) || 0;
      const key = `${normalizePlaceName(item?.name)}|${locKey}`;
      if (!item?.name || seen.has(key) || currentCount >= locCap) continue;
      seen.add(key);
      shortlist.push(item);
      locationCounts.set(locKey, currentCount + 1);
    }
  }

  return sortPlacesBySelectionScore(shortlist);
};

const geocodeWithGeoapify = async (place) => {
  const apiKey = getGeoapifyKey();
  if (!apiKey || !place) return null;
  const response = await axios.get(`${GEOAPIFY_BASE_URL}/v1/geocode/search`, {
    params: {
      text: place,
      limit: 1,
      apiKey
    },
    timeout: 10000
  });

  const feature = response.data?.features?.[0];
  if (!feature) return null;

  return {
    lat: toFiniteNumber(feature.geometry?.coordinates?.[1]),
    lng: toFiniteNumber(feature.geometry?.coordinates?.[0]),
    name: feature.properties?.formatted || place
  };
};

const fetchGeoapifyPlaces = async ({ lat, lng, radius = 50000 }) => {
  const apiKey = getGeoapifyKey();
  if (!apiKey || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const categories = 'tourism.sights,tourism.attraction,entertainment,leisure,building.historic,natural';
  const response = await axios.get(`${GEOAPIFY_BASE_URL}/v2/places`, {
    params: {
      categories,
      filter: `circle:${lng},${lat},${radius}`,
      limit: 80,
      apiKey
    },
    timeout: 12000
  });

  return (response.data?.features || [])
    .map((feature) => {
      const name = feature.properties?.name?.trim();
      if (!name) return null;

      const placeLat = toFiniteNumber(feature.geometry?.coordinates?.[1]);
      const placeLng = toFiniteNumber(feature.geometry?.coordinates?.[0]);

      return {
        name,
        lat: placeLat,
        lng: placeLng,
        rating: toFiniteNumber(feature.properties?.rank?.confidence),
        popularity: toFiniteNumber(feature.properties?.rank?.popularity),
        category: Array.isArray(feature.properties?.categories) ? feature.properties.categories[0] : 'attraction',
        address: feature.properties?.formatted || ''
      };
    })
    .filter((item) => item && Number.isFinite(item.lat) && Number.isFinite(item.lng));
};

const enforceDestinationPriority = ({ selected = [], candidates = [], destination = '', maxCount = 12, days = 1 }) => {
  const destinationKey = normalizePlaceName(destination);
  const intermediates = [...new Set(
    candidates
      .map((item) => normalizePlaceName(item?.location))
      .filter((loc) => loc && loc !== destinationKey)
  )];

  const scoreSort = (a, b) => {
    const scoreA = (Number(a?.popularity) || 0) + (Number(a?.rating) || 0);
    const scoreB = (Number(b?.popularity) || 0) + (Number(b?.rating) || 0);
    return scoreB - scoreA;
  };

  const byLocation = (list, locationKey) => list.filter((item) => normalizePlaceName(item?.location) === locationKey).sort(scoreSort);

  const selectedSorted = [...selected].sort(scoreSort);
  const candidateSorted = [...candidates].sort(scoreSort);

  const destinationPool = [...byLocation(selectedSorted, destinationKey), ...byLocation(candidateSorted, destinationKey)];
  const intermediatePools = new Map(intermediates.map((loc) => [
    loc,
    [...byLocation(selectedSorted, loc), ...byLocation(candidateSorted, loc)]
  ]));

  const perIntermediateCap = 2;
  const destinationCap = days === 3
    ? Math.min(maxCount, 5)
    : Math.min(maxCount, Math.ceil((maxCount * 5) / 9));

  const finalList = [];
  const used = new Set();

  const pushUnique = (items, cap = Infinity) => {
    for (const item of items) {
      const key = `${normalizePlaceName(item?.name)}|${normalizePlaceName(item?.location)}`;
      if (!item?.name || used.has(key)) continue;
      used.add(key);
      finalList.push(item);
      if (finalList.length >= maxCount || cap <= 1) return;
      cap -= 1;
    }
  };

  // Fill destination first with strict cap (e.g. 3 days -> max 5 destination places).
  pushUnique(destinationPool, destinationCap);

  // Add limited intermediate picks (max 2 per intermediate city).
  for (const loc of intermediates) {
    if (finalList.length >= maxCount) break;
    const room = Math.min(perIntermediateCap, maxCount - finalList.length);
    pushUnique(intermediatePools.get(loc) || [], room);
  }

  // Fill remaining slots while respecting per-location caps.
  if (finalList.length < maxCount) {
    const locationCounts = new Map();
    finalList.forEach((item) => {
      const key = normalizePlaceName(item?.location);
      locationCounts.set(key, (locationCounts.get(key) || 0) + 1);
    });

    for (const item of candidateSorted) {
      if (finalList.length >= maxCount) break;
      const locKey = normalizePlaceName(item?.location);
      const currentCount = locationCounts.get(locKey) || 0;
      const isDestination = locKey === destinationKey;
      const locCap = isDestination ? destinationCap : perIntermediateCap;
      if (currentCount >= locCap) continue;

      const key = `${normalizePlaceName(item?.name)}|${locKey}`;
      if (!item?.name || used.has(key)) continue;

      used.add(key);
      finalList.push(item);
      locationCounts.set(locKey, currentCount + 1);
    }
  }

  return finalList
    .slice(0, maxCount)
    .map((item) => ({
      ...item,
      type: item.type || 'attraction',
      best_visit_reason: (item.best_visit_reason || '').trim() || `Popular highlight near ${item.location}.`
    }));
};

const fallbackSelectPlaces = (candidates, maxCount, destination, days = 1) => {
  const seen = new Set();
  const baseline = candidates
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .filter((candidate) => {
      const normalized = normalizePlaceName(candidate.name);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, maxCount)
    .map((candidate) => ({
      ...candidate,
      type: candidate.type || 'attraction',
      best_visit_reason: candidate.best_visit_reason || `Popular highlight near ${candidate.location}.`
    }));

  return enforceDestinationPriority({
    selected: baseline,
    candidates,
    destination,
    maxCount,
    days,
  });
};

const selectPlacesWithLLM = async ({ candidates, maxCount, days, destination }) => {
  if (!candidates.length) return [];

  const intermediateLocations = [...new Set(
    candidates
      .map((item) => normalizePlaceName(item?.location))
      .filter((loc) => loc && loc !== normalizePlaceName(destination))
  )];

  const destinationCap = days === 3
    ? Math.min(maxCount, 5)
    : Math.min(maxCount, Math.ceil((maxCount * 5) / 9));
  const prompt = `You are a strict travel selection engine. Return ONLY a valid JSON array and nothing else.

Goal: pick only high-value tourist attractions that feel diverse and memorable.

Hard rules:
1) Output length MUST be <= ${maxCount}.
2) For destination "${destination}", select at most ${destinationCap} places.
3) For EACH intermediate checkpoint, select at most 2 places.
4) Keep places geographically correct to their checkpoint location.
5) Do not relocate places to wrong cities (example: Agra Fort must not be mapped to Mathura).
6) Prefer famous/popular attractions first, then balance categories for varied feel.
7) Sort output by priority descending: popularity + rating + tourist significance.
8) Avoid duplicates and near-duplicates.

Important: if the input contains both famous and lesser-known places for the same city, prefer the famous and more established tourist attractions.

Trip days: ${days}
Intermediate checkpoints: ${JSON.stringify(intermediateLocations)}

Input candidates (already pre-ranked by popularity, rating, and tourist significance):
${JSON.stringify(candidates)}

Output JSON schema:
[
  {
    "name": "Place Name",
    "location": "Checkpoint Name",
    "lat": 0,
    "lng": 0,
    "type": "landmark",
    "rating": 0,
    "popularity": 0,
    "best_visit_reason": "one concise line"
  }
]`;

  const response = await withTimeout(llm.invoke(prompt), 15000, 'LLM place selection');
  const raw = (response.content || response.text || '').toString().trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('LLM output is not an array.');
  }

  return parsed;
};

const buildQueryVariants = (placeName, location, type) => {
  const safePlace = (placeName || '').trim();
  const safeLocation = (location || '').trim();
  const safeType = (type || '').trim();

  const normalize = (value) => value
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const placeNorm = normalize(safePlace);
  const locationNorm = normalize(safeLocation);
  const placeNoStopwords = placeNorm
    .replace(/\b(the|of|de|la|le|ki|ka|and)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const candidates = [
    `${placeNorm} ${locationNorm}`,
    `${placeNorm} ${locationNorm} landmark`,
    `${placeNorm} ${locationNorm} travel`,
    `${placeNorm} ${locationNorm} tourism`,
    `${placeNorm} ${locationNorm} ${safeType}`,
    `${placeNoStopwords} ${locationNorm}`,
    placeNorm,
    `${placeNorm} landmark`,
    `${placeNorm} travel`,
    locationNorm,
    `${locationNorm} city`,
    `${locationNorm} tourism`
  ].map(normalize).filter(Boolean);

  return [...new Set(candidates)];
};

const getUnsplashImage = async (queries, label) => {
  if (!process.env.UNSPLASH_ACCESS_KEY) return null;

  const queryList = Array.isArray(queries) ? queries : [queries];

  for (const q of queryList) {
    try {
      const response = await axios.get('https://api.unsplash.com/search/photos', {
        params: {
          query: q.trim(),
          per_page: 3
        },
        headers: {
          Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
        },
        timeout: 8000
      });

      const image = response.data?.results?.find((r) => r?.urls?.regular || r?.urls?.full || r?.urls?.raw || r?.urls?.small || r?.urls?.thumb || r?.urls?.small_s3);
      if (image) {
        const chosen = image?.urls?.regular || image?.urls?.full || image?.urls?.raw || image?.urls?.small || image?.urls?.thumb || image?.urls?.small_s3 || null;
        if (chosen) {
          console.log(`Unsplash image for "${label || q}" found via query "${q}":`, chosen);
          return chosen;
        }
      }
    } catch (e) {
      console.warn(`Unsplash query "${q}" failed:`, e.message || e);
    }
  }

  console.warn('Unsplash: all query strategies exhausted for', label || queryList[0]);
  return null;
};

const getPexelsImage = async (queries, label) => {
  if (!process.env.PEXELS_API_KEY) return null;

  const queryList = Array.isArray(queries) ? queries : [queries];

  for (const q of queryList) {
    try {
      const response = await axios.get('https://api.pexels.com/v1/search', {
        params: {
          query: q.trim(),
          per_page: 3
        },
        headers: {
          Authorization: process.env.PEXELS_API_KEY
        },
        timeout: 8000
      });

      const photo = response.data?.photos?.find((p) => p?.src?.landscape || p?.src?.large || p?.src?.medium || p?.src?.small);
      if (photo) {
        const chosen = photo?.src?.landscape || photo?.src?.large || photo?.src?.medium || photo?.src?.small || null;
        if (chosen) {
          console.log(`Pexels image for "${label || q}" found via query "${q}"`);
          return chosen;
        }
      }
    } catch (e) {
      console.warn(`Pexels query "${q}" failed:`, e.message || e);
    }
  }

  console.warn('Pexels: all query strategies exhausted for', label || queryList[0]);
  return null;
};

const getWikimediaImage = async (placeName) => {
  if (!placeName) return null;
  try {
    const searchResp = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch: placeName,
        format: 'json'
      },
      timeout: 8000
    });

    const title = searchResp.data?.query?.search?.[0]?.title;
    if (!title) return null;

    const imageResp = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        prop: 'pageimages',
        piprop: 'original',
        titles: title,
        format: 'json'
      },
      timeout: 8000
    });

    const pages = imageResp.data?.query?.pages || {};
    const firstPage = Object.values(pages)?.[0];
    const img = firstPage?.original?.source || null;
    if (img) {
      console.log(`Wikimedia image found for "${placeName}" via "${title}"`);
    }
    return img;
  } catch (e) {
    console.warn('Wikimedia lookup failed for', placeName, e.message || e);
    return null;
  }
};

const isProbablyValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  const value = url.trim();
  if (!/^https?:\/\//i.test(value)) return false;
  // Reject specific placeholder example values only.
  if (value.includes('photo-xxxxx') || value.includes('photo-yyyyy') || value.toLowerCase().includes('placeholder.com')) return false;
  return true;
};

const isReachableImageUrl = async (url) => {
  if (!isProbablyValidUrl(url)) return false;
  try {
    const headResp = await axios.head(url, {
      timeout: 5000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400
    });
    const contentType = String(headResp.headers?.['content-type'] || '').toLowerCase();
    return !contentType || contentType.includes('image');
  } catch (_err) {
    try {
      const getResp = await axios.get(url, {
        timeout: 5000,
        maxRedirects: 5,
        headers: { Range: 'bytes=0-0' },
        validateStatus: (status) => status >= 200 && status < 400,
        responseType: 'arraybuffer'
      });
      const contentType = String(getResp.headers?.['content-type'] || '').toLowerCase();
      return !contentType || contentType.includes('image');
    } catch (_err2) {
      return false;
    }
  }
};

const buildGuaranteedFallbackImage = (place) => {
  const seed = `${place?.name || 'place'}-${place?.location || 'location'}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'place';
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/1200/800`;
};

const stripCodeFences = (value = '') => String(value || '')
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```$/i, '')
  .trim();

const extractFirstJsonObject = (text = '') => {
  const source = String(text || '');
  const start = source.indexOf('{');
  if (start === -1) return '';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1).trim();
    }
  }

  const end = source.lastIndexOf('}');
  return end > start ? source.slice(start, end + 1).trim() : '';
};

const parseItineraryJsonSafely = async (rawContent = '') => {
  const cleaned = stripCodeFences(rawContent);
  const extracted = extractFirstJsonObject(cleaned);
  const candidates = [cleaned, extracted].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (_err) {
      // Try next candidate.
    }
  }

  const repairPrompt = `You are a JSON repair tool. Convert the following content into ONE valid JSON object only. Return strict JSON with no markdown fences, comments, or extra text.\n\n${cleaned}`;
  const repairResponse = await llm.invoke(repairPrompt);
  const repairedRaw = String(repairResponse?.content || repairResponse?.text || '').trim();
  const repairedClean = stripCodeFences(repairedRaw);
  const repairedExtracted = extractFirstJsonObject(repairedClean);
  const repairedCandidate = repairedExtracted || repairedClean;

  return JSON.parse(repairedCandidate);
};

const parseMaybeJson = (value) => {
  if (value == null) return null;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch (_e) {
    return value;
  }
};

const asArray = (value) => {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed;
  if (parsed == null) return [];
  return [parsed];
};

const asObject = (value) => {
  const parsed = parseMaybeJson(value);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  return null;
};

const asString = (value, fallback = '') => {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

const asNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const mergeUniqueVenueList = (current = [], additions = []) => {
  const merged = [];
  const seen = new Set();

  [...asArray(current), ...asArray(additions)].forEach((item) => {
    const venue = asObject(item) || {};
    const name = asString(venue.name).trim();
    const area = asString(venue.area || venue.vicinity).trim();
    const key = `${normalizePlaceName(name)}|${normalizePlaceName(area)}`;
    if (!name || seen.has(key)) return;
    seen.add(key);
    merged.push(venue);
  });

  return merged;
};

const normalizeStayVenue = (value = {}) => {
  const stay = asObject(value) || {};
  return {
    name: asString(stay.name),
    area: asString(stay.area),
    type: asString(stay.type),
    reason: asString(stay.reason),
    imageUrl: asString(stay.imageUrl),
    rating: asNumber(stay.rating, 0),
    price_level: asNumber(stay.price_level, 0),
    googleMapsUrl: asString(stay.googleMapsUrl),
    vicinity: asString(stay.vicinity),
    placeId: asString(stay.placeId),
  };
};

const normalizeDiningVenue = (value = {}) => {
  const spot = asObject(value) || {};
  return {
    name: asString(spot.name),
    cuisine: asString(spot.cuisine),
    area: asString(spot.area),
    best_for: asString(spot.best_for),
    imageUrl: asString(spot.imageUrl),
    rating: asNumber(spot.rating, 0),
    price_level: asNumber(spot.price_level, 0),
    googleMapsUrl: asString(spot.googleMapsUrl),
    vicinity: asString(spot.vicinity),
    placeId: asString(spot.placeId),
    distanceKm: asNumber(spot.distanceKm, 0),
    isOpenNow: Boolean(spot.isOpenNow),
  };
};

const enrichItineraryWithGoogleVenues = async (rawItineraryData, trip) => {
  const data = asObject(rawItineraryData) || {};
  const days = asArray(data.itinerary);

  const enrichedDays = await Promise.all(days.map(async (day) => {
    const d = asObject(day) || {};
    const dayCity = asString(d.city) || asString(d.stay?.area) || trip.destination || trip.origin;
    const center = await geocodeWithGeoapify(dayCity);

    const currentStay = normalizeStayVenue(d.stay);
    const currentDining = asArray(d.dining_places).map(normalizeDiningVenue);
    const currentStayOptions = asArray(d.stay_options).map(normalizeStayVenue);

    if (!center) {
      return {
        ...d,
        stay: currentStay,
        stay_options: currentStayOptions,
        dining_places: currentDining,
      };
    }

    try {
      const venueBundle = await fetchGoogleVenueRecommendations({
        lat: center.lat,
        lng: center.lng,
        city: dayCity,
        budget: trip.budget,
      });

      return {
        ...d,
        stay: currentStay.name || currentStay.area || venueBundle.stay?.name
          ? {
            ...venueBundle.stay,
            ...currentStay,
            name: currentStay.name || venueBundle.stay?.name || '',
            area: currentStay.area || venueBundle.stay?.area || dayCity,
            type: currentStay.type || venueBundle.stay?.type || 'hotel',
            reason: currentStay.reason || venueBundle.stay?.reason || `Recommended stay near ${dayCity}.`,
            imageUrl: currentStay.imageUrl || venueBundle.stay?.imageUrl || '',
            rating: currentStay.rating || venueBundle.stay?.rating || 0,
            price_level: currentStay.price_level || venueBundle.stay?.price_level || 0,
            googleMapsUrl: currentStay.googleMapsUrl || venueBundle.stay?.googleMapsUrl || '',
            vicinity: currentStay.vicinity || venueBundle.stay?.vicinity || '',
            placeId: currentStay.placeId || venueBundle.stay?.placeId || '',
          }
          : venueBundle.stay,
        stay_options: mergeUniqueVenueList(currentStayOptions, venueBundle.stay_options),
        dining_places: mergeUniqueVenueList(currentDining, venueBundle.dining_places),
      };
    } catch (error) {
      console.warn(`Google venue enrichment failed for ${dayCity}:`, error?.message || error);
      return {
        ...d,
        stay: currentStay,
        stay_options: currentStayOptions,
        dining_places: currentDining,
      };
    }
  }));

  return {
    ...data,
    itinerary: enrichedDays,
  };
};

const normalizeItineraryForSave = (rawData) => {
  const data = asObject(rawData) || {};
  const days = asArray(data.itinerary).map((day, index) => {
    const d = asObject(day) || {};
    const weatherDetailsObj = asObject(d.weather_details) || {};

    const activities = asArray(d.activities).map((activity) => {
      const a = asObject(activity) || {};
      return {
        title: asString(a.title),
        time: asString(a.time),
        duration_min: asNumber(a.duration_min, 0),
        description: asString(a.description),
        type: asString(a.type),
        location: asString(a.location)
      };
    });

    const food = asArray(d.food).map((meal) => {
      const f = asObject(meal) || {};
      return {
        meal: asString(f.meal),
        place: asString(f.place),
        type: asString(f.type)
      };
    });

    const dining_places = asArray(d.dining_places).map((spot) => {
      const s = asObject(spot) || {};
      return {
        name: asString(s.name),
        cuisine: asString(s.cuisine),
        area: asString(s.area),
        best_for: asString(s.best_for),
        imageUrl: asString(s.imageUrl),
        rating: asNumber(s.rating, 0),
        price_level: asNumber(s.price_level, 0),
        googleMapsUrl: asString(s.googleMapsUrl),
        vicinity: asString(s.vicinity),
        placeId: asString(s.placeId),
        distanceKm: asNumber(s.distanceKm, 0),
        isOpenNow: Boolean(s.isOpenNow),
      };
    });

    const stayOptions = asArray(d.stay_options).map((option) => {
      const s = asObject(option) || {};
      return {
        name: asString(s.name),
        area: asString(s.area),
        type: asString(s.type),
        reason: asString(s.reason),
        imageUrl: asString(s.imageUrl),
        rating: asNumber(s.rating, 0),
        price_level: asNumber(s.price_level, 0),
        googleMapsUrl: asString(s.googleMapsUrl),
        vicinity: asString(s.vicinity),
        placeId: asString(s.placeId),
        distanceKm: asNumber(s.distanceKm, 0),
      };
    });

    const travelObj = asObject(d.travel);
    const stayObj = asObject(d.stay);

    return {
      day: asNumber(d.day, index + 1),
      city: asString(d.city),
      theme: asString(d.theme),
      weather: asString(d.weather),
      weather_note: asString(d.weather_note),
      weather_details: {
        date: asString(weatherDetailsObj.date),
        condition: asString(weatherDetailsObj.condition),
        avg_temp_c: asNumber(weatherDetailsObj.avg_temp_c, null),
        min_temp_c: asNumber(weatherDetailsObj.min_temp_c, null),
        max_temp_c: asNumber(weatherDetailsObj.max_temp_c, null),
        avg_humidity: asNumber(weatherDetailsObj.avg_humidity, null),
        daily_chance_of_rain: asNumber(weatherDetailsObj.daily_chance_of_rain, null),
        total_precip_mm: asNumber(weatherDetailsObj.total_precip_mm, null),
        max_wind_kph: asNumber(weatherDetailsObj.max_wind_kph, null),
        uv: asNumber(weatherDetailsObj.uv, null),
        sunrise: asString(weatherDetailsObj.sunrise),
        sunset: asString(weatherDetailsObj.sunset),
        alerts_summary: asString(weatherDetailsObj.alerts_summary)
      },
      activities,
      travel: travelObj ? {
        from: asString(travelObj.from),
        to: asString(travelObj.to),
        duration: asString(travelObj.duration),
        mode: asString(travelObj.mode),
        note: asString(travelObj.note)
      } : null,
      food,
      dining_places,
      stay_options: stayOptions,
      local_explorations: asArray(d.local_explorations).map((item) => asString(item)).filter(Boolean),
      stay: stayObj ? {
        area: asString(stayObj.area),
        type: asString(stayObj.type),
        reason: asString(stayObj.reason),
        name: asString(stayObj.name),
        imageUrl: asString(stayObj.imageUrl),
        rating: asNumber(stayObj.rating, 0),
        price_level: asNumber(stayObj.price_level, 0),
        googleMapsUrl: asString(stayObj.googleMapsUrl),
        vicinity: asString(stayObj.vicinity),
        placeId: asString(stayObj.placeId),
      } : null,
      tips: asArray(d.tips).map((tip) => asString(tip)).filter(Boolean),
      summary: asString(d.summary)
    };
  });

  return {
    itinerary: days,
    total_estimated_cost: asNumber(data.total_estimated_cost ?? data.totalEstimatedCost, 0),
    packing_tips: asArray(data.packing_tips).map((tip) => asString(tip)).filter(Boolean),
    best_time_to_visit: asString(data.best_time_to_visit)
  };
};

const applyWeatherToItineraryData = ({ normalizedItinerary, weatherByDay = [], groupedPlacesByDay = [] }) => {
  const next = {
    ...normalizedItinerary,
    itinerary: (normalizedItinerary?.itinerary || []).map((day, index) => {
      const details = weatherByDay[index] || {};
      const mergedDetails = {
        date: details.date || day?.weather_details?.date || '',
        condition: details.condition || day?.weather_details?.condition || '',
        avg_temp_c: Number.isFinite(details.avg_temp_c) ? details.avg_temp_c : day?.weather_details?.avg_temp_c ?? null,
        min_temp_c: Number.isFinite(details.min_temp_c) ? details.min_temp_c : day?.weather_details?.min_temp_c ?? null,
        max_temp_c: Number.isFinite(details.max_temp_c) ? details.max_temp_c : day?.weather_details?.max_temp_c ?? null,
        avg_humidity: Number.isFinite(details.avg_humidity) ? details.avg_humidity : day?.weather_details?.avg_humidity ?? null,
        daily_chance_of_rain: Number.isFinite(details.daily_chance_of_rain) ? details.daily_chance_of_rain : day?.weather_details?.daily_chance_of_rain ?? null,
        total_precip_mm: Number.isFinite(details.total_precip_mm) ? details.total_precip_mm : day?.weather_details?.total_precip_mm ?? null,
        max_wind_kph: Number.isFinite(details.max_wind_kph) ? details.max_wind_kph : day?.weather_details?.max_wind_kph ?? null,
        uv: Number.isFinite(details.uv) ? details.uv : day?.weather_details?.uv ?? null,
        sunrise: details.sunrise || day?.weather_details?.sunrise || '',
        sunset: details.sunset || day?.weather_details?.sunset || '',
        alerts_summary: details.alerts_summary || day?.weather_details?.alerts_summary || ''
      };

      const weatherHeadline = formatWeatherHeadline(mergedDetails);
      const weatherNote = mergeWeatherNarrative(day.weather_note, mergedDetails);

      const dayPlaces = groupedPlacesByDay[index] || [];
      const activities = (day.activities || []).map((activity, activityIndex) => {
        const fallbackPlace = dayPlaces[activityIndex] || dayPlaces[0] || null;
        return {
          ...activity,
          description: getGenericPlaceReason(fallbackPlace, activity, day.city || details.city || '')
        };
      });

      return {
        ...day,
        city: day.city || details.city || '',
        weather: weatherHeadline,
        weather_note: weatherNote,
        weather_details: mergedDetails,
        activities
      };
    })
  };

  return next;
};

const realignItineraryToPlannedDays = ({ normalizedItinerary, groupedPlacesByDay = [], destination = '' }) => {
  const sourceDays = [...(normalizedItinerary?.itinerary || [])];
  const targetCities = groupedPlacesByDay.map((dayPlaces) => String(dayPlaces?.[0]?.location || destination || '').trim());

  const alignedDays = targetCities.map((targetCity, index) => {
    const targetKey = normalizePlaceName(targetCity);
    let matchIndex = sourceDays.findIndex((day) => normalizePlaceName(day?.city) === targetKey);

    if (matchIndex === -1 && targetKey) {
      matchIndex = sourceDays.findIndex((day) => {
        const dayKey = normalizePlaceName(day?.city || '');
        return dayKey && (dayKey.includes(targetKey) || targetKey.includes(dayKey));
      });
    }

    if (matchIndex === -1) matchIndex = 0;
    const pickedDay = matchIndex >= 0 ? sourceDays.splice(matchIndex, 1)[0] : null;

    return {
      ...(pickedDay || {}),
      day: index + 1,
      city: targetCity || pickedDay?.city || destination || ''
    };
  });

  // If model returned extra days, append safely while preserving order.
  sourceDays.forEach((day) => {
    alignedDays.push({
      ...day,
      day: alignedDays.length + 1,
    });
  });

  return {
    ...normalizedItinerary,
    itinerary: alignedDays,
  };
};

const buildDurationLabelFromDistance = (km) => {
  const safeKm = Number.isFinite(km) ? km : 0;
  if (safeKm <= 0) return 'Approx 3-6 hours';
  const hours = Math.max(1, Math.round((safeKm / 45) * 10) / 10);
  return `${hours} hours (~${Math.max(1, Math.round(safeKm))} km)`;
};

const ensureInterCityTransitData = async ({ itineraryBundle, origin = '' }) => {
  const days = Array.isArray(itineraryBundle?.itinerary) ? itineraryBundle.itinerary : [];
  if (!days.length) return itineraryBundle;

  const centerCache = new Map();
  const getCenter = async (city) => {
    const key = normalizePlaceName(city || '');
    if (!key) return null;
    if (centerCache.has(key)) return centerCache.get(key);
    const center = await geocodeWithGeoapify(city);
    centerCache.set(key, center || null);
    return center || null;
  };

  const nextDays = [];
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index] || {};
    const currentCity = String(day.city || day?.activities?.[0]?.location || '').trim();
    const previousCity = String(index === 0 ? origin : (nextDays[index - 1]?.city || days[index - 1]?.city || origin)).trim();

    const isTransferDay = Boolean(currentCity && previousCity && normalizePlaceName(currentCity) !== normalizePlaceName(previousCity));
    const activities = Array.isArray(day.activities) ? [...day.activities] : [];

    if (isTransferDay && activities.length) {
      const firstTitle = String(activities[0]?.title || '').trim();
      if (firstTitle && !/^after\s+reaching\s+/i.test(firstTitle)) {
        activities[0] = {
          ...activities[0],
          title: `After reaching ${currentCity}, ${firstTitle.charAt(0).toLowerCase()}${firstTitle.slice(1)}`
        };
      }
    }

    if (!isTransferDay) {
      nextDays.push({
        ...day,
        travel: null,
        activities,
      });
      continue;
    }

    const currentTravel = day.travel || {};
    const fromCity = String(currentTravel.from || previousCity || '').trim();
    const toCity = String(currentTravel.to || currentCity || '').trim();

    let durationLabel = String(currentTravel.duration || '').trim();
    let note = String(currentTravel.note || '').trim();

    if (!durationLabel || !note) {
      const [fromCenter, toCenter] = await Promise.all([getCenter(fromCity), getCenter(toCity)]);
      if (fromCenter && toCenter && Number.isFinite(fromCenter.lat) && Number.isFinite(fromCenter.lng) && Number.isFinite(toCenter.lat) && Number.isFinite(toCenter.lng)) {
        const km = distanceKm({ lat: Number(fromCenter.lat), lng: Number(fromCenter.lng) }, { lat: Number(toCenter.lat), lng: Number(toCenter.lng) });
        if (!durationLabel) durationLabel = buildDurationLabelFromDistance(km);
        if (!note) note = `Inter-city transfer of about ${Math.max(1, Math.round(km))} km before sightseeing.`;
      }
    }

    if (!durationLabel) durationLabel = 'Approx 3-6 hours';
    if (!note) note = `Travel from ${fromCity} to ${toCity} before activities.`;

    nextDays.push({
      ...day,
      activities,
      travel: {
        from: fromCity,
        to: toCity,
        mode: String(currentTravel.mode || 'car'),
        duration: durationLabel,
        note,
      }
    });
  }

  return {
    ...itineraryBundle,
    itinerary: nextDays,
  };
};

const applySelectedInterCityModes = ({ itineraryBundle, segmentModes = {} }) => {
  const days = Array.isArray(itineraryBundle?.itinerary) ? itineraryBundle.itinerary : [];
  if (!days.length) return itineraryBundle;

  const normalizeKey = (value = '') => String(value || '').toLowerCase().split(',')[0].trim();
  const formatDurationFromMinutes = (value) => {
    const minutes = Math.round(Number(value) || 0);
    if (!Number.isFinite(minutes) || minutes <= 0) return '';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const findSelection = (travel = {}) => {
    const from = normalizeKey(travel?.from);
    const to = normalizeKey(travel?.to);
    if (!from || !to) return null;

    const direct = `${from}|${to}`;
    const reverse = `${to}|${from}`;
    if (segmentModes[direct]) return segmentModes[direct];
    if (segmentModes[reverse]) return segmentModes[reverse];

    const fuzzy = Object.entries(segmentModes).find(([key]) => {
      const [left, right] = String(key || '').split('|').map(normalizeKey);
      return left && right && ((left.includes(from) || from.includes(left)) && (right.includes(to) || to.includes(right)));
    });
    return fuzzy?.[1] || null;
  };

  const nextDays = days.map((day) => {
    if (!day?.travel) return day;
    const selection = findSelection(day.travel);
    if (!selection) return day;

    return {
      ...day,
      travel: {
        ...day.travel,
        mode: String(selection?.mode || day.travel.mode || 'car'),
        duration: formatDurationFromMinutes(selection?.timeMin) || day.travel.duration || '',
      },
    };
  });

  return {
    ...itineraryBundle,
    itinerary: nextDays,
  };
};

const createTrip = asyncHandler(async (req, res) => {
  const { origin, destination, stops, budget, dates, stayPreferences } = req.body;
  const userId = req.user?._id || null; 

  const trip = await Travel.create({
    user: userId,
    origin,
    destination,
    stops: stops || [],
    budget,
    dates,
    stayPreferences: stayPreferences || {},
  });

  res.status(201).json({
    success: true,
    trip
  });
});

// Generate candidate places using Geoapify + LLM selection
const generatePlaces = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  console.log('DEBUG generatePlaces called for tripId', tripId);
  console.log('[Geoapify] runtime key fingerprint:', maskKey(getGeoapifyKey()));
  const trip = await Travel.findById(tripId);
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
  const days = getTripDaysFromDates(trip.dates);
  const checkpointNames = [...new Set([...(trip.stops || []), trip.destination].map((name) => String(name || '').trim()).filter(Boolean))];

  console.log('[Geoapify] checkpoints for discovery:', checkpointNames);

  const discoveredByCheckpoint = await Promise.all(
    checkpointNames.map(async (checkpointName) => {
      try {
        const center = await geocodeWithGeoapify(checkpointName);
        if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
          console.warn(`[Geoapify] geocode unavailable for ${checkpointName}`);
          return [];
        }

        console.log(`[Geoapify] geocode ${checkpointName}:`, {
          lat: center.lat,
          lng: center.lng,
          name: center.name,
        });

        const fetchedPlaces = await fetchGeoapifyPlaces({ lat: center.lat, lng: center.lng, radius: 70000 });

        console.log(`[Geoapify] raw places for ${checkpointName}: count=${fetchedPlaces.length}`);
        if (fetchedPlaces.length) {
          console.log(`[Geoapify] sample for ${checkpointName}:`, fetchedPlaces.slice(0, 8).map((place) => ({
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            popularity: place.popularity,
          })));
        }

        return fetchedPlaces
          // Keep place assignments tight to checkpoint to avoid wrong-city cards.
          .filter((place) => distanceKm({ lat: center.lat, lng: center.lng }, { lat: place.lat, lng: place.lng }) <= 45)
          .map((place) => ({
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            rating: place.rating,
            popularity: place.popularity,
            type: place.category || 'attraction',
            location: checkpointName,
            best_visit_reason: '',
            imageUrl: ''
          }));
      } catch (error) {
        console.warn(`Geoapify fetch failed for ${checkpointName}:`, {
          status: error?.response?.status || null,
          message: error?.message || String(error),
          data: error?.response?.data || null,
          key: maskKey(getGeoapifyKey()),
        });
        return [];
      }
    })
  );

  const discoveredPlaces = discoveredByCheckpoint.flat();
  const discoveredUnique = [];
  const discoveredKeys = new Set();

  discoveredPlaces.forEach((place) => {
    const key = `${normalizePlaceName(place.name)}|${normalizePlaceName(place.location)}`;
    if (!place.name || discoveredKeys.has(key)) return;
    discoveredKeys.add(key);
    discoveredUnique.push(place);
  });

  console.log('[Geoapify] deduplicated candidate places:', {
    total: discoveredUnique.length,
    byCheckpoint: checkpointNames.map((name) => ({
      checkpoint: name,
      count: discoveredUnique.filter((place) => normalizePlaceName(place.location) === normalizePlaceName(name)).length,
    })),
  });

  if (!discoveredUnique.length) {
    return res.status(502).json({
      success: false,
      message: 'No places were discovered for this route. Check GEOAPIFY_API_KEY and destination input.'
    });
  }

  const rankedCandidates = buildStrictShortlist(discoveredUnique, trip.destination, days);

  // Strict day-based cap: max 3 visits per day total.
  const maxSelectCount = Math.min(days * 3, rankedCandidates.length);

  let llmSelected = [];
  try {
    const parsed = await selectPlacesWithLLM({ candidates: rankedCandidates, maxCount: maxSelectCount, days, destination: trip.destination });
    console.log('[LLM] selected raw place count:', Array.isArray(parsed) ? parsed.length : 0);
    if (Array.isArray(parsed) && parsed.length) {
      console.log('[LLM] selected raw place sample:', parsed.slice(0, 12));
    }

    llmSelected = parsed
      .map((item) => {
        if (!item || typeof item !== 'object') return null;

        const name = typeof item.name === 'string' ? item.name.trim() : '';
        if (!name) return null;

        const location = (typeof item.location === 'string' && item.location.trim()) || trip.destination;
        const lat = toFiniteNumber(item.lat);
        const lng = toFiniteNumber(item.lng);
        const rating = toFiniteNumber(item.rating);
        const popularity = toFiniteNumber(item.popularity);

        const matchingCandidate = rankedCandidates.find((candidate) => {
          const sameName = normalizePlaceName(candidate.name) === normalizePlaceName(name);
          const sameLocation = normalizePlaceName(candidate.location) === normalizePlaceName(location);
          return sameName && (sameLocation || (!sameLocation && normalizePlaceName(location) === normalizePlaceName(trip.destination)));
        });

        return {
          name,
          location: matchingCandidate?.location || location,
          lat: lat ?? matchingCandidate?.lat ?? null,
          lng: lng ?? matchingCandidate?.lng ?? null,
          rating: rating ?? matchingCandidate?.rating ?? null,
          popularity: popularity ?? matchingCandidate?.popularity ?? null,
          type: (item.type || matchingCandidate?.type || 'attraction').toString(),
          best_visit_reason: (item.best_visit_reason || item.bestVisitReason || item.why_visit || '').toString().trim() || `Popular and high-value stop near ${matchingCandidate?.location || location}.`,
          imageUrl: ''
        };
      })
      .filter((item) => item && item.name && Number.isFinite(item.lat) && Number.isFinite(item.lng));

    console.log('[LLM] selected normalized places:', {
      total: llmSelected.length,
      byCheckpoint: checkpointNames.map((name) => ({
        checkpoint: name,
        count: llmSelected.filter((place) => normalizePlaceName(place.location) === normalizePlaceName(name)).length,
      })),
      sample: llmSelected.slice(0, 12).map((place) => ({
        name: place.name,
        location: place.location,
        lat: place.lat,
        lng: place.lng,
      })),
    });
  } catch (err) {
    console.warn('LLM place selection fallback:', err?.message || err);
    llmSelected = [];
  }

  const scorePlace = (place) => {
    const popularity = Number(place?.popularity) || 0;
    const rating = Number(place?.rating) || 0;
    return (popularity * 2.0) + (rating * 1.2);
  };

  const selectedBase = llmSelected.length
    ? enforceDestinationPriority({
      selected: [...llmSelected].sort((a, b) => scorePlaceForSelection(b) - scorePlaceForSelection(a)),
      candidates: rankedCandidates,
      destination: trip.destination,
      maxCount: maxSelectCount,
      days,
    })
    : fallbackSelectPlaces(rankedCandidates, maxSelectCount, trip.destination, days);

  const priorityOrdered = sortPlacesBySelectionScore(selectedBase).map((place) => ({
    ...place,
    best_visit_reason: (place.best_visit_reason || '').trim() || `Popular highlight near ${place.location}.`,
  }));

  const uniquePlaces = priorityOrdered.filter((place, idx, self) => {
    const key = `${normalizePlaceName(place.name)}|${normalizePlaceName(place.location)}`;
    return place.name && self.findIndex((candidate) => `${normalizePlaceName(candidate.name)}|${normalizePlaceName(candidate.location)}` === key) === idx;
  });

  const placesWithImages = await Promise.all(uniquePlaces.map(async (place) => {
    const prefilled = isProbablyValidUrl(place.imageUrl) ? place.imageUrl : '';
    if (prefilled) {
      const ok = await isReachableImageUrl(prefilled);
      if (ok) return { ...place, imageUrl: prefilled };
    }

    const queryVariants = buildQueryVariants(place.name, place.location, place.type);

    const [unsplashResult, pexelsResult, wikimediaResult] = await Promise.allSettled([
      getUnsplashImage(queryVariants, place.name),
      getPexelsImage(queryVariants, place.name),
      getWikimediaImage(place.name),
    ]);

    const candidates = [unsplashResult, pexelsResult, wikimediaResult]
      .filter((result) => result.status === 'fulfilled' && isProbablyValidUrl(result.value))
      .map((result) => result.value);

    if (candidates.length > 0) {
      const reachabilityChecks = await Promise.allSettled(
        candidates.map((url) => isReachableImageUrl(url).then((ok) => (ok ? url : null)))
      );
      const validUrl = reachabilityChecks
        .filter((result) => result.status === 'fulfilled' && result.value)
        .map((result) => result.value)[0] || null;

      if (validUrl) return { ...place, imageUrl: validUrl };
    }

    return { ...place, imageUrl: buildGuaranteedFallbackImage(place) };
  }));

  trip.candidatePlaces = placesWithImages;
  trip.status = 'places_generated';

  try {
    await trip.save();
  } catch (saveErr) {
    console.error('ERROR saving trip candidatePlaces', saveErr.message || saveErr, 'places', uniquePlaces.map(p => p.name));
    return res.status(500).json({ success: false, message: 'Unable to save candidate places.', error: saveErr.message || saveErr });
  }

  return res.json({ success: true, places: placesWithImages });
});

// Update selected places
const selectPlaces = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const { selectedPlaces } = req.body;

  console.log('\n========== SELECT PLACES DEBUG ==========');
  console.log('📍 Trip ID:', tripId);
  console.log('📋 Selected Places Count:', selectedPlaces?.length);
  console.log('📋 Selected Places:', JSON.stringify(selectedPlaces.slice(0, 2), null, 2));

  if (!selectedPlaces || selectedPlaces.length === 0) {
    console.error('❌ No places selected');
    return res.status(400).json({ success: false, message: 'No places selected' });
  }

  const normalizedSelected = selectedPlaces.map((p) => {
    const candidateUrl = p.imageUrl || p.image_url || '';
    return {
      name: p.name || '',
      type: p.type || 'unknown',
      location: p.location || '',
      lat: toFiniteNumber(p.lat),
      lng: toFiniteNumber(p.lng),
      rating: toFiniteNumber(p.rating),
      popularity: toFiniteNumber(p.popularity),
      best_visit_reason: p.best_visit_reason || p.bestVisitReason || '',
      imageUrl: isProbablyValidUrl(candidateUrl) ? candidateUrl : FALLBACK_IMAGE
    };
  });

  console.log('✅ Normalized places count:', normalizedSelected.length);

  try {
    const trip = await Travel.findByIdAndUpdate(tripId, {
      selectedPlaces: normalizedSelected,
      status: 'places_selected'
    }, { returnDocument: 'after' });

    if (!trip) {
      console.error('❌ Trip not found:', tripId);
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    console.log('✅ Trip updated successfully');
    console.log('📊 New Trip Status:', trip.status);
    console.log('📊 Selected Places in DB:', trip.selectedPlaces.length);
    console.log('=========================================\n');

    res.json({
      success: true,
      trip
    });
  } catch (error) {
    console.error('❌ Error updating trip:', error.message);
    console.error('Stack:', error.stack);
    console.log('=========================================\n');
    res.status(500).json({ success: false, message: 'Failed to select places', error: error.message });
  }
});

// Generate itinerary
const generateItinerary = asyncHandler(async (req, res) => {
  const { tripId } = req.params;

  console.log('\n========== GENERATE ITINERARY DEBUG ==========');
  console.log('📍 Trip ID:', tripId);

  const trip = await Travel.findById(tripId);

  if (!trip) {
    console.error('❌ Trip not found:', tripId);
    console.log('================================================\n');
    return res.status(404).json({ success: false, message: 'Trip not found' });
  }

  console.log('✅ Trip found');
  console.log('📊 Trip Status:', trip.status);
  console.log('📊 Selected Places:', trip.selectedPlaces?.length || 0);
  console.log('📊 Trip Destination:', trip.destination);
  console.log('📊 Trip Dates:', trip.dates?.length || 0);

  if (trip.status !== 'places_selected') {
    console.error('❌ Invalid trip status. Expected: places_selected, Got:', trip.status);
    console.log('📝 Available trip info:', {
      tripId: trip._id,
      status: trip.status,
      selectedPlacesCount: trip.selectedPlaces?.length,
      candidatePlacesCount: trip.candidatePlaces?.length
    });
    console.log('================================================\n');
    return res.status(400).json({ 
      success: false, 
      message: `Places not selected yet. Current status: ${trip.status}`,
      tripStatus: trip.status,
      selectedPlaces: trip.selectedPlaces?.length
    });
  }

  console.log('✅ Trip status is valid (places_selected)');
  const tripDays = getTripDaysFromDates(trip.dates);
  const groupedPlan = buildNearbyDayGrouping(trip.selectedPlaces || [], tripDays, buildRouteCitySequence(trip));
  const weatherByDay = await buildWeatherByDayInput({
    groupedPlacesByDay: groupedPlan.groupedPlacesByDay,
    tripDates: trip.dates,
    tripDays,
    destination: trip.destination
  });

  console.log('✅ Weather input prepared for itinerary:', weatherByDay.map((item, index) => ({
    day: index + 1,
    city: item.city,
    date: item.date,
    condition: item.condition,
    avg_temp_c: item.avg_temp_c,
    rain: item.daily_chance_of_rain
  })));

  const prompt = buildItineraryPrompt({
    origin: trip.origin,
    destination: trip.destination,
    days: tripDays,
    selectedPlaces: groupedPlan.orderedPlaces,
    groupedPlacesByDay: groupedPlan.groupedPlacesByDay,
    weatherByDay,
    budget: trip.budget,
    dates: trip.dates
  });

  console.log('✅ Prompt built, length:', prompt.length, 'characters');

  let itineraryData;
  try {
    console.log('🔄 Calling LLM...');
    const response = await withTimeout(llm.invoke(prompt), 20000, 'LLM itinerary generation');
    const content = (response.content || response.text || '{}').toString();
    
    console.log('✅ LLM response received, length:', content.length);
    console.log('📝 Response preview:', content.substring(0, 200));
    
    itineraryData = await parseItineraryJsonSafely(content);
    console.log('✅ Response parsed successfully');
    console.log('📊 Itinerary days:', itineraryData.itinerary?.length);
  } catch (error) {
    console.warn('⚠️ LLM generation failed:', error.message);
    console.log('📝 Using fallback itinerary...');
    
    // Generate simple fallback itinerary
    itineraryData = {
      itinerary: groupedPlan.groupedPlacesByDay.map((dayPlaces, index) => {
        const firstPlace = dayPlaces?.[0] || null;
        const currentCity = firstPlace?.location || trip.destination;
        const prevDayFirst = groupedPlan.groupedPlacesByDay[index - 1]?.[0] || null;
        const previousCity = index === 0
          ? trip.origin
          : (prevDayFirst?.location || trip.origin);
        const isTransferDay = index > 0 && previousCity !== currentCity;

        const activities = (dayPlaces || []).map((place, activityIndex) => {
          const safePlaceName = String(place?.name || place?.location || currentCity || 'local highlight')
            .replace(/\b(undefined|null|n\/a|na)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim() || 'local highlight';
          const fallbackDescription = getGenericPlaceReason(place, { location: place?.location || currentCity }, currentCity);
          const safeDescription = String(place?.best_visit_reason || '')
            .replace(/\b(undefined|null)\b/gi, '')
            .trim() || fallbackDescription;

          return {
          title: isTransferDay && activityIndex === 0
            ? `After reaching ${currentCity}, visit ${safePlaceName}`
            : `Visit ${safePlaceName}`,
          time: activityIndex === 0 ? '9:00 AM - 11:00 AM' : activityIndex === 1 ? '12:00 PM - 2:00 PM' : '3:00 PM - 5:00 PM',
          duration_min: 120,
          description: safeDescription,
          type: 'outdoor',
          location: place.location || currentCity || 'Main area',
          };
        });

        if (!activities.length) {
          activities.push({
            title: `Light exploration around ${currentCity}`,
            time: '10:00 AM - 12:00 PM',
            duration_min: 120,
            description: 'Buffer day for relaxed local sightseeing.',
            type: 'outdoor',
            location: currentCity || 'Main area',
          });
        }

        const dayWeather = weatherByDay[index] || {};
        return {
          day: index + 1,
          city: currentCity,
          theme: firstPlace?.type || 'Sightseeing',
          weather: formatWeatherHeadline(dayWeather),
          weather_note: formatWeatherNote(dayWeather) || summarizeWeatherForNarrative(dayWeather),
          weather_details: dayWeather,
          activities,
          travel: isTransferDay ? {
            from: previousCity,
            to: currentCity,
            duration: '3-6 hours',
            mode: 'car',
            note: `Travel from ${previousCity} to ${currentCity} first, then start sightseeing.`
          } : null,
          food: [
            {
              meal: 'Lunch',
              place: `Local restaurant in ${currentCity}`,
              type: 'local'
            }
          ],
          dining_places: [
            {
              name: `${currentCity} Heritage Kitchen`,
              cuisine: 'Regional cuisine',
              area: currentCity,
              best_for: 'Popular local thali and signature dishes'
            }
          ],
          local_explorations: [
            `${currentCity} old market walk`,
            `${currentCity} local artisan lane`
          ],
          stay: {
            area: currentCity,
            type: 'mid-range',
            reason: 'Close to attractions'
          },
          tips: [
            'Wear comfortable shoes',
            'Carry water and sunscreen'
          ],
          summary: isTransferDay
            ? `Traveled from ${previousCity} to ${currentCity}, then explored nearby attractions.`
            : `Explored nearby attractions around ${currentCity}.`
        };
      }),
      total_estimated_cost: trip.budget,
      packing_tips: [
        'Light, breathable clothing',
        'Comfortable walking shoes',
        'Sun protection',
        'Power bank'
      ],
      best_time_to_visit: 'Check weather forecast before the trip'
    };
  }

  try {
    itineraryData = await enrichItineraryWithGoogleVenues(itineraryData, trip);
    console.log('✅ Google venue enrichment completed');
  } catch (enrichmentError) {
    console.warn('⚠️ Google venue enrichment skipped:', enrichmentError.message || enrichmentError);
  }

  try {
    const normalizedItinerary = normalizeItineraryForSave(itineraryData);
    const dayAlignedItinerary = realignItineraryToPlannedDays({
      normalizedItinerary,
      groupedPlacesByDay: groupedPlan.groupedPlacesByDay,
      destination: trip.destination,
    });
    const weatherAwareItinerary = applyWeatherToItineraryData({
      normalizedItinerary: dayAlignedItinerary,
      weatherByDay,
      groupedPlacesByDay: groupedPlan.groupedPlacesByDay
    });
    const transitAwareItinerary = await ensureInterCityTransitData({
      itineraryBundle: weatherAwareItinerary,
      origin: trip.origin,
    });
    const selectedSegmentModes = asObject(trip?.stayPreferences?.segmentModes) || {};
    const modeAwareItinerary = applySelectedInterCityModes({
      itineraryBundle: transitAwareItinerary,
      segmentModes: selectedSegmentModes,
    });
    console.log('✅ Normalized itinerary days:', modeAwareItinerary.itinerary.length);

    trip.itinerary = modeAwareItinerary;
    trip.status = 'itinerary_generated';
    const savedTrip = await trip.save();
    
    console.log('✅ Trip saved successfully');
    console.log('📊 Final trip status:', savedTrip.status);
    console.log('================================================\n');

    res.json({
      success: true,
      itinerary: savedTrip.itinerary
    });
  } catch (error) {
    console.error('❌ Error saving trip:', error.message);
    console.error('Stack:', error.stack);
    console.log('================================================\n');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save itinerary', 
      error: error.message 
    });
  }
});

const computeRoute = asyncHandler(async (req, res) => {
  const { waypoints = [], mode = 'drive', options = {} } = req.body || {};
  const result = await computeRouteService({ waypoints, mode, options });

  if (!result.ok) {
    return res.status(200).json({
      success: false,
      error: result.error,
      route: result.route,
      cacheHit: Boolean(result.cacheHit),
      inputHash: result.inputHash || null,
    });
  }

  return res.json({
    success: true,
    route: result.route,
    cacheHit: Boolean(result.cacheHit),
    inputHash: result.inputHash,
  });
});

const getFlightCost = asyncHandler(async (req, res) => {
  const from = String(req.body?.from || '').trim();
  const to = String(req.body?.to || '').trim();

  if (!from || !to) {
    return res.status(200).json({ success: true, minFare: null, fallback: true });
  }

  const fromCode = resolveIataForCity(from) || null;
  const toCode = resolveIataForCity(to) || null;

  if (!fromCode || !toCode) {
    return res.status(200).json({ success: true, minFare: null, fallback: true });
  }

  const rapidApiKey = String(process.env.RAPIDAPI_KEY || process.env.KIWI_RAPIDAPI_KEY || '').trim();
  const rapidApiHost = 'kiwi-com-cheap-flights.p.rapidapi.com';

  if (!rapidApiKey) {
    return res.status(200).json({ success: true, minFare: null, fallback: true });
  }

  try {
    const response = await axios.get('https://kiwi-com-cheap-flights.p.rapidapi.com/round-trip', {
      params: {
        source: fromCode,
        destination: toCode,
        currency: 'INR',
        adults: 1,
      },
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': rapidApiHost,
      },
      timeout: 15000,
    });

    const summary = extractKiwiItinerarySummary(response.data);
    const minFare = summary?.price ? Math.round(summary.price / 2) : null;
    const oneWayMinutes = summary?.duration || null;

    return res.status(200).json({
      success: true,
      minFare,
      oneWayMinutes,
      currency: 'INR',
      fallback: minFare === null,
    });
  } catch (error) {
    return res.status(200).json({ success: true, minFare: null, fallback: true });
  }
});

const estimateBudget = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const trip = await Travel.findById(tripId);

  if (!trip) {
    return res.status(404).json({ success: false, message: 'Trip not found' });
  }

  const days = getTripDaysFromDates(trip.dates);
  const itineraryDays = Array.isArray(trip?.itinerary?.itinerary)
    ? trip.itinerary.itinerary
    : Array.isArray(trip?.itinerary)
      ? trip.itinerary
      : [];

  const segmentModes = asObject(req.body?.segmentModes)
    || asObject(trip?.stayPreferences?.segmentModes)
    || asObject(trip?.segmentModes)
    || {};

  function estimateHotelCost(priceLevel, type) {
    const ranges = {
      0: [800, 1800],
      1: [600, 1200],
      2: [1200, 2800],
      3: [2800, 5500],
      4: [5500, 15000],
    };
    const r = ranges[Number(priceLevel)] || ranges[0];
    return { low: r[0], high: r[1], mid: Math.round((r[0] + r[1]) / 2) };
  }

  function estimateFoodCost(totalBudget, totalDays) {
    const daily = Math.round(Number(totalBudget || 0) / Math.max(1, totalDays));
    const food = Math.round(daily * 0.2);
    return Math.min(2500, Math.max(400, food));
  }

  function estimateActivitiesCost(activities) {
    return (Array.isArray(activities) ? activities.length : 0) * 300;
  }

  const normalizeBudgetKey = (value = '') => String(value || '').toLowerCase().trim();
  const findTransportForDay = (travel = {}) => {
    const from = normalizeBudgetKey(travel?.from);
    const to = normalizeBudgetKey(travel?.to);
    const directKey = `${from}|${to}`;
    const reverseKey = `${to}|${from}`;
    const exact = segmentModes[directKey] || segmentModes[reverseKey] || null;
    if (exact) return exact;

    const fuzzy = Object.entries(segmentModes).find(([key]) => {
      const [left, right] = String(key || '').split('|').map(normalizeBudgetKey);
      return (left && right) && ((left.includes(from) || from.includes(left)) && (right.includes(to) || to.includes(right)));
    });

    return fuzzy?.[1] || null;
  };

  const estimateCabTransitCost = async (travel = {}) => {
    const from = String(travel?.from || '').trim();
    const to = String(travel?.to || '').trim();
    if (!from || !to) return { cost: 0, note: 'Transit cost unavailable' };

    const [fromCenter, toCenter] = await Promise.all([geocodeWithGeoapify(from), geocodeWithGeoapify(to)]);
    if (!fromCenter || !toCenter || !Number.isFinite(fromCenter.lat) || !Number.isFinite(fromCenter.lng) || !Number.isFinite(toCenter.lat) || !Number.isFinite(toCenter.lng)) {
      return {
        cost: Math.max(300, Math.round((String(from).length + String(to).length) * 25)),
        note: `Rough cab estimate for ${from} to ${to}`,
      };
    }

    const km = distanceKm({ lat: Number(fromCenter.lat), lng: Number(fromCenter.lng) }, { lat: Number(toCenter.lat), lng: Number(toCenter.lng) });
    const cost = Math.max(250, Math.round(150 + (km * 13)));
    return {
      cost,
      note: `Approx cab/taxi transfer of ${Math.max(1, Math.round(km))} km`,
    };
  };

  const geoCache = new Map();
  const selectedPlacePoints = Array.isArray(trip?.selectedPlaces) ? trip.selectedPlaces : [];

  const cleanTransitLabel = (value = '') => String(value || '')
    .toLowerCase()
    .replace(/^(visit|explore|discover|tour|walk through|stroll through|shopping at|shopping in|boat ride on|lunch at|dinner at|breakfast at|morning visit to|afternoon visit to|evening visit to)\s+/i, '')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
    .trim();

  const findSelectedPoint = (label = '') => {
    const target = cleanTransitLabel(label) || normalizeBudgetKey(label);
    if (!target) return null;

    const match = selectedPlacePoints.find((place) => {
      const name = cleanTransitLabel(place?.name) || normalizeBudgetKey(place?.name);
      const location = cleanTransitLabel(place?.location) || normalizeBudgetKey(place?.location);
      return (
        (name && (name === target || name.includes(target) || target.includes(name))) ||
        (location && (location === target || location.includes(target) || target.includes(location)))
      );
    });

    const lat = Number(match?.lat);
    const lng = Number(match?.lng ?? match?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  };

  const resolvePoint = async (label = '') => {
    const key = normalizeBudgetKey(label);
    if (!key) return null;

    const selectedPoint = findSelectedPoint(label);
    if (selectedPoint) return selectedPoint;

    if (geoCache.has(key)) return geoCache.get(key);
    const point = await geocodeWithGeoapify(label);
    geoCache.set(key, point || null);
    return point || null;
  };

  const estimateIntraDayCabCost = async (day = {}) => {
    const activities = Array.isArray(day?.activities) ? day.activities : [];
    if (activities.length < 2) return { cost: 0, distanceKm: 0 };

    const labels = activities
      .map((activity) => String(activity?.location || cleanTransitLabel(activity?.title) || day?.city || '').trim())
      .filter(Boolean);
    if (labels.length < 2) return { cost: 0, distanceKm: 0 };

    const points = await Promise.all(labels.map((label) => resolvePoint(label)));

    let totalKm = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      if (!from || !to || !Number.isFinite(from.lat) || !Number.isFinite(from.lng) || !Number.isFinite(to.lat) || !Number.isFinite(to.lng)) continue;
      totalKm += distanceKm(
        { lat: Number(from.lat), lng: Number(from.lng) },
        { lat: Number(to.lat), lng: Number(to.lng) },
      );
    }

    const roundedKm = Math.max(0, Math.round(totalKm));
    if (roundedKm <= 0) return { cost: 0, distanceKm: 0 };

    // Intra-day taxi/cab cost mirrors planner road rate calculations.
    return {
      cost: Math.round(roundedKm * 13),
      distanceKm: roundedKm,
    };
  };

  const perDay = await Promise.all(
    itineraryDays.map(async (day, index) => {
      const [hotel, food, activities, fallbackTransport, intraDay] = await Promise.all([
        Promise.resolve(estimateHotelCost(day?.stay?.price_level, day?.stay?.type)),
        Promise.resolve(estimateFoodCost(trip.budget, days)),
        Promise.resolve(estimateActivitiesCost(day?.activities)),
        estimateCabTransitCost(day?.travel),
        estimateIntraDayCabCost(day),
      ]);
      const transportMode = findTransportForDay(day?.travel);
      const hasInterDayLeg = Boolean(day?.travel?.from && day?.travel?.to);
      const interDayCost = hasInterDayLeg
        ? Number(transportMode?.cost || fallbackTransport.cost || 0)
        : 0;
      const intraDayCost = Number(intraDay?.cost || 0);
      const totalTransportCost = interDayCost + intraDayCost;
      const transport = {
        cost: totalTransportCost,
        mode: transportMode?.mode || (hasInterDayLeg ? (day?.travel?.mode || 'cab') : 'cab'),
        interDayCost,
        intraDayCost,
        intraDayDistanceKm: Number(intraDay?.distanceKm || 0),
        note: transportMode
          ? 'Inter-day uses planner selection + intra-day cab/taxi by distance'
          : hasInterDayLeg
            ? `${fallbackTransport.note} + intra-day cab/taxi by distance`
            : 'Intra-day cab/taxi by calculated distance',
      };
      const total = Math.round(transport.cost + hotel.mid + food + activities);
      const dailyBudget = (Number(trip.budget || 0) / Math.max(1, days)) * 1.2;

      return {
        day: Number(day?.day || index + 1),
        city: day?.city || '',
        transport,
        hotel,
        food,
        activities,
        total,
        withinBudget: total < dailyBudget,
        recommendations: [],
      };
    })
  );

  let smartTips = [];
  try {
    const prompt = `You are a smart travel budget advisor for Indian trips.
Given this trip data, return ONLY valid JSON (no markdown):
{
  "perDayRecs": {
    "1": ["tip1", "tip2"],
    "2": ["tip1"]
  },
  "smartTips": ["overall tip 1", "overall tip 2", "overall tip 3"]
}

Trip: ${trip.origin} to ${trip.destination}, ${days} days, budget ₹${trip.budget}
Per day breakdown: ${JSON.stringify(perDay.map((item) => ({
      day: item.day,
      city: item.city,
      hotel: item.hotel.mid,
      food: item.food,
      activities: item.activities,
      transport: item.transport.cost,
      total: item.total,
      over: !item.withinBudget,
    })))}

Focus on: entry fee timings, cheaper alternatives, booking tips, budget warnings.
Keep each tip under 80 characters. Return raw JSON only.`;

    const response = await llm.invoke(prompt);
    const raw = String(response?.content || response?.text || '').trim();
    const cleaned = stripCodeFences(raw);
    const extracted = extractFirstJsonObject(cleaned);
    const parsed = (() => {
      for (const candidate of [cleaned, extracted].filter(Boolean)) {
        try {
          return JSON.parse(candidate);
        } catch (_err) {
          // try next candidate
        }
      }
      return null;
    })();

    const perDayRecs = asObject(parsed)?.perDayRecs || {};
    smartTips = Array.isArray(parsed?.smartTips) ? parsed.smartTips.slice(0, 3) : [];

    perDay.forEach((day) => {
      const recs = perDayRecs[String(day.day)] || [];
      day.recommendations = Array.isArray(recs) ? recs.slice(0, 2) : [];
    });
  } catch (_error) {
    smartTips = [];
  }

  const totalEstimated = perDay.reduce((sum, day) => sum + Number(day.total || 0), 0);

  return res.json({
    success: true,
    totalBudget: Number(trip.budget || 0),
    days: trip.dates || [],
    totalEstimated,
    budgetHealth: trip.budget ? Math.round((totalEstimated / Number(trip.budget)) * 100) : 0,
    perDay,
    smartTips,
  });
});

export {
  createTrip,
  generatePlaces,
  selectPlaces,
  generateItinerary,
  computeRoute,
  getFlightCost,
  estimateBudget,
  getFlightCost as fetchFlightCost,
};