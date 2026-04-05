function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toPoint(place) {
  const lat = toNumber(place?.lat);
  const lng = toNumber(place?.lng ?? place?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function distanceKm(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const val = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(val), Math.sqrt(1 - val));
}

export function optimizeDayPlaces(places = []) {
  if (!Array.isArray(places) || places.length <= 1) {
    return Array.isArray(places) ? [...places] : [];
  }

  const decorated = places.map((place, index) => ({
    place,
    index,
    point: toPoint(place),
  }));

  const valid = decorated.filter((item) => item.point);
  if (valid.length <= 1) return [...places];

  const invalid = decorated.filter((item) => !item.point);
  const remaining = valid.slice(1);
  const ordered = [valid[0]];

  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    let bestIndex = 0;
    let bestDistance = Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const nextDistance = distanceKm(current.point, candidate.point);

      if (nextDistance < bestDistance) {
        bestDistance = nextDistance;
        bestIndex = index;
        continue;
      }

      // Stable deterministic tie-break by original index.
      if (nextDistance === bestDistance && candidate.index < remaining[bestIndex].index) {
        bestIndex = index;
      }
    }

    ordered.push(...remaining.splice(bestIndex, 1));
  }

  return [...ordered, ...invalid]
    .sort((a, b) => {
      const aInvalid = !a.point;
      const bInvalid = !b.point;
      if (aInvalid && bInvalid) return a.index - b.index;
      if (aInvalid) return 1;
      if (bInvalid) return -1;
      return 0;
    })
    .map((item) => item.place);
}
