import { Travel } from '../models/travel.model.js';
import { ChatOpenAI } from '@langchain/openai';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildTravelPlacesPrompt } from '../utils/travelPrompt.js';
import { buildItineraryPrompt } from '../utils/itineraryPrompt.js';
import axios from 'axios';

const FALLBACK_IMAGE = 'https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg';

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

// Generate candidate places using LLM
const generatePlaces = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  console.log('DEBUG generatePlaces called for tripId', tripId);
  const trip = await Travel.findById(tripId);
  if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });

  const days = getTripDaysFromDates(trip.dates);
  const prompt = buildTravelPlacesPrompt({
    origin: trip.origin,
    destination: trip.destination,
    stops: trip.stops,
    days
  });

  let places = [];

  try {
    const llmResp = await llm.invoke(prompt);
    let raw = (llmResp.content || llmResp.text || '').toString().trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    const tryParseJson = (value) => {
      if (!value || typeof value !== 'string') return null;
      try {
        return JSON.parse(value);
      } catch (_e) {
        try {
          return JSON.parse(value.replace(/'/g, '"'));
        } catch (_e2) {
          return null;
        }
      }
    };

    let parsed = tryParseJson(raw);

    if (!parsed && raw.startsWith('[') && raw.endsWith(']')) {
      parsed = tryParseJson(raw);
    }

    if (Array.isArray(parsed)) {
      places = parsed.map((item) => {
        if (typeof item === 'string') return { name: item, type: 'unknown' };
        if (typeof item === 'object' && item.name) return item;
        return null;
      }).filter(Boolean);
    } else if (parsed && Array.isArray(parsed.places)) {
      places = parsed.places.map((item) => {
        if (typeof item === 'string') return { name: item, type: 'unknown' };
        if (typeof item === 'object' && item.name) return item;
        return null;
      }).filter(Boolean);
    } else if (parsed && Array.isArray(parsed.data)) {
      places = parsed.data.map((item) => {
        if (typeof item === 'string') return { name: item, type: 'unknown' };
        if (typeof item === 'object' && item.name) return item;
        return null;
      }).filter(Boolean);
    } else {
      throw new Error('unexpected LLM format');
    }

    if (!places.length) {
      throw new Error('no valid place objects parsed');
    }
  } catch (err) {
    console.warn('LLM place parse fallback:', err?.message || err);
    places = [
      { name: 'Kochi', type: 'city', location: 'Kochi', best_visit_reason: 'Coastal city with backwaters and culture' },
      { name: 'Munnar', type: 'hill_station', location: 'Munnar', best_visit_reason: 'Tea gardens and hiking' },
      { name: 'Alleppey', type: 'backwaters', location: 'Alleppey', best_visit_reason: 'Houseboat rides on backwaters' }
    ];
  }

  const finalPlaces = places.map((p) => {
    const name = typeof p.name === 'string' ? p.name.trim() : String(p.name || '');
    const type = typeof p.type === 'string' ? p.type.trim() : 'unknown';
    const location = typeof p.location === 'string' && p.location.trim() ? p.location.trim() :
      (typeof p.city === 'string' && p.city.trim() ? p.city.trim() : trip.destination);
    const best_visit_reason = typeof p.best_visit_reason === 'string' && p.best_visit_reason.trim() ? p.best_visit_reason.trim() :
      (typeof p.bestVisitReason === 'string' && p.bestVisitReason.trim() ? p.bestVisitReason.trim() : `Great place to visit in ${location}`);
    const rawImageUrl = typeof p.imageUrl === 'string' && p.imageUrl.trim() ? p.imageUrl.trim() :
      (typeof p.image_url === 'string' && p.image_url.trim() ? p.image_url.trim() : '');
    // We do not trust model-provided image URLs blindly; they are verified later.
    const imageUrl = isProbablyValidUrl(rawImageUrl) ? rawImageUrl : '';

    return { name, type, location, best_visit_reason, imageUrl };
  });

  const uniquePlaces = finalPlaces.filter((p, idx, self) => p.name && self.findIndex((q) => q.name === p.name) === idx);

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