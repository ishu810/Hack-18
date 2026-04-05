import { fetchGoogleCheckpointSuggestions } from '../../places/googlePlaces.service.js';

const GOOGLE_DIRECTIONS_BASE_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const GOOGLE_GEOCODE_BASE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

function normalizeMode(mode = 'drive') {
  const value = String(mode || 'drive').toLowerCase();
  if (value === 'walk' || value === 'walking') return 'walking';
  if (value === 'bicycle' || value === 'bike' || value === 'cycling') return 'bicycling';
  if (value === 'transit') return 'transit';
  return 'driving';
}

function decodePolyline(encoded = '') {
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;

    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    coordinates.push([lat / 1e5, lng / 1e5]);
  }

  return coordinates.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function distanceKm(a, b) {
  if (!a || !b) return 0;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const val = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(val), Math.sqrt(1 - val));
}

function interpolatePoint(a, b, ratio) {
  return {
    lat: a.lat + (b.lat - a.lat) * ratio,
    lng: a.lng + (b.lng - a.lng) * ratio,
  };
}

function samplePathPoints(points = [], sampleCount = 3) {
  const valid = (Array.isArray(points) ? points : [])
    .filter((point) => Number.isFinite(Number(point?.[0])) && Number.isFinite(Number(point?.[1])))
    .map((point) => ({ lat: Number(point[0]), lng: Number(point[1]) }));

  if (valid.length < 2) return [];

  const segmentDistances = [];
  let totalDistance = 0;
  for (let index = 0; index < valid.length - 1; index += 1) {
    const segmentDistance = distanceKm(valid[index], valid[index + 1]);
    totalDistance += segmentDistance;
    segmentDistances.push(totalDistance);
  }

  const ratioCount = Math.max(1, Number(sampleCount) || 3);
  const ratios = Array.from({ length: ratioCount }, (_, index) => (index + 1) / (ratioCount + 1));
  return ratios.map((ratio) => {
    const targetDistance = totalDistance * ratio;
    for (let index = 0; index < segmentDistances.length; index += 1) {
      if (targetDistance > segmentDistances[index]) continue;

      const segmentStartDistance = index === 0 ? 0 : segmentDistances[index - 1];
      const segmentDistance = segmentDistances[index] - segmentStartDistance || 0;
      const segmentRatio = segmentDistance > 0 ? (targetDistance - segmentStartDistance) / segmentDistance : 0;
      return interpolatePoint(valid[index], valid[index + 1], Math.max(0, Math.min(1, segmentRatio)));
    }

    return valid[valid.length - 1];
  });
}

function getPolylineDistanceKm(points = []) {
  const valid = (Array.isArray(points) ? points : [])
    .filter((point) => Number.isFinite(Number(point?.[0])) && Number.isFinite(Number(point?.[1])))
    .map((point) => ({ lat: Number(point[0]), lng: Number(point[1]) }));

  if (valid.length < 2) return 0;

  let totalDistance = 0;
  for (let index = 0; index < valid.length - 1; index += 1) {
    totalDistance += distanceKm(valid[index], valid[index + 1]);
  }

  return totalDistance;
}

function extractCityFromGeocodeResult(result = {}) {
  const components = Array.isArray(result?.address_components) ? result.address_components : [];
  const pick = (types) => components.find((component) => types.every((type) => Array.isArray(component.types) && component.types.includes(type)));
  const locality = pick(['locality']) || pick(['postal_town']) || pick(['administrative_area_level_2']) || pick(['administrative_area_level_1']);
  const name = locality?.long_name || '';
  const formatted = String(result?.formatted_address || '').split(',').slice(0, 2).join(',').trim();
  return String(name || formatted || '').trim();
}

async function reverseGeocodePoint(point) {
  const apiKey = getGoogleRoutingKey();
  if (!apiKey || !point) return null;

  const params = new URLSearchParams({
    latlng: `${point.lat},${point.lng}`,
    key: apiKey,
  });

  const response = await fetch(`${GOOGLE_GEOCODE_BASE_URL}?${params.toString()}`);
  if (!response.ok) return null;

  const data = await response.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  const city = extractCityFromGeocodeResult(results[0] || {});
  if (!city) return null;

  return {
    name: city,
    location: city,
    lat: Number(point.lat),
    lng: Number(point.lng),
  };
}

async function buildGeneratedCheckpoints({ origin, destination, polyline, options = {} }) {
  const shouldGenerateStops = options?.generateStops !== false;
  if (!shouldGenerateStops) {
    return [origin, destination];
  }

  const routeDistanceKm = getPolylineDistanceKm(polyline) || distanceKm(origin, destination);
  const configuredMax = Number(options?.maxGeneratedStops);
  const generatedStopCount = Number.isFinite(configuredMax)
    ? Math.max(2, Math.min(3, Math.round(configuredMax)))
    : (routeDistanceKm >= 900 ? 3 : 2);
  const checkpointSamples = samplePathPoints(polyline, generatedStopCount);
  if (!checkpointSamples.length) {
    const fallbackRatios = Array.from({ length: generatedStopCount }, (_, index) => (index + 1) / (generatedStopCount + 1));
    fallbackRatios.forEach((ratio) => {
      checkpointSamples.push(interpolatePoint(origin, destination, ratio));
    });
  }

  const generated = [];
  const seen = new Set([
    `${Number(origin.lat).toFixed(4)}|${Number(origin.lng).toFixed(4)}`,
    `${Number(destination.lat).toFixed(4)}|${Number(destination.lng).toFixed(4)}`,
  ]);

  for (const sample of checkpointSamples) {
    try {
      const cityCheckpoint = await reverseGeocodePoint(sample);
      if (cityCheckpoint?.name) {
        const key = `${cityCheckpoint.name.toLowerCase()}|${cityCheckpoint.location.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          generated.push({
            index: generated.length + 1,
            name: cityCheckpoint.name,
            location: cityCheckpoint.location,
            lat: cityCheckpoint.lat,
            lng: cityCheckpoint.lng,
          });
          continue;
        }
      }

      const suggestions = await fetchGoogleCheckpointSuggestions({
        lat: Number(sample.lat),
        lng: Number(sample.lng),
        city: '',
        maxResults: 3,
      });

      const pick = (suggestions || []).find((place) => {
        const key = `${String(place?.name || '').toLowerCase()}|${String(place?.vicinity || '').toLowerCase()}`;
        return place?.name && !seen.has(key);
      }) || null;

      if (!pick) continue;

      const chosenName = pick.name;
      const chosenLocation = pick.vicinity || pick.area || '';
      const lat = toFiniteNumber(pick.lat ?? sample.lat);
      const lng = toFiniteNumber(pick.lng ?? sample.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const key = `${String(chosenName || '').toLowerCase()}|${String(chosenLocation || '').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      generated.push({
        index: generated.length + 1,
        name: chosenName,
        location: chosenLocation,
        lat,
        lng,
      });

      if (generated.length >= generatedStopCount) break;
    } catch (_error) {
      // Ignore sample points that cannot be resolved to a meaningful checkpoint.
    }
  }

  return [origin, ...generated, destination].map((point, index) => ({
    index,
    name: point?.name || '',
    location: point?.location || point?.name || '',
    lat: point?.lat,
    lng: point?.lng,
  }));
}

function getGoogleRoutingKey() {
  return String(
    process.env.GOOGLE_MAPS_API_KEY
    || process.env.GOOGLE_API_KEY
    || ''
  ).trim();
}

export async function computeRouteWithGoogle({ waypoints, mode = 'drive', options = {} }) {
  const apiKey = getGoogleRoutingKey();
  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: 'GOOGLE_MAPS_KEY_MISSING',
        message: 'Google Maps API key is missing.',
      },
    };
  }

  const validWaypoints = (Array.isArray(waypoints) ? waypoints : [])
    .map((point) => ({
      lat: toFiniteNumber(point?.lat),
      lng: toFiniteNumber(point?.lng ?? point?.lon),
      name: String(point?.name || point?.label || '').trim(),
      location: String(point?.location || '').trim(),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  if (validWaypoints.length < 2) {
    return {
      ok: false,
      error: {
        code: 'INSUFFICIENT_WAYPOINTS',
        message: 'At least 2 valid waypoints are required for routing.',
      },
    };
  }

  const origin = validWaypoints[0];
  const destination = validWaypoints[validWaypoints.length - 1];
  const intermediateWaypoints = validWaypoints.slice(1, -1);
  const shouldOptimize = options?.optimizeWaypoints !== false && intermediateWaypoints.length > 1;

  const waypointParam = intermediateWaypoints.length
    ? `${shouldOptimize ? 'optimize:true|' : ''}${intermediateWaypoints.map((point) => `${point.lat},${point.lng}`).join('|')}`
    : '';

  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    mode: normalizeMode(mode),
    key: apiKey,
  });

  if (waypointParam) {
    params.set('waypoints', waypointParam);
  }
  if (options?.units) {
    params.set('units', String(options.units));
  }
  if (options?.avoid) {
    params.set('avoid', String(options.avoid));
  }

  try {
    const response = await fetch(`${GOOGLE_DIRECTIONS_BASE_URL}?${params.toString()}`);
    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        error: {
          code: 'GOOGLE_DIRECTIONS_REQUEST_FAILED',
          message: `Google Directions failed with status ${response.status}.`,
          details: text || null,
          providerStatus: response.status,
        },
      };
    }

    const data = await response.json();
    const route = Array.isArray(data?.routes) ? data.routes[0] : null;
    const legSummary = Array.isArray(route?.legs) ? route.legs : [];
    const waypointOrder = Array.isArray(route?.waypoint_order) ? route.waypoint_order : [];
    const orderedIntermediates = waypointOrder.length
      ? waypointOrder.map((index) => intermediateWaypoints[index]).filter(Boolean)
      : intermediateWaypoints;
    const checkpoints = await buildGeneratedCheckpoints({
      origin,
      destination,
      polyline: decodePolyline(route?.overview_polyline?.points || ''),
      options,
    });

    return {
      ok: true,
      route: {
        distance: Number(route?.legs?.reduce((sum, leg) => sum + (Number(leg?.distance?.value) || 0), 0)) || 0,
        duration: Number(route?.legs?.reduce((sum, leg) => sum + (Number(leg?.duration?.value) || 0), 0)) || 0,
        polyline: decodePolyline(route?.overview_polyline?.points || ''),
        legs: legSummary.map((leg, index) => ({
          index,
          distance: Number(leg?.distance?.value) || 0,
          duration: Number(leg?.duration?.value) || 0,
          startAddress: String(leg?.start_address || '').trim(),
          endAddress: String(leg?.end_address || '').trim(),
        })),
        provider: 'google',
        waypointOrder,
        checkpoints,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'GOOGLE_DIRECTIONS_NETWORK_ERROR',
        message: error?.message || 'Failed to call Google Directions API.',
      },
    };
  }
}