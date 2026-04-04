import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import PlacesMap from '../components/PlacesMap';
import { optimizeDayPlaces } from '../utils/dayRouteOptimizer';

const OPENCAGE_API_KEY = import.meta.env.VITE_OPENCAGE_API_KEY || '28c64189eddc4ad5a26acec1c867fdc8';
const SNAPSHOT_KEY = 'itinerary-planner:snapshot:v1';

function getPlaceLabel(place) {
  if (!place) return '';
  return typeof place === 'string' ? place : place.name || '';
}

function normalizeName(value = '') {
  return String(value || '').toLowerCase().split(',')[0].trim();
}

function sameCity(a = '', b = '') {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function readSnapshot() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.journey || !parsed?.itineraryBundle) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(snapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage failures.
  }
}

function clearSnapshot() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function pickPlaceForActivity(activity, selectedPlaces, dayCity = '', used = new Set()) {
  const activityTitle = normalizeName(activity?.title || '');
  const activityLocation = normalizeName(activity?.location || '');
  const dayCityKey = normalizeName(dayCity || '');

  let bestIndex = -1;
  let bestScore = 0;

  selectedPlaces.forEach((place, index) => {
    if (used.has(index)) return;

    const placeName = normalizeName(place?.name || '');
    const placeLocation = normalizeName(place?.location || '');
    if (!placeName) return;

    let score = 0;
    if (activityTitle && activityTitle.includes(placeName)) score += 6;
    if (activityTitle && placeName.includes(activityTitle)) score += 2;
    if (activityLocation && placeLocation && activityLocation.includes(placeLocation)) score += 3;
    if (dayCityKey && placeLocation && dayCityKey === placeLocation) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
      return;
    }

    if (score === bestScore && score > 0 && bestIndex >= 0 && index < bestIndex) {
      bestIndex = index;
    }
  });

  if (bestIndex < 0 || bestScore <= 0) return null;
  return { index: bestIndex, place: selectedPlaces[bestIndex] };
}

async function geocodePlace(name) {
  if (!name || !OPENCAGE_API_KEY) return null;

  try {
    const response = await fetch(
      `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(name)}&key=${OPENCAGE_API_KEY}&limit=1`,
    );
    const data = await response.json();
    const first = data?.results?.[0];
    if (!first?.geometry) return null;

    return {
      lat: Number(first.geometry.lat),
      lng: Number(first.geometry.lng),
    };
  } catch {
    return null;
  }
}

function formatTransit(travel) {
  if (!travel?.from || !travel?.to) return null;
  const mode = travel.mode ? ` via ${travel.mode}` : '';
  const duration = travel.duration ? ` (${travel.duration})` : '';
  return `${travel.from} -> ${travel.to}${mode}${duration}`;
}

export default function ItineraryPlannerPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const incomingJourney = location.state?.journey || null;
  const incomingItineraryBundle = location.state?.itinerary || null;
  const incomingSelectedPlaces = Array.isArray(location.state?.selectedPlaces) ? location.state.selectedPlaces : [];
  const incomingTripId = location.state?.tripId || '';

  const [journey, setJourney] = useState(incomingJourney);
  const [itineraryBundle, setItineraryBundle] = useState(incomingItineraryBundle);
  const [selectedPlaces, setSelectedPlaces] = useState(incomingSelectedPlaces);
  const [tripId, setTripId] = useState(incomingTripId);

  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [focusedPlaceName, setFocusedPlaceName] = useState('');
  const [resolvedRoutePlaces, setResolvedRoutePlaces] = useState([]);
  const [resolvedDayActivityPlaces, setResolvedDayActivityPlaces] = useState([]);
  const [routeRefreshToken, setRouteRefreshToken] = useState(0);
  const [routeError, setRouteError] = useState('');
  const [toast, setToast] = useState(null);

  const toastTimerRef = useRef(null);
  const lastRemovedRef = useRef(null);
  const attemptedCoordinateResolutionRef = useRef(new Set());
  const dayActivityGeoCacheRef = useRef(new Map());

  const showToast = (nextToast) => {
    setToast(nextToast);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  };

  useEffect(() => () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const hasIncoming = Boolean(incomingJourney && incomingItineraryBundle);

    if (hasIncoming) {
      // New trip generation should reset previous snapshot state.
      clearSnapshot();
      setJourney(incomingJourney);
      setItineraryBundle(incomingItineraryBundle);
      setSelectedPlaces(incomingSelectedPlaces);
      setTripId(incomingTripId || '');
      setActiveDayIndex(0);
      return;
    }

    const saved = readSnapshot();
    if (!saved) return;

    setJourney(saved.journey || null);
    setItineraryBundle(saved.itineraryBundle || null);
    setSelectedPlaces(Array.isArray(saved.selectedPlaces) ? saved.selectedPlaces : []);
    setTripId(saved.tripId || '');
    setActiveDayIndex(Number.isInteger(saved.activeDayIndex) ? Math.max(saved.activeDayIndex, 0) : 0);
  }, [incomingItineraryBundle, incomingJourney, incomingSelectedPlaces, incomingTripId]);

  useEffect(() => {
    if (!journey || !itineraryBundle) return;
    writeSnapshot({
      journey,
      itineraryBundle,
      selectedPlaces,
      activeDayIndex,
      tripId,
    });
  }, [activeDayIndex, itineraryBundle, journey, selectedPlaces, tripId]);

  const days = useMemo(() => {
    if (!itineraryBundle?.itinerary || !Array.isArray(itineraryBundle.itinerary)) return [];
    return itineraryBundle.itinerary;
  }, [itineraryBundle]);

  const activeDayMapPlaces = useMemo(() => selectedPlaces, [selectedPlaces]);

  const activeDay = days[activeDayIndex] || null;

  useEffect(() => {
    let cancelled = false;

    const resolveDayActivities = async () => {
      if (!activeDay) {
        setResolvedDayActivityPlaces([]);
        return;
      }

      const activities = Array.isArray(activeDay.activities) ? activeDay.activities : [];
      if (!activities.length) {
        setResolvedDayActivityPlaces([]);
        return;
      }

      const bySelected = [];
      const matchedActivityIndexes = new Set();
      const usedSelected = new Set();

      activities.forEach((activity, activityIndex) => {
        const picked = pickPlaceForActivity(activity, selectedPlaces, activeDay.city, usedSelected);
        if (!picked?.place) return;
        usedSelected.add(picked.index);
        matchedActivityIndexes.add(activityIndex);
        bySelected.push(picked.place);
      });

      const missingCount = activities.length - bySelected.length;
      const resolvedMissing = missingCount > 0
        ? await Promise.all(activities.map(async (activity, index) => {
          if (matchedActivityIndexes.has(index)) return null;

          const location = activity?.location || activeDay.city || '';
          const title = activity?.title || `Stop ${index + 1}`;

          const locationMatch = (selectedPlaces || []).find((place) => {
            const lat = Number(place?.lat);
            const lng = Number(place?.lng ?? place?.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
            return sameCity(place?.location, location || activeDay.city);
          });

          if (locationMatch) {
            return {
              name: locationMatch.name || title,
              location: locationMatch.location || location || activeDay.city || '',
              lat: Number(locationMatch.lat),
              lng: Number(locationMatch.lng ?? locationMatch.lon),
            };
          }

          const query = [location, activeDay.city, title].filter(Boolean).join(', ');
          const cached = dayActivityGeoCacheRef.current.get(query);
          if (cached) {
            return {
              name: title,
              location: location || activeDay.city || '',
              lat: cached.lat,
              lng: cached.lng,
            };
          }

          const geo = await geocodePlace(query);
          if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return null;
          dayActivityGeoCacheRef.current.set(query, { lat: Number(geo.lat), lng: Number(geo.lng) });

          return {
            name: title,
            location: location || activeDay.city || '',
            lat: Number(geo.lat),
            lng: Number(geo.lng),
          };
        }))
        : [];

      if (cancelled) return;

      const merged = [...bySelected, ...(resolvedMissing || []).filter(Boolean)]
        .filter((place) => Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lng ?? place?.lon)));

      const deduped = merged.filter((place, index, all) => {
        const key = `${normalizeName(place?.name)}|${Number(place?.lat).toFixed(5)}|${Number(place?.lng ?? place?.lon).toFixed(5)}`;
        return all.findIndex((candidate) => {
          const candidateKey = `${normalizeName(candidate?.name)}|${Number(candidate?.lat).toFixed(5)}|${Number(candidate?.lng ?? candidate?.lon).toFixed(5)}`;
          return candidateKey === key;
        }) === index;
      });

      setResolvedDayActivityPlaces(optimizeDayPlaces(deduped));
    };

    resolveDayActivities();

    return () => {
      cancelled = true;
    };
  }, [activeDay, selectedPlaces]);

  const activeDayRoutePlaces = useMemo(() => {
    if (resolvedDayActivityPlaces.length > 0) {
      return optimizeDayPlaces(resolvedDayActivityPlaces);
    }

    if (!activeDay) return [];

    const used = new Set();
    const matched = (activeDay.activities || [])
      .map((activity) => {
        const picked = pickPlaceForActivity(activity, selectedPlaces, activeDay.city, used);
        if (!picked) return null;
        used.add(picked.index);
        return picked.place;
      })
      .filter(Boolean);

    if (matched.length >= 2) {
      return optimizeDayPlaces(matched);
    }

    // Fallback: use places from the active day's city so map changes per day even
    // when activity titles/locations do not exactly match selected place names.
    const dayCityPlaces = (selectedPlaces || []).filter((place) => {
      const lat = Number(place?.lat);
      const lng = Number(place?.lng ?? place?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      return sameCity(place?.location, activeDay.city);
    });

    if (dayCityPlaces.length >= 2) {
      return optimizeDayPlaces(dayCityPlaces);
    }

    return optimizeDayPlaces(matched.length ? matched : dayCityPlaces);
  }, [activeDay, resolvedDayActivityPlaces, selectedPlaces]);

  const removeSinglePlaceInstance = (activity, dayCity) => {
    const used = new Set();
    const found = pickPlaceForActivity(activity, selectedPlaces, dayCity, used);
    if (!found) return null;

    const nextPlaces = [...selectedPlaces];
    const [removedPlace] = nextPlaces.splice(found.index, 1);
    setSelectedPlaces(nextPlaces);

    return {
      place: removedPlace,
      index: found.index,
    };
  };

  const handleRemoveActivity = (dayIndex, activityIndex) => {
    if (!itineraryBundle?.itinerary?.[dayIndex]) return;

    const targetDay = itineraryBundle.itinerary[dayIndex];
    const activity = targetDay?.activities?.[activityIndex];
    if (!activity) return;

    const removedPlaceInfo = removeSinglePlaceInstance(activity, targetDay.city);

    const nextDays = [...itineraryBundle.itinerary];
    const nextDayActivities = [...(targetDay.activities || [])];
    nextDayActivities.splice(activityIndex, 1);

    let dayRemoved = false;
    let removedDaySnapshot = null;

    if (nextDayActivities.length === 0) {
      dayRemoved = true;
      removedDaySnapshot = targetDay;
      nextDays.splice(dayIndex, 1);
    } else {
      nextDays[dayIndex] = {
        ...targetDay,
        activities: nextDayActivities,
      };
    }

    const nextItinerary = {
      ...itineraryBundle,
      itinerary: nextDays,
    };

    setItineraryBundle(nextItinerary);
    setActiveDayIndex((prev) => {
      if (!dayRemoved) return prev;
      if (prev > dayIndex) return prev - 1;
      return Math.min(prev, Math.max(nextDays.length - 1, 0));
    });
    setRouteRefreshToken((prev) => prev + 1);

    lastRemovedRef.current = {
      activity,
      dayIndex,
      activityIndex,
      dayRemoved,
      removedDaySnapshot,
      removedPlaceInfo,
    };

    showToast({
      kind: 'remove',
      message: 'Place removed from itinerary.',
      actionLabel: 'Undo',
    });
  };

  const handleUndoRemove = () => {
    const payload = lastRemovedRef.current;
    if (!payload || !itineraryBundle) return;

    const nextDays = [...(itineraryBundle.itinerary || [])];
    const targetIndex = Math.min(payload.dayIndex, nextDays.length);

    if (payload.dayRemoved) {
      nextDays.splice(targetIndex, 0, payload.removedDaySnapshot);
    } else {
      const day = nextDays[targetIndex];
      if (!day) return;
      const activities = [...(day.activities || [])];
      const insertAt = Math.min(payload.activityIndex, activities.length);
      activities.splice(insertAt, 0, payload.activity);
      nextDays[targetIndex] = {
        ...day,
        activities,
      };
    }

    if (payload.removedPlaceInfo?.place) {
      setSelectedPlaces((prev) => {
        const next = [...prev];
        const index = Math.min(payload.removedPlaceInfo.index, next.length);
        next.splice(index, 0, payload.removedPlaceInfo.place);
        return next;
      });
    }

    setItineraryBundle({
      ...itineraryBundle,
      itinerary: nextDays,
    });
    setActiveDayIndex(Math.min(payload.dayIndex, Math.max(nextDays.length - 1, 0)));
    setRouteRefreshToken((prev) => prev + 1);

    lastRemovedRef.current = null;
    showToast({
      kind: 'undo',
      message: 'Place restored and route re-optimized.',
      actionLabel: null,
    });
  };

  useEffect(() => {
    let cancelled = false;

    const resolveRoutePlaces = async () => {
      const route = Array.isArray(journey?.route) ? journey.route : [];
      if (!route.length) {
        setResolvedRoutePlaces([]);
        return;
      }

      const resolved = await Promise.all(route.map(async (entry) => {
        const name = getPlaceLabel(entry);
        if (!name) return null;

        const directLat = Number(typeof entry === 'string' ? NaN : entry?.lat);
        const directLng = Number(typeof entry === 'string' ? NaN : entry?.lng);
        if (Number.isFinite(directLat) && Number.isFinite(directLng)) {
          return { name, location: name, lat: directLat, lng: directLng };
        }

        const matched = selectedPlaces.find((place) => {
          const placeName = normalizeName(place?.name);
          const placeLoc = normalizeName(place?.location);
          const checkpoint = normalizeName(name);
          return placeName === checkpoint || placeLoc === checkpoint;
        });

        const matchedLat = Number(matched?.lat);
        const matchedLng = Number(matched?.lng);
        if (Number.isFinite(matchedLat) && Number.isFinite(matchedLng)) {
          return { name, location: name, lat: matchedLat, lng: matchedLng };
        }

        const geo = await geocodePlace(name);
        if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
          return { name, location: name, lat: geo.lat, lng: geo.lng };
        }

        return null;
      }));

      if (cancelled) return;

      setResolvedRoutePlaces(resolved.filter((place) => place && Number.isFinite(place.lat) && Number.isFinite(place.lng)));
    };

    resolveRoutePlaces();

    return () => {
      cancelled = true;
    };
  }, [journey, selectedPlaces]);

  const routeCheckpointPlaces = useMemo(() => resolvedRoutePlaces, [resolvedRoutePlaces]);

  useEffect(() => {
    if (!Array.isArray(selectedPlaces) || selectedPlaces.length === 0) return;

    const pending = selectedPlaces
      .map((place, index) => ({ place, index }))
      .filter(({ place }) => {
        const lat = Number(place?.lat);
        const lng = Number(place?.lng ?? place?.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return false;

        const key = `${normalizeName(place?.name)}|${normalizeName(place?.location)}`;
        return key && !attemptedCoordinateResolutionRef.current.has(key);
      });

    if (pending.length === 0) return;

    let cancelled = false;

    const resolveMissingCoords = async () => {
      const updates = await Promise.all(pending.map(async ({ place, index }) => {
        const key = `${normalizeName(place?.name)}|${normalizeName(place?.location)}`;
        attemptedCoordinateResolutionRef.current.add(key);

        const byCheckpoint = routeCheckpointPlaces.find((checkpoint) => {
          const locKey = normalizeName(place?.location);
          const checkpointKey = normalizeName(checkpoint?.name);
          return locKey && checkpointKey && locKey === checkpointKey;
        });

        if (byCheckpoint && Number.isFinite(Number(byCheckpoint.lat)) && Number.isFinite(Number(byCheckpoint.lng))) {
          return {
            index,
            lat: Number(byCheckpoint.lat),
            lng: Number(byCheckpoint.lng),
          };
        }

        const query = [place?.name, place?.location].filter(Boolean).join(', ').trim();
        const geo = await geocodePlace(query);
        if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return null;

        return {
          index,
          lat: Number(geo.lat),
          lng: Number(geo.lng),
        };
      }));

      if (cancelled) return;
      const validUpdates = updates.filter(Boolean);
      if (validUpdates.length === 0) return;

      setSelectedPlaces((prev) => {
        const next = [...prev];
        validUpdates.forEach((update) => {
          const current = next[update.index];
          if (!current) return;
          next[update.index] = {
            ...current,
            lat: update.lat,
            lng: update.lng,
          };
        });
        return next;
      });
    };

    resolveMissingCoords();

    return () => {
      cancelled = true;
    };
  }, [routeCheckpointPlaces, selectedPlaces]);

  const mapPlaces = useMemo(() => {
    const withCoords = (activeDayMapPlaces || []).filter((place) => {
      const lat = Number(place?.lat);
      const lng = Number(place?.lng ?? place?.lon);
      return Number.isFinite(lat) && Number.isFinite(lng);
    });

    return withCoords.length ? withCoords : routeCheckpointPlaces;
  }, [activeDayMapPlaces, routeCheckpointPlaces]);
  const activeDayPlaceNames = activeDayRoutePlaces.map((place) => place?.name).filter(Boolean);

  if (!journey || !itineraryBundle) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center px-6">
        <div className="max-w-lg rounded-2xl border border-slate-700 bg-slate-900/70 p-6 text-center">
          <h1 className="text-2xl font-semibold">No itinerary data found</h1>
          <p className="mt-2 text-sm text-slate-300">Generate an itinerary from Agent Home first.</p>
          <button
            type="button"
            onClick={() => navigate('/agent-home')}
            className="mt-5 rounded-xl border border-amber-300/40 bg-linear-to-r from-amber-300 via-amber-500 to-amber-700 px-5 py-3 text-sm font-semibold text-slate-950"
          >
            Back to Agent Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(1100px_540px_at_85%_-10%,rgba(245,158,11,0.12),transparent_60%),linear-gradient(160deg,#020617_0%,#0b1324_48%,#020617_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <header className="mb-6 rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Mission Itinerary</p>
          <h1 className="mt-2 text-3xl font-semibold">{journey.origin?.name || journey.origin} to {journey.destination?.name || journey.destination}</h1>
          <p className="mt-2 text-sm text-slate-300">Day-wise route planner with transit, activities, dining, and local exploration picks.</p>
        </header>

        <section className="grid gap-6 lg:grid-cols-12">
          <aside className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 lg:col-span-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">Map Zone</h2>
            <div className="mt-4 space-y-4 rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-slate-400">
              <PlacesMap
                places={mapPlaces}
                routePlaces={activeDayRoutePlaces}
                className="h-96"
                showRoute
                originName={journey?.origin?.name || journey?.origin || ''}
                destinationName={journey?.destination?.name || journey?.destination || ''}
                activePlaceNames={activeDayPlaceNames}
                focusPlaceName={focusedPlaceName}
                onMarkerClick={(name) => setFocusedPlaceName(name)}
                routeRefreshToken={routeRefreshToken}
                fitSignal={`${activeDayIndex}:${routeRefreshToken}`}
                onRouteError={(error) => setRouteError(error?.message || 'Route service unavailable. Showing fallback path.')}
              />
              <div className="flex items-center justify-between gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setRouteRefreshToken((prev) => prev + 1)}
                  className="rounded border border-amber-300/40 bg-amber-500/10 px-3 py-1.5 text-amber-200 transition hover:bg-amber-500/20"
                >
                  Refresh Route
                </button>
                {routeError ? <span className="text-amber-200/90">{routeError}</span> : <span className="text-slate-500">Active day route</span>}
              </div>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Mapped Stops</p>
                <ul className="mt-2 space-y-2 text-sm text-slate-300">
                  {(activeDayRoutePlaces.length ? activeDayRoutePlaces : mapPlaces).slice(0, 12).map((place, index) => (
                    <li key={`${place.name}-${index}`}>
                      <button
                        type="button"
                        onClick={() => setFocusedPlaceName(place.name || '')}
                        className={`w-full rounded border px-3 py-2 text-left transition ${focusedPlaceName === place.name ? 'border-amber-300/70 bg-amber-500/10 text-amber-100' : 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-amber-300/40'}`}
                      >
                        {place.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 lg:col-span-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">Planner Itinerary</h2>

            <div className="mt-4 space-y-5">
              {days.map((day, index) => (
                <article
                  key={`${day.day || index + 1}-${day.city || 'city'}`}
                  onClick={() => setActiveDayIndex(index)}
                  className={`cursor-pointer rounded-xl border bg-slate-950/60 p-5 transition ${activeDayIndex === index ? 'border-amber-300/70' : 'border-slate-700'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <h3 className="text-xl font-semibold text-amber-200">Day {day.day || index + 1}</h3>
                    <p className="text-sm text-slate-300">{day.city || 'Unknown city'} {day.theme ? `• ${day.theme}` : ''}</p>
                  </div>

                  <div className="mt-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Transit</p>
                    {formatTransit(day.travel) ? (
                      <>
                        <p className="mt-1 text-base font-semibold text-amber-100">{formatTransit(day.travel)}</p>
                        {day.travel?.note ? <p className="mt-1 text-sm text-amber-100/90">{day.travel.note}</p> : null}
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-slate-300">No inter-city transfer planned for this day.</p>
                    )}
                  </div>

                  <div className="mt-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Weather</p>
                    <p className="mt-1 text-base font-semibold text-cyan-100">{day.weather || 'Not specified'}</p>
                    {day.weather_note ? <p className="mt-1 text-sm text-cyan-100/90">{day.weather_note}</p> : null}
                  </div>

                  <div className="mt-5 grid gap-6 md:grid-cols-2">
                    <section>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Activities</p>
                      <ol className="mt-3 space-y-3">
                        {(day.activities || []).map((activity, activityIndex) => (
                          <li key={`${day.day}-${activityIndex}`} className="pl-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-100">{activity.time || 'Flexible time'} • {activity.title}</p>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRemoveActivity(index, activityIndex);
                                }}
                                className="rounded border border-red-300/40 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-200 transition hover:bg-red-500/20"
                                title="Remove this place"
                              >
                                Remove
                              </button>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">{activity.location || day.city}</p>
                            {activity.description ? <p className="mt-1 text-sm text-slate-300">{activity.description}</p> : null}
                          </li>
                        ))}
                      </ol>

                      <div className="mt-5">
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Local Explorations</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                          {(day.local_explorations || []).map((item, itemIndex) => (
                            <li key={`${day.day}-local-${itemIndex}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </section>

                    <section>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Dining Picks</p>
                      <ul className="mt-3 space-y-3">
                        {(day.dining_places || []).map((spot, spotIndex) => (
                          <li key={`${day.day}-dining-${spotIndex}`} className="pl-1">
                            <p className="text-base font-semibold text-slate-100">{spot.name || 'Recommended dining place'}</p>
                            <p className="mt-1 text-sm text-slate-300">{spot.cuisine || 'Cuisine'} • {spot.area || day.city}</p>
                            {spot.best_for ? <p className="mt-1 text-sm text-emerald-200/90">Best for: {spot.best_for}</p> : null}
                          </li>
                        ))}
                        {(!day.dining_places || day.dining_places.length === 0) ? (
                          <li className="text-sm text-slate-400">No dining picks generated for this day.</li>
                        ) : null}
                      </ul>

                      <div className="mt-5">
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Stay</p>
                        {day.stay?.area ? (
                          <>
                            <p className="mt-2 text-base font-semibold text-emerald-100">{day.stay.area} {day.stay.type ? `• ${day.stay.type}` : ''}</p>
                            {day.stay.reason ? <p className="mt-1 text-sm text-emerald-100/90">{day.stay.reason}</p> : null}
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-slate-300">Stay recommendation not available.</p>
                        )}
                      </div>
                    </section>
                  </div>

                  <div className="mt-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Tips</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                      {(day.tips || []).map((tip, tipIndex) => (
                        <li key={`${day.day}-tip-${tipIndex}`}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/agent-home"
            className="rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
          >
            Back to Planner
          </Link>
          <Link
            to="/weather-dashboard"
            className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/30"
          >
            Open Weather Dashboard
          </Link>
        </div>
      </div>

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 max-w-xs rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-xl">
          <p className="text-sm text-slate-100">{toast.message}</p>
          {toast.actionLabel ? (
            <button
              type="button"
              onClick={handleUndoRemove}
              className="mt-2 rounded border border-amber-300/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20"
            >
              {toast.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
