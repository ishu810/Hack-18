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

const getPlaceCoords = (place) => {
  const lat = toFiniteNumber(place?.lat);
  const lng = toFiniteNumber(place?.lng ?? place?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const splitEvenly = (items = [], parts = 1) => {
  const count = Math.max(1, Number(parts) || 1);
  const buckets = Array.from({ length: count }, () => []);
  if (!items.length) return buckets;

  items.forEach((item, index) => {
    buckets[index % count].push(item);
  });

  return buckets;
};

const orderPlacesByNearest = (places = []) => {
  if (!Array.isArray(places) || places.length <= 2) return [...places];

  const remaining = [...places];
  const ordered = [remaining.shift()];

  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    const currentCoords = getPlaceCoords(current);
    if (!currentCoords) {
      ordered.push(remaining.shift());
      continue;
    }

    let nearestIndex = 0;
    let nearestDistance = Infinity;
    remaining.forEach((candidate, index) => {
      const candidateCoords = getPlaceCoords(candidate);
      if (!candidateCoords) return;
      const dist = distanceKm(currentCoords, candidateCoords);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestIndex = index;
      }
    });

    ordered.push(remaining.splice(nearestIndex, 1)[0]);
  }

  return ordered;
};

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
    itineraryData = await enrichItineraryWithGoogleVenues(itineraryData, trip);
    console.log('✅ Google venue enrichment completed');
  } catch (enrichmentError) {
    console.warn('⚠️ Google venue enrichment skipped:', enrichmentError.message || enrichmentError);
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


export{
  
  
  selectPlaces,
  generateItinerary,
  getUnsplashImage,
  buildQueryVariants,
  selectPlacesWithLLM,
  fallbackSelectPlaces,
  

}