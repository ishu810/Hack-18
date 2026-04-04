import { Travel } from '../models/travel.model.js';
import { ChatOpenAI } from '@langchain/openai';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildItineraryPrompt } from '../utils/itineraryPrompt.js';
import { computeRoute as computeRouteService } from '../services/routing/routing.service.js';
import axios from 'axios';

const FALLBACK_IMAGE = 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg';
const GEOAPIFY_BASE_URL = 'https://api.geoapify.com';

const getGeoapifyKey = () => {
  const raw = process.env.GEOAPIFY_API_KEY || process.env.GEOAPIFY_KEY || '';
  return raw.trim();
};

const maskKey = (value = '') => {
  const key = String(value || '').trim();
  if (!key) return '[missing]';
  if (key.length <= 10) return `${key.slice(0, 3)}***`;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
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
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeItineraryForSave = (rawData) => {
  const data = asObject(rawData) || {};
  const days = asArray(data.itinerary).map((day, index) => {
    const d = asObject(day) || {};

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
        best_for: asString(s.best_for)
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
      local_explorations: asArray(d.local_explorations).map((item) => asString(item)).filter(Boolean),
      stay: stayObj ? {
        area: asString(stayObj.area),
        type: asString(stayObj.type),
        reason: asString(stayObj.reason)
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

const createTrip = asyncHandler(async (req, res) => {
  const { origin, destination, stops, budget, dates } = req.body;
  const userId = req.user?._id || null; 

  const trip = await Travel.create({
    user: userId,
    origin,
    destination,
    stops: stops || [],
    budget,
    dates
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

  c