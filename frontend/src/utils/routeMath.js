const DEFAULT_AVERAGE_SPEED_KMH = {
  drive: 30,
  car: 30,
  walk: 5,
  walking: 5,
  bicycle: 16,
  bike: 16,
  cycling: 16,
  truck: 28,
};

export function getAverageSpeedKmh(mode = 'drive', overrideSpeedKmh = null) {
  const override = Number(overrideSpeedKmh);
  if (Number.isFinite(override) && override > 0) {
    return override;
  }

  const normalizedMode = String(mode || 'drive').toLowerCase();
  return DEFAULT_AVERAGE_SPEED_KMH[normalizedMode] || DEFAULT_AVERAGE_SPEED_KMH.drive;
}

export function getDistanceKm(distanceMeters = 0) {
  const meters = Number(distanceMeters);
  if (!Number.isFinite(meters) || meters <= 0) return 0;
  return meters / 1000;
}

export function getEstimatedMinutes(distanceMeters = 0, mode = 'drive', overrideSpeedKmh = null) {
  const distanceKm = getDistanceKm(distanceMeters);
  if (distanceKm <= 0) return 0;

  const normalizedMode = String(mode || 'drive').toLowerCase();
  const speedKmh = getAverageSpeedKmh(normalizedMode, overrideSpeedKmh);
  const baseMinutes = (distanceKm / speedKmh) * 60;
  const cityBufferMinutes = ['drive', 'car', 'truck'].includes(normalizedMode) ? 6 : 0;

  return Math.max(1, Math.round(baseMinutes + cityBufferMinutes));
}

export function formatDistance(distanceMeters = 0, digits = 1) {
  const distanceKm = getDistanceKm(distanceMeters);
  if (!distanceKm) return '0 km';
  return `${distanceKm.toFixed(digits)} km`;
}

export function buildRouteMetrics(route = {}, mode = 'drive', options = {}) {
  const distanceMeters = Number(route?.distance) || 0;
  const durationSeconds = Number(route?.duration) || 0;
  const averageSpeedKmh = getAverageSpeedKmh(mode, options?.averageSpeedKmh ?? options?.speedKmh);

  return {
    distanceMeters,
    distanceKm: getDistanceKm(distanceMeters),
    durationSeconds,
    durationMinutes: durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : 0,
    estimatedMinutes: getEstimatedMinutes(distanceMeters, mode, options?.averageSpeedKmh ?? options?.speedKmh),
    averageSpeedKmh,
    legs: Array.isArray(route?.legs) ? route.legs : [],
    polyline: Array.isArray(route?.polyline) ? route.polyline : [],
    provider: route?.provider || null,
  };
}
