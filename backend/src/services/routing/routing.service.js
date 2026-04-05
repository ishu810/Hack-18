import crypto from 'crypto';
import { TTLCache } from '../../utils/ttlCache.js';
import { computeRouteWithGoogleDirections } from './providers/googleRoutingAdapter.js';
import { computeRouteWithGeoapify } from './providers/geoapifyRoutingAdapter.js';

const routeCache = new TTLCache({ ttlMs: 5 * 60 * 1000, maxEntries: 800 });

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeWaypoints(waypoints = []) {
  return (Array.isArray(waypoints) ? waypoints : [])
    .map((point) => ({
      lat: toFiniteNumber(point?.lat),
      lng: toFiniteNumber(point?.lng ?? point?.lon),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function dedupeConsecutiveWaypoints(waypoints = []) {
  const deduped = [];
  for (const point of waypoints) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.lat === point.lat && prev.lng === point.lng) continue;
    deduped.push(point);
  }
  return deduped;
}

function buildRouteHash({ waypoints, mode = 'drive', provider = 'geoapify' }) {
  const signature = {
    provider,
    mode,
    waypoints: waypoints.map((point) => [Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6))]),
  };

  return crypto
    .createHash('sha1')
    .update(JSON.stringify(signature))
    .digest('hex');
}

function getProviderName() {
  const candidate = String(process.env.ROUTING_PROVIDER || '').toLowerCase().trim();
  if (candidate === 'google' || candidate === 'geoapify') return candidate;

  const hasGoogleKey = Boolean(
    String(
      process.env.GOOGLE_DIRECTIONS_API_KEY
      || process.env.GOOGLE_MAPS_API_KEY
      || process.env.GOOGLE_API_KEY
      || '',
    ).trim(),
  );

  return hasGoogleKey ? 'google' : 'geoapify';
}

async function runProvider(provider, payload) {
  if (provider === 'google') {
    return computeRouteWithGoogleDirections(payload);
  }

  return computeRouteWithGeoapify(payload);
}

export async function computeRoute({ waypoints = [], mode = 'drive', options = {} }) {
  const normalized = dedupeConsecutiveWaypoints(normalizeWaypoints(waypoints));

  if (normalized.length < 2) {
    return {
      ok: false,
      error: {
        code: 'INSUFFICIENT_WAYPOINTS',
        message: 'At least 2 valid waypoints are required for routing.',
      },
      route: {
        distance: 0,
        duration: 0,
        polyline: normalized.map((point) => [point.lat, point.lng]),
        legs: [],
        provider: null,
      },
    };
  }

  const provider = getProviderName();
  const hash = buildRouteHash({ waypoints: normalized, mode, provider });
  const cached = routeCache.get(hash);

  if (cached) {
    return {
      ok: true,
      cacheHit: true,
      inputHash: hash,
      route: cached,
    };
  }

  const result = await runProvider(provider, { waypoints: normalized, mode, options });
  if (!result?.ok) {
    return {
      ok: false,
      error: result?.error || {
        code: 'ROUTING_FAILED',
        message: 'Routing provider failed to compute a route.',
      },
      route: {
        distance: 0,
        duration: 0,
        polyline: normalized.map((point) => [point.lat, point.lng]),
        legs: [],
        provider,
      },
    };
  }

  routeCache.set(hash, result.route);

  return {
    ok: true,
    cacheHit: false,
    inputHash: hash,
    route: result.route,
  };
}
