import { Travel } from '../models/travel.model.js';
import { ChatOpenAI } from '@langchain/openai';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildItineraryPrompt } from '../utils/itineraryPrompt.js';
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

const enforceDestinationPriority = ({ selected = [], candidates = [], destination = '', maxCount = 12 }) => {
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
  const destinationCap = Math.min(maxCount, Math.ceil((maxCount * 5) / 9));

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

const fallbackSelectPlaces = (candidates, maxCount, destination) => {
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
  });
};

const selectPlacesWithLLM = async ({ candidates, maxCount, days, destination }) => {
  if (!candidates.length) return [];

  const intermediateLocations = [...new Set(
    candidates
      .map((item) => normalizePlaceName(item?.location))
      .filter((loc) => loc && loc !== normalizePlaceName(destination))
  )];

  const destinationCap = Math.min(maxCount, Math.ceil((maxCount * 5) / 9));
  const prompt = `You are a travel curator.\nReturn ONLY valid JSON array.\n\nGiven this place list, select the best places for an itinerary.\nSelection rules:\n- prioritize famous landmarks and popularity\n- ensure diversity of experiences (culture, nature, viewpoints, etc.)\n- avoid duplicates or near-identical entries\n- keep geographic relevance to each checkpoint location\n- select at most ${maxCount} places total\n\nCRITICAL DISTRIBUTION RULES:\n- Final destination is: ${destination}\n- Destination places cap: at most ${destinationCap}\n- For each intermediate checkpoint, select at most 2 places\n- Keep final output suitable for max 3 visits per day\n- Intermediates are: ${JSON.stringify(intermediateLocations)}\n\nInput places:\n${JSON.stringify(candidates)}\n\nOutput format (JSON array only):\n[\n  {\n    "name": "Place Name",\n    "location": "Checkpoint Name",\n    "lat": 0,\n    "lng": 0,\n    "type": "landmark",\n    "rating": 0,\n    "popularity": 0,\n    "best_visit_reason": "one concise line"\n  }\n]`;

  const response = await llm.invoke(prompt);
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

        return fetchedPlaces.map((place) => ({
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

  // Strict day-based cap: max 3 visits per day total.
  const maxSelectCount = Math.min(days * 3, discoveredUnique.length);

  let llmSelected = [];
  try {
    const parsed = await selectPlacesWithLLM({ candidates: discoveredUnique, maxCount: maxSelectCount, days, destination: trip.destination });
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

        const matchingCandidate = discoveredUnique.find((candidate) => {
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

  const selectedBase = llmSelected.length
    ? enforceDestinationPriority({ selected: llmSelected, candidates: discoveredUnique, destination: trip.destination, maxCount: maxSelectCount })
    : fallbackSelectPlaces(discoveredUnique, maxSelectCount, trip.destination);

  const uniquePlaces = selectedBase.filter((place, idx, self) => {
    const key = `${normalizePlaceName(place.name)}|${normalizePlaceName(place.location)}`;
    return place.name && self.findIndex((candidate) => `${normalizePlaceName(candidate.name)}|${normalizePlaceName(candidate.location)}` === key) === idx;
  });

  const placesWithImages = await Promise.all(uniquePlaces.map(async (place) => {
    let url = isProbablyValidUrl(place.imageUrl) ? place.imageUrl : '';
    if (url && !(await isReachableImageUrl(url))) {
      console.warn('Discarding unreachable prefilled image URL for', place.name, url);
      url = '';
    }

    const queryVariants = buildQueryVariants(place.name, place.location, place.type);
    
    // Try Unsplash first
    if (!isProbablyValidUrl(url)) {
      url = await getUnsplashImage(queryVariants, place.name);
      if (url && !(await isReachableImageUrl(url))) url = '';
    }
    
    // If Unsplash fails, try Pexels
    if (!isProbablyValidUrl(url)) {
      url = await getPexelsImage(queryVariants, place.name);
      if (url && !(await isReachableImageUrl(url))) url = '';
    }

    // Free and strong for popular landmarks if photo stock APIs miss.
    if (!isProbablyValidUrl(url)) {
      url = await getWikimediaImage(place.name);
      if (url && !(await isReachableImageUrl(url))) url = '';
    }

    return { ...place, imageUrl: isProbablyValidUrl(url) ? url : buildGuaranteedFallbackImage(place) };
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
    }, { new: true });

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

  const prompt = buildItineraryPrompt({
    origin: trip.origin,
    destination: trip.destination,
    days: getTripDaysFromDates(trip.dates),
    selectedPlaces: trip.selectedPlaces,
    budget: trip.budget,
    dates: trip.dates
  });

  console.log('✅ Prompt built, length:', prompt.length, 'characters');

  let itineraryData;
  try {
    console.log('🔄 Calling LLM...');
    const response = await llm.invoke(prompt);
    const content = response.content || response.text || '{}';
    
    console.log('✅ LLM response received, length:', content.length);
    console.log('📝 Response preview:', content.substring(0, 200));
    
    itineraryData = JSON.parse(content);
    console.log('✅ Response parsed successfully');
    console.log('📊 Itinerary days:', itineraryData.itinerary?.length);
  } catch (error) {
    console.warn('⚠️ LLM generation failed:', error.message);
    console.log('📝 Using fallback itinerary...');
    
    // Generate simple fallback itinerary
    itineraryData = {
      itinerary: trip.selectedPlaces.slice(0, getTripDaysFromDates(trip.dates)).map((place, index) => {
        const currentCity = place.location || trip.destination;
        const previousCity = index === 0
          ? trip.origin
          : (trip.selectedPlaces[index - 1]?.location || trip.origin);
        const isTransferDay = index > 0 && previousCity !== currentCity;

        return {
          day: index + 1,
          city: currentCity,
          theme: place.type || 'Sightseeing',
          weather: 'Clear',
          weather_note: 'Good conditions',
          activities: [
            {
              title: isTransferDay ? `After reaching ${currentCity}, visit ${place.name}` : `Visit ${place.name}`,
              time: '9:00 AM - 12:00 PM',
              duration_min: 180,
              description: place.best_visit_reason || 'Explore attractions',
              type: 'outdoor',
              location: currentCity || 'Main area'
            }
          ],
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
            ? `Traveled from ${previousCity} to ${currentCity}, then visited ${place.name}.`
            : `Explored ${place.name} and enjoyed local cuisine in ${currentCity}.`
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
    const normalizedItinerary = normalizeItineraryForSave(itineraryData);
    console.log('✅ Normalized itinerary days:', normalizedItinerary.itinerary.length);

    trip.itinerary = normalizedItinerary;
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

export {
  createTrip,
  generatePlaces,
  selectPlaces,
  generateItinerary
};