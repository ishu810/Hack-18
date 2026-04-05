const GOOGLE_DIRECTIONS_BASE_URL = 'https://maps.googleapis.com/maps/api/directions/json';

function normalizeMode(mode = 'drive') {
  const value = String(mode || 'drive').toLowerCase().trim();
  if (value === 'walk' || value === 'walking') return 'walking';
  if (value === 'bicycle' || value === 'bike' || value === 'cycling') return 'bicycling';
  if (value === 'transit') return 'transit';
  return 'driving';
}

function getGoogleRoutingKey() {
  return String(
    process.env.GOOGLE_DIRECTIONS_API_KEY
    || process.env.GOOGLE_MAPS_API_KEY
    || process.env.GOOGLE_API_KEY
    || ''
  ).trim();
}

function toFiniteNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function encodeWaypoint(point = {}) {
  return `${Number(point.lat).toFixed(6)},${Number(point.lng).toFixed(6)}`;
}

function decodePolyline(encoded = '') {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = null;

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

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function mapLegs(route = {}) {
  return Array.isArray(route?.legs)
    ? route.legs.map((leg, index) => ({
        index,
        distanceMeters: Number(leg?.distance?.value) || 0,
        durationSeconds: Number(leg?.duration?.value) || 0,
        startAddress: String(leg?.start_address || '').trim(),
        endAddress: String(leg?.end_address || '').trim(),
        startLocation: {
          lat: toFiniteNumber(leg?.start_location?.lat),
          lng: toFiniteNumber(leg?.start_location?.lng),
        },
        endLocation: {
          lat: toFiniteNumber(leg?.end_location?.lat),
          lng: toFiniteNumber(leg?.end_location?.lng),
        },
        steps: Array.isArray(leg?.steps) ? leg.steps : [],
      }))
    : [];
}

function summarizeRoute(route = {}) {
  const legs = mapLegs(route);
  const distanceMeters = legs.reduce((sum, leg) => sum + (Number(leg.distanceMeters) || 0), 0);
  const durationSeconds = legs.reduce((sum, leg) => sum + (Number(leg.durationSeconds) || 0), 0);

  return {
    distance: distanceMeters,
    duration: durationSeconds,
    polyline: decodePolyline(String(route?.overview_polyline?.points || '')),
    legs,
    provider: 'google',
  };
}

export async function computeRouteWithGoogleDirections({ waypoints = [], mode = 'drive', options = {} }) {
  const apiKey = getGoogleRoutingKey();
  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: 'GOOGLE_ROUTING_KEY_MISSING',
        message: 'Google routing API key is missing.',
      },
    };
  }

  const cleanWaypoints = (Array.isArray(waypoints) ? waypoints : [])
    .map((point) => ({
      lat: toFiniteNumber(point?.lat),
      lng: toFiniteNumber(point?.lng ?? point?.lon),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  if (cleanWaypoints.length < 2) {
    return {
      ok: false,
      error: {
        code: 'INSUFFICIENT_WAYPOINTS',
        message: 'At least 2 valid waypoints are required for routing.',
      },
    };
  }

  const origin = cleanWaypoints[0];
  const destination = cleanWaypoints[cleanWaypoints.length - 1];
  const middleWaypoints = cleanWaypoints.slice(1, -1);

  const params = new URLSearchParams({
    origin: encodeWaypoint(origin),
    destination: encodeWaypoint(destination),
    mode: normalizeMode(mode),
    key: apiKey,
    units: 'metric',
  });

  if (options?.alternatives) {
    params.set('alternatives', 'true');
  }

  if (middleWaypoints.length > 0) {
    params.set('waypoints', middleWaypoints.map(encodeWaypoint).join('|'));
  }

  if (options?.avoidTolls) {
    params.set('avoid', 'tolls');
  }
  if (options?.avoidHighways) {
    const currentAvoid = params.get('avoid');
    params.set('avoid', currentAvoid ? `${currentAvoid}|highways` : 'highways');
  }

  try {
    const response = await fetch(`${GOOGLE_DIRECTIONS_BASE_URL}?${params.toString()}`);
    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        error: {
          code: 'GOOGLE_DIRECTIONS_REQUEST_FAILED',
          message: `Google routing failed with status ${response.status}.`,
          details: text || null,
          providerStatus: response.status,
        },
      };
    }

    const data = await response.json();
    if (data?.status && data.status !== 'OK') {
      return {
        ok: false,
        error: {
          code: 'GOOGLE_DIRECTIONS_ERROR',
          message: data.error_message || `Google Directions returned ${data.status}.`,
          providerStatus: data.status,
        },
      };
    }

    const route = data?.routes?.[0];
    if (!route) {
      return {
        ok: false,
        error: {
          code: 'GOOGLE_DIRECTIONS_NO_ROUTE',
          message: 'Google Directions returned no route.',
        },
      };
    }

    return {
      ok: true,
      route: summarizeRoute(route),
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