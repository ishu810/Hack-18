import { TTLCache } from '../../utils/ttlCache.js';

const GOOGLE_PLACES_BASE_URL = 'https://places.googleapis.com/v1';
const DEFAULT_RADIUS_METERS = 10000;
const venueCache = new TTLCache({ ttlMs: 15 * 60 * 1000, maxEntries: 400 });

function getGooglePlacesKey() {
  return String(
    process.env.GOOGLE_PLACES_API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.GOOGLE_MAPS_API_KEY
    || ''
  ).trim();
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(a, b) {
  if (!a || !b) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const val = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(val), Math.sqrt(1 - val));
}

function buildPhotoUrl(photoReference, maxWidth = 1200) {
  const key = getGooglePlacesKey();
  if (!key || !photoReference) return '';
  const safeMaxHeight = Math.max(400, Number(maxWidth) || 1200);
  return `${GOOGLE_PLACES_BASE_URL}/${photoReference}/media?maxHeightPx=${safeMaxHeight}&key=${encodeURIComponent(key)}`;
}

function normalizeName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferStayType(name = '') {
  const normalized = normalizeName(name);
  if (normalized.includes('hostel') || normalized.includes('backpacker')) return 'hostel';
  if (normalized.includes('guest house') || normalized.includes('guesthouse')) return 'guest house';
  if (normalized.includes('homestay')) return 'homestay';
  return 'hotel';
}

function inferCuisine(name = '', placeTypes = []) {
  const normalized = normalizeName(name);
  if (normalized.includes('cafe') || normalized.includes('coffee')) return 'Cafe';
  if (normalized.includes('dhaba')) return 'Dhaba / North Indian';
  if (normalized.includes('bistro')) return 'Bistro';
  if (normalized.includes('restaurant') || normalized.includes('hotel')) return 'Restaurant';
  if (Array.isArray(placeTypes) && placeTypes.some((type) => String(type).toLowerCase().includes('cafe'))) return 'Cafe';
  return 'Local cuisine';
}

function pickPrimaryType(placeTypes = [], fallback = '') {
  if (!Array.isArray(placeTypes) || !placeTypes.length) return fallback;
  const preferred = placeTypes.find((type) => ['lodging', 'restaurant', 'cafe', 'meal_takeaway'].includes(String(type).toLowerCase()));
  return preferred || fallback || placeTypes[0] || '';
}

function mapPriceLevel(value) {
  const raw = String(value || '').toUpperCase();
  const table = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return Number.isFinite(table[raw]) ? table[raw] : null;
}

function scoreVenue(place, center, venueKind, budget) {
  const rating = Number(place.rating) || 0;
  const reviews = Number(place.user_ratings_total) || 0;
  const distance = Number(place.distanceKm) || 0;
  const budgetTier = budget < 3000 ? 'budget' : budget < 7000 ? 'mid' : 'premium';
  const name = normalizeName(place.name);
  const stayType = inferStayType(place.name);
  const isHostel = stayType === 'hostel';
  const isGuestHouse = stayType === 'guest house';
  const isCafe = name.includes('cafe') || name.includes('coffee');

  let score = (rating * 14) + Math.log10((reviews || 0) + 1) * 8;
  score += Math.max(0, 12 - distance) * 1.6;

  if (venueKind === 'stay') {
    if (budgetTier === 'budget' && isHostel) score += 15;
    if (budgetTier === 'budget' && isGuestHouse) score += 10;
    if (budgetTier === 'mid' && stayType === 'hotel') score += 8;
    if (budgetTier === 'premium' && stayType === 'hotel') score += 12;
    if (budgetTier === 'premium' && isHostel) score -= 10;
  }

  if (venueKind === 'dining') {
    if (isCafe) score += 4;
    if (name.includes('dhaba') || name.includes('bhojanalaya')) score += 6;
    if (name.includes('heritage') || name.includes('famous') || name.includes('special')) score += 3;
  }

  if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
    score += Math.max(0, 10 - (distance || 0));
  }

  return score;
}

async function googleNearbySearch({ lat, lng, radius = DEFAULT_RADIUS_METERS, type = '', keyword = '', maxResults = 10, venueKind = 'dining', budget = 0 }) {
  const apiKey = getGooglePlacesKey();
  if (!apiKey || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const cacheKey = JSON.stringify({
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    radius,
    type,
    keyword,
    maxResults,
    venueKind,
    budget: Number(budget) || 0,
  });
  const cached = venueCache.get(cacheKey);
  if (cached) return cached;

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.location',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.formattedAddress',
    'places.shortFormattedAddress',
    'places.types',
    'places.photos',
    'places.googleMapsUri',
    'places.currentOpeningHours',
  ].join(',');

  const textChunks = [keyword, type, 'near me'].filter(Boolean);
  const textQuery = textChunks.join(' ');
  const body = {
    textQuery,
    maxResultCount: Math.max(1, Math.min(20, Number(maxResults) || 10)),
    languageCode: 'en',
    locationBias: {
      circle: {
        center: {
          latitude: lat,
          longitude: lng,
        },
        radius: Math.max(1000, Math.round(radius)),
      },
    },
  };

  if (type) {
    body.includedType = type;
    body.strictTypeFiltering = false;
  }

  const response = await fetch(`${GOOGLE_PLACES_BASE_URL}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Places searchText failed with status ${response.status}: ${text}`);
  }

  const data = await response.json();

  const center = { lat, lng };
  const results = (data.places || [])
    .map((place) => {
      const placeLat = toFiniteNumber(place.location?.latitude);
      const placeLng = toFiniteNumber(place.location?.longitude);
      const displayName = place.displayName?.text || '';
      if (!displayName || !Number.isFinite(placeLat) || !Number.isFinite(placeLng)) return null;

      const photoReference = place?.photos?.[0]?.name || '';
      const placeTypes = Array.isArray(place.types) ? place.types : [];
      const distanceValue = distanceKm(center, { lat: placeLat, lng: placeLng });

      return {
        name: String(displayName).trim(),
        placeId: place.id || '',
        type: pickPrimaryType(placeTypes, type),
        rating: toFiniteNumber(place.rating),
        user_ratings_total: toFiniteNumber(place.userRatingCount) || 0,
        price_level: mapPriceLevel(place.priceLevel),
        vicinity: String(place.shortFormattedAddress || place.formattedAddress || '').trim(),
        imageUrl: buildPhotoUrl(photoReference, 1200),
        googleMapsUrl: String(place.googleMapsUri || '').trim(),
        distanceKm: Number.isFinite(distanceValue) ? distanceValue : null,
        isOpenNow: Boolean(place.currentOpeningHours?.openNow),
        rawTypes: placeTypes,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const scoreA = scoreVenue(a, center, venueKind, budget);
      const scoreB = scoreVenue(b, center, venueKind, budget);
      return scoreB - scoreA;
    })
    .slice(0, maxResults);

  venueCache.set(cacheKey, results);
  return results;
}

function dedupePlaces(places = []) {
  const seen = new Set();
  return places.filter((place) => {
    const key = `${normalizeName(place?.name)}|${normalizeName(place?.vicinity || place?.area || '')}`;
    if (!key.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchGoogleVenueRecommendations({ lat, lng, city = '', budget = 0 }) {
  const key = getGooglePlacesKey();
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      stay: null,
      stay_options: [],
      dining_places: [],
    };
  }

  const stayRadius = Number(process.env.GOOGLE_STAY_SEARCH_RADIUS_METERS || 12000);
  const diningRadius = Number(process.env.GOOGLE_DINING_SEARCH_RADIUS_METERS || 8000);
  const safeBudget = Number(budget) || 0;

  const searchTasks = [
    googleNearbySearch({ lat, lng, radius: stayRadius, type: 'lodging', keyword: `${city || ''} hotel`.trim(), maxResults: 8, venueKind: 'stay', budget: safeBudget }),
    googleNearbySearch({ lat, lng, radius: stayRadius, type: 'lodging', keyword: `${city || ''} hostel`.trim(), maxResults: 8, venueKind: 'stay', budget: safeBudget }),
    googleNearbySearch({ lat, lng, radius: stayRadius, type: 'lodging', keyword: `${city || ''} guest house`.trim(), maxResults: 8, venueKind: 'stay', budget: safeBudget }),
    googleNearbySearch({ lat, lng, radius: diningRadius, type: 'restaurant', keyword: `${city || ''} famous restaurants`.trim(), maxResults: 8, venueKind: 'dining', budget: safeBudget }),
    googleNearbySearch({ lat, lng, radius: diningRadius, type: 'cafe', keyword: `${city || ''} street food cafe`.trim(), maxResults: 6, venueKind: 'dining', budget: safeBudget }),
  ];

  const [lodgingA, lodgingB, lodgingC, restaurants, cafes] = await Promise.all(searchTasks);

  const stayOptions = dedupePlaces([...lodgingA, ...lodgingB, ...lodgingC])
    .sort((a, b) => scoreVenue(b, { lat, lng }, 'stay', safeBudget) - scoreVenue(a, { lat, lng }, 'stay', safeBudget))
    .slice(0, 4)
    .map((place) => ({
      name: place.name,
      type: inferStayType(place.name),
      area: place.vicinity || city || '',
      reason: `Well-rated ${inferStayType(place.name)} option near ${city || 'this stop'}.`,
      imageUrl: place.imageUrl,
      rating: place.rating,
      price_level: place.price_level,
      googleMapsUrl: place.googleMapsUrl,
      vicinity: place.vicinity,
      placeId: place.placeId,
      distanceKm: place.distanceKm,
    }));

  const diningPlaces = dedupePlaces([...restaurants, ...cafes])
    .sort((a, b) => scoreVenue(b, { lat, lng }, 'dining', safeBudget) - scoreVenue(a, { lat, lng }, 'dining', safeBudget))
    .slice(0, 4)
    .map((place) => ({
      name: place.name,
      cuisine: inferCuisine(place.name, place.rawTypes),
      area: place.vicinity || city || '',
      best_for: `Popular local stop near ${city || 'this area'}.`,
      imageUrl: place.imageUrl,
      rating: place.rating,
      price_level: place.price_level,
      googleMapsUrl: place.googleMapsUrl,
      vicinity: place.vicinity,
      placeId: place.placeId,
      distanceKm: place.distanceKm,
      isOpenNow: place.isOpenNow,
    }));

  const stay = stayOptions[0]
    ? {
      area: stayOptions[0].area || city || '',
      type: stayOptions[0].type || 'hotel',
      reason: stayOptions[0].reason,
      name: stayOptions[0].name,
      imageUrl: stayOptions[0].imageUrl,
      rating: stayOptions[0].rating,
      price_level: stayOptions[0].price_level,
      googleMapsUrl: stayOptions[0].googleMapsUrl,
      vicinity: stayOptions[0].vicinity,
      placeId: stayOptions[0].placeId,
    }
    : null;

  return {
    stay,
    stay_options: stayOptions,
    dining_places: diningPlaces,
  };
}
