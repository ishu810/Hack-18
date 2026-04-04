const GEOAPIFY_BASE_URL = 'https://api.geoapify.com';

function normalizeMode(mode = 'drive') {
  const value = String(mode || 'drive').toLowerCase();
  if (value === 'walk' || value === 'walking') return 'walk';
  if (value === 'bicycle' || value === 'bike' || value === 'cycling') return 'bicycle';
  if (value === 'truck' || value === 'heavy') return 'truck';
  return 'drive';
}

function parsePolyline(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];

  if (geometry.type === 'LineString') {
    return (geometry.coordinates || [])
      .map((pair) => [Number(pair?.[1]), Number(pair?.[0])])
      .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  }

  if (geometry.type === 'MultiLineString') {
    return (geometry.coordinates || [])
      .flat()
      .map((pair) => [Number(pair?.[1]), Number(pair?.[0])])
      .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  }

  return [];
}

export async function computeRouteWithGeoapify({ waypoints, mode = 'drive', options = {} }) {
  const apiKey = String(process.env.GEOAPIFY_API_KEY || process.env.GEOAPIFY_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      error: {
        code: 'GEOAPIFY_KEY_MISSING',
        message: 'Geoapify API key is missing.',
      },
    };
  }

  const waypointString = waypoints.map((point) => `${point.lat},${point.lng}`).join('|');
  const params = new URLSearchParams({
    waypoints: waypointString,
    mode: normalizeMode(mode),
    apiKey,
  });

  if (options.details !== undefined) {
    params.set('details', String(options.details));
  }
  if (options.units) {
    params.set('units', String(options.units));
  }

  try {
    const response = await fetch(`${GEOAPIFY_BASE_URL}/v1/routing?${params.toString()}`);
    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        error: {
          code: 'GEOAPIFY_REQUEST_FAILED',
          message: `Geoapify routing failed with status ${response.status}.`,
          details: text || null,
          providerStatus: response.status,
        },
      };
    }

    const data = await response.json();
    const feature = data?.features?.[0];
    const polyline = parsePolyline(feature);

    return {
      ok: true,
      route: {
        distance: Number(feature?.properties?.distance) || 0,
        duration: Number(feature?.properties?.time) || 0,
        polyline,
        legs: Array.isArray(feature?.properties?.legs) ? feature.properties.legs : [],
        provider: 'geoapify',
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'GEOAPIFY_NETWORK_ERROR',
        message: error?.message || 'Failed to call Geoapify routing API.',
      },
    };
  }
}
