import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MotionSection = motion.section;
const OPENCAGE_API_KEY = import.meta.env.VITE_OPENCAGE_API_KEY ;

const HISTORY_KEY = 'agentJourneyHistory';
const STEP_ITEMS = ['Plan Your Trip', 'Customize Route', 'Stay Preferences', 'Final Route'];
const DUMMY_NIGHTS_PATTERN = [2, 1, 3, 2, 1, 2];

function getPlaceLabel(place) {
  if (!place) return '';
  return typeof place === 'string' ? place : place.name || '';
}

async function fetchPlaces(query) {
  if (!query || query.length < 2) return [];

  try {
    const response = await fetch(
      `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${OPENCAGE_API_KEY}&limit=5`,
    );
    const data = await response.json();

    return (data.results || []).map((item) => ({
      name: item.formatted,
      lat: item.geometry.lat,
      lng: item.geometry.lng,
    }));
  } catch (error) {
    console.error('Error fetching places', error);
    return [];
  }
}

function useDebouncedSearch(query) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      const data = await fetchPlaces(query);
      setResults(data);
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [query]);

  return results;
}

function distanceKmCoords(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const aVal = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

function findBestRoute(origin, destination, stops) {
  const remainingStops = [...stops];
  const orderedRoute = [origin];
  let current = origin;
  let totalDistance = 0;

  while (remainingStops.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = distanceKmCoords(current, remainingStops[0]);

    for (let index = 1; index < remainingStops.length; index += 1) {
      const candidateDistance = distanceKmCoords(current, remainingStops[index]);
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance;
        nearestIndex = index;
      }
    }

    const [nextStop] = remainingStops.splice(nearestIndex, 1);
    orderedRoute.push(nextStop);
    totalDistance += nearestDistance;
    current = nextStop;
  }

  totalDistance += distanceKmCoords(current, destination);
  orderedRoute.push(destination);

  return {
    route: orderedRoute,
    totalDistance: Math.round(totalDistance),
    estimatedHours: Math.max(1, Math.round(totalDistance / 780)),
  };
}

export default function AgentHomePage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [origin, setOrigin] = useState(null);
  const [originInput, setOriginInput] = useState('');
  const [destination, setDestination] = useState(null);
  const [destinationInput, setDestinationInput] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [comingDate, setComingDate] = useState('');
  const [budgetRange, setBudgetRange] = useState([1200, 4500]);
  const [newStop, setNewStop] = useState(null);
  const [newStopInput, setNewStopInput] = useState('');
  const [stops, setStops] = useState([]);
  const [result, setResult] = useState(null);
  const [finalizedRoute, setFinalizedRoute] = useState([]);
  const [stayPreferences, setStayPreferences] = useState({
    hotel3: true,
    hotel4: true,
    hotel5: true,
    travelers: 1,
    rooms: 1,
  });
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [dragStopIndex, setDragStopIndex] = useState(null);
  const [dragRouteIndex, setDragRouteIndex] = useState(null);
  const [previewStop, setPreviewStop] = useState(null);
  const [previewStopInput, setPreviewStopInput] = useState('');
  const [previewNights, setPreviewNights] = useState(1);
  const [showPreviewAddBox, setShowPreviewAddBox] = useState(false);
  const [showPreviewEditBox, setShowPreviewEditBox] = useState(false);
  const [editingRouteIndex, setEditingRouteIndex] = useState(null);
  const [editStopInput, setEditStopInput] = useState('');
  const [editNights, setEditNights] = useState(1);
  const [editStopSelection, setEditStopSelection] = useState(null);

  const originSuggestions = useDebouncedSearch(originInput);
  const destinationSuggestions = useDebouncedSearch(destinationInput);
  const stopSuggestions = useDebouncedSearch(newStopInput);
  const previewStopSuggestions = useDebouncedSearch(previewStopInput);
  const editStopSuggestions = useDebouncedSearch(editStopInput);

  useEffect(() => {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setHistory(
          parsed.map((item) => ({
            ...item,
            departureDate: item.departureDate || '',
            comingDate: item.comingDate || '',
            budgetRange: Array.isArray(item.budgetRange) ? item.budgetRange : [0, 0],
          })),
        );
      }
    } catch {
      setHistory([]);
    }
  }, []);

  const availableStopOptions = useMemo(() => {
    const selectedOrigin = getPlaceLabel(origin);
    const selectedDestination = getPlaceLabel(destination);
    const selectedStops = new Set(stops.map((stop) => stop.name));

    return stopSuggestions.filter(
      (place) => !selectedStops.has(place.name) && place.name !== selectedOrigin && place.name !== selectedDestination,
    );
  }, [stopSuggestions, origin, destination, stops]);

  const addStop = () => {
    setError('');

    if (!newStop) return;

    if (!availableStopOptions.some((place) => place.name === newStop.name)) {
      setError('Choose a checkpoint from the dropdown suggestions.');
      return;
    }

    if (stops.some((stop) => stop.name === newStop.name)) return;

    setStops((prev) => [...prev, newStop]);
    setNewStop(null);
    setNewStopInput('');
  };

  const removeStop = (stopToRemove) => {
    setStops((prev) => prev.filter((stop) => stop.name !== stopToRemove.name));
  };

  const reorderStops = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) return;

    setStops((previous) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= previous.length || toIndex >= previous.length) {
        return previous;
      }

      const nextStops = [...previous];
      const [movedStop] = nextStops.splice(fromIndex, 1);
      nextStops.splice(toIndex, 0, movedStop);
      return nextStops;
    });
  };

  const reorderRoute = (fromIndex, toIndex) => {
    if (!result || fromIndex === toIndex || fromIndex == null || toIndex == null) return;

    const routeSource = finalizedRoute.length > 0 ? finalizedRoute : result.route || [];
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= routeSource.length ||
      toIndex >= routeSource.length
    ) {
      return;
    }

    const moving = routeSource[fromIndex];
    const target = routeSource[toIndex];
    const movingIsCore = getPlaceLabel(moving) === getPlaceLabel(origin);
    const targetIsCore = getPlaceLabel(target) === getPlaceLabel(origin);
    if (movingIsCore || targetIsCore) return;

    const nextRoute = [...routeSource];
    const [moved] = nextRoute.splice(fromIndex, 1);
    nextRoute.splice(toIndex, 0, moved);
    setFinalizedRoute(nextRoute);
  };

  const editRoutePoint = (index) => {
    if (!result) return;

    const routeSource = finalizedRoute.length > 0 ? finalizedRoute : result.route || [];
    const point = routeSource[index];
    if (!point) return;

    const isCore = getPlaceLabel(point) === getPlaceLabel(origin);
    if (isCore) return;

    setEditingRouteIndex(index);
    setEditStopInput(point.name || '');
    setEditNights(Math.max(1, Number(point.nights || 1)));
    setEditStopSelection(null);
    setShowPreviewAddBox(false);
    setShowPreviewEditBox(true);
  };

  const deleteRoutePoint = (index) => {
    if (!result) return;

    const routeSource = finalizedRoute.length > 0 ? finalizedRoute : result.route || [];
    const point = routeSource[index];
    if (!point) return;

    const isCore = getPlaceLabel(point) === getPlaceLabel(origin);
    if (isCore) return;

    const updatedRoute = routeSource.filter((_, routeIndex) => routeIndex !== index);
    setFinalizedRoute(updatedRoute);
  };

  const addPreviewDestination = () => {
    if (!result) return;

    const typedName = (previewStopInput || '').trim();
    if (!previewStop && !typedName) {
      setError('Enter destination name before adding.');
      return;
    }

    const routeSource = finalizedRoute.length > 0 ? finalizedRoute : result.route || [];
    const basePoint = routeSource[routeSource.length - 1] || destination || origin;
    const fallbackLat = typeof basePoint?.lat === 'number' ? basePoint.lat : 20;
    const fallbackLng = typeof basePoint?.lng === 'number' ? basePoint.lng : 0;
    const newPoint = {
      ...(previewStop || {}),
      name: previewStop?.name || typedName,
      lat: typeof previewStop?.lat === 'number' ? previewStop.lat : fallbackLat + 0.12,
      lng: typeof previewStop?.lng === 'number' ? previewStop.lng : fallbackLng + 0.12,
      nights: Math.max(1, Number(previewNights || 1)),
    };

    setError('');
    setFinalizedRoute([...routeSource, newPoint]);
    setPreviewStop(null);
    setPreviewStopInput('');
    setPreviewNights(1);
    setShowPreviewAddBox(false);
    setDragRouteIndex(null);
  };

  const applyPreviewEdit = () => {
    if (!result || editingRouteIndex == null) return;

    const nextName = (editStopInput || '').trim();
    if (!nextName) {
      setError('Enter destination name before saving edits.');
      return;
    }

    const routeSource = finalizedRoute.length > 0 ? finalizedRoute : result.route || [];
    if (editingRouteIndex < 0 || editingRouteIndex >= routeSource.length) return;

    const updatedRoute = routeSource.map((item, routeIndex) =>
      routeIndex === editingRouteIndex
        ? {
            ...item,
            name: nextName,
            lat: typeof editStopSelection?.lat === 'number' ? editStopSelection.lat : item.lat,
            lng: typeof editStopSelection?.lng === 'number' ? editStopSelection.lng : item.lng,
            nights: Math.max(1, Number(editNights || 1)),
          }
        : item,
    );

    setError('');
    setFinalizedRoute(updatedRoute);
    setShowPreviewEditBox(false);
    setEditingRouteIndex(null);
    setEditStopInput('');
    setEditNights(1);
    setEditStopSelection(null);
  };

  const buildJourney = () => {
    setError('');

    if (!origin || !destination) {
      setError('Select valid start and destination cities from suggestions.');
      return;
    }

    if (origin.name === destination.name) {
      setError('Origin and destination must be different.');
      return;
    }

    if (!departureDate || !comingDate) {
      setError('Please add both departure and coming dates.');
      return;
    }

    if (new Date(comingDate) < new Date(departureDate)) {
      setError('Coming date must be after departure date.');
      return;
    }

    const optimized = findBestRoute(origin, destination, stops);
    const journeyRecord = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      origin,
      destination,
      departureDate,
      comingDate,
      budgetRange,
      stops,
      route: optimized.route,
      totalDistance: optimized.totalDistance,
      estimatedHours: optimized.estimatedHours,
    };

    setResult(journeyRecord);
    setFinalizedRoute(optimized.route);
    setShowPreviewAddBox(false);
    setShowPreviewEditBox(false);
    setEditingRouteIndex(null);
    setEditStopSelection(null);
    setCurrentStep(2);
  };

  const toggleCheckpoint = (place) => {
    if (!result || place.name === origin?.name) return;

    setFinalizedRoute((previous) => {
      if (previous.some((checkpoint) => checkpoint.name === place.name)) {
        return previous.filter((checkpoint) => checkpoint.name !== place.name);
      }

      return [...previous, place];
    });
  };

  const approveJourney = () => {
    if (!result) return;

    const approvedJourney = {
      ...result,
      route: finalizedRoute.length > 0 ? finalizedRoute : result.route,
      stayPreferences,
    };

    const approvedHistory = [approvedJourney, ...history].slice(0, 12);
    setHistory(approvedHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(approvedHistory));
    navigate('/travel-alerts', { state: { journey: approvedJourney } });
  };

  const activeRoute = finalizedRoute.length > 0 ? finalizedRoute : result?.route || [];
  const previewSelectedNames = new Set(activeRoute.map((place) => getPlaceLabel(place)));
  const availablePreviewStopOptions = previewStopSuggestions.filter(
    (place) => !previewSelectedNames.has(place.name),
  );
  const occupiedEditNames = new Set(
    activeRoute
      .filter((_, index) => index !== editingRouteIndex)
      .map((place) => getPlaceLabel(place)),
  );
  const availableEditStopOptions = editStopSuggestions.filter((place) => !occupiedEditNames.has(place.name));
  const routeMapPoints = activeRoute.filter((place) => typeof place?.lat === 'number' && typeof place?.lng === 'number');
  const routeMapPath = routeMapPoints.map((place) => [place.lat, place.lng]);
  const progressPercent = ((currentStep - 1) / (STEP_ITEMS.length - 1)) * 100;
  const getNightLabel = (place, index) => {
    const nights = Number(place?.nights);
    if (Number.isFinite(nights) && nights > 0) {
      return `${nights} night${nights > 1 ? 's' : ''}`;
    }

    const fallback = DUMMY_NIGHTS_PATTERN[index % DUMMY_NIGHTS_PATTERN.length];
    return `${fallback} night${fallback > 1 ? 's' : ''}`;
  };

  const resetPlanner = () => {
    setResult(null);
    setFinalizedRoute([]);
    setError('');
    setOrigin(null);
    setOriginInput('');
    setDestination(null);
    setDestinationInput('');
    setNewStop(null);
    setNewStopInput('');
    setStops([]);
    setDragStopIndex(null);
    setDragRouteIndex(null);
    setPreviewStop(null);
    setPreviewStopInput('');
    setPreviewNights(1);
    setShowPreviewAddBox(false);
    setShowPreviewEditBox(false);
    setEditingRouteIndex(null);
    setEditStopInput('');
    setEditNights(1);
    setEditStopSelection(null);
    setStayPreferences({
      hotel3: true,
      hotel4: true,
      hotel5: true,
      travelers: 1,
      rooms: 1,
    });
    setCurrentStep(1);
  };

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[radial-gradient(1200px_600px_at_85%_-15%,rgba(245,158,11,0.12),transparent_60%),radial-gradient(1000px_560px_at_0%_100%,rgba(37,99,235,0.18),transparent_56%),linear-gradient(155deg,#020617_0%,#0b1324_45%,#020617_100%)] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[url('/detective.bg.png')] bg-cover bg-center opacity-[0.5]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.4),rgba(2,6,23,0.75))]" aria-hidden="true" />

      <header className="relative z-10 w-full border-b border-amber-300/20 bg-slate-950/70 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-8xl items-start justify-between gap-4  px-4 py-5 md:px-8"> 
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/85">Field Command</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-100 md:text-3xl">Operation Round Table</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">Align route strategy, checkpoints, and approvals from one control desk before final mission lock.</p>
          </div>
          <Link
            to="/login"
            className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/80"
          >
            Sign out
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <section className="mb-8 rounded-2xl border border-slate-600/70 bg-slate-900/36 p-4 shadow-[0_18px_44px_rgba(2,6,23,0.36),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Route Planner</p>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Step {currentStep} of {STEP_ITEMS.length}</p>
          </div>

          <div className="relative h-2 w-full rounded-full bg-slate-800/80">
            <motion.div
              className="h-full rounded-full bg-linear-to-r from-amber-300 via-amber-400 to-blue-400"
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {STEP_ITEMS.map((label, index) => {
              const stepNumber = index + 1;
              const isActive = stepNumber === currentStep;
              const isDone = stepNumber < currentStep;
              const isDisabled = stepNumber > currentStep;

              return (
                <div
                  key={label}
                  className={`rounded-xl border px-3 py-3 text-center text-sm shadow-sm transition ${
                    isActive
                      ? 'border-amber-300/50 bg-slate-950/90 font-semibold text-amber-200 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]'
                      : isDone
                        ? 'border-slate-600 bg-slate-900/80 font-medium text-slate-300'
                        : 'border-slate-700 bg-slate-900/60 font-medium text-slate-500'
                  } ${isDisabled ? 'opacity-70' : ''}`}
                >
                  {label}
                </div>
              );
            })}
          </div>
        </section>

        {!result ? (
          <MotionSection
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-600/70 bg-slate-900/48 p-5 shadow-[0_24px_52px_rgba(2,6,23,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl md:p-6"
          >
            <h2 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Select Your Travel Destinations and Dates</h2>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">Start Location</span>
                <div className="relative">
                  <input
                    value={originInput}
                    onChange={(event) => {
                      const value = event.target.value;
                      setOriginInput(value);
                      setOrigin(null);
                    }}
                    placeholder="Type to search city"
                    className="w-full rounded-xl border border-slate-600 bg-slate-950/75 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30"
                  />
                  {originInput && originSuggestions.length > 0 && !originSuggestions.some((place) => place.name === originInput) && (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950/95 shadow-xl">
                      {originSuggestions.map((place) => (
                        <button
                          key={place.name}
                          type="button"
                          onMouseDown={() => {
                            setOrigin(place);
                            setOriginInput(place.name);
                          }}
                          className="block w-full border-b border-slate-800 px-4 py-3 text-left transition hover:bg-slate-800/80"
                        >
                          <p className="text-sm text-slate-100">{place.name}</p>
                          <p className="text-xs text-slate-400">{place.lat.toFixed(2)}, {place.lng.toFixed(2)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">Destination</span>
                <div className="relative">
                  <input
                    value={destinationInput}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDestinationInput(value);
                      setDestination(null);
                    }}
                    placeholder="Type to search city"
                    className="w-full rounded-xl border border-slate-600 bg-slate-950/75 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30"
                  />
                  {destinationInput && destinationSuggestions.length > 0 && !destinationSuggestions.some((place) => place.name === destinationInput) && (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950/95 shadow-xl">
                      {destinationSuggestions.map((place) => (
                        <button
                          key={place.name}
                          type="button"
                          onMouseDown={() => {
                            setDestination(place);
                            setDestinationInput(place.name);
                          }}
                          className="block w-full border-b border-slate-800 px-4 py-3 text-left transition hover:bg-slate-800/80"
                        >
                          <p className="text-sm text-slate-100">{place.name}</p>
                          <p className="text-xs text-slate-400">{place.lat.toFixed(2)}, {place.lng.toFixed(2)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">Departure Date</span>
                  <input
                    type="date"
                    value={departureDate}
                    onChange={(event) => setDepartureDate(event.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-950/75 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">Coming Date</span>
                  <input
                    type="date"
                    value={comingDate}
                    onChange={(event) => setComingDate(event.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-slate-950/75 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30"
                  />
                </label>
              </div>

              </div>

              <div className="space-y-6">

              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-300">Budget Range</p>
                  <p className="text-sm font-semibold text-slate-100">${budgetRange[0].toLocaleString()} - ${budgetRange[1].toLocaleString()}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={budgetRange[0]}
                    onChange={(event) => setBudgetRange([Number(event.target.value || 0), budgetRange[1]])}
                    className="rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/70 focus:ring-2 focus:ring-blue-400/30"
                    placeholder="Min budget"
                  />
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={budgetRange[1]}
                    onChange={(event) => setBudgetRange([budgetRange[0], Number(event.target.value || 0)])}
                    className="rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/70 focus:ring-2 focus:ring-blue-400/30"
                    placeholder="Max budget"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-300">Route Checkpoints</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <input
                      value={newStopInput}
                      onChange={(event) => {
                        const value = event.target.value;
                        setNewStopInput(value);
                        setNewStop(null);
                      }}
                      className="w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30"
                      placeholder={availableStopOptions.length > 0 ? 'Type to search checkpoint' : 'No more stops available'}
                    />
                    {newStopInput && availableStopOptions.length > 0 && !availableStopOptions.some((place) => place.name === newStopInput) && (
                      <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950/95 shadow-xl">
                        {availableStopOptions.map((place) => (
                          <button
                            key={place.name}
                            type="button"
                            onMouseDown={() => {
                              setNewStop(place);
                              setNewStopInput(place.name);
                            }}
                            className="block w-full border-b border-slate-800 px-4 py-3 text-left transition hover:bg-slate-800/80"
                          >
                            <p className="text-sm text-slate-100">{place.name}</p>
                            <p className="text-xs text-slate-400">{place.lat.toFixed(2)}, {place.lng.toFixed(2)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={addStop}
                    disabled={!newStop}
                    className="rounded-xl border border-amber-300/35 bg-linear-to-b from-amber-500/85 to-amber-700/85 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    + Add Destination
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {stops.length === 0 ? (
                    <p className="text-sm text-slate-500">No checkpoints added.</p>
                  ) : (
                    stops.map((stop, index) => (
                      <div
                        key={stop.name}
                        draggable
                        onDragStart={() => setDragStopIndex(index)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          reorderStops(dragStopIndex, index);
                          setDragStopIndex(null);
                        }}
                        onDragEnd={() => setDragStopIndex(null)}
                        className={`flex items-center justify-between rounded-xl border bg-slate-900/70 px-3 py-2 text-sm text-slate-200 transition ${
                          dragStopIndex === index
                            ? 'border-amber-300/80 bg-amber-300/10'
                            : 'border-slate-700 hover:border-amber-300/60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="cursor-grab text-xs text-slate-400">::</span>
                          <span>{stop.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeStop(stop)}
                          className="rounded-md border border-slate-600 px-2 py-1 text-[0.68rem] uppercase tracking-[0.12em] text-slate-300 transition hover:border-red-300/70 hover:text-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={resetPlanner}
                  className="rounded-xl border border-slate-600 bg-slate-900/70 px-5 py-3 text-lg font-medium text-slate-200 transition hover:bg-slate-800/80"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={buildJourney}
                  className="rounded-xl border border-amber-300/35 bg-linear-to-r from-blue-600/85 to-blue-800/85 px-5 py-3 text-lg font-semibold text-white transition hover:brightness-110"
                >
                  Continue
                </button>
              </div>
              </div>
            </div>
          </MotionSection>
        ) : currentStep === 2 ? (
          <MotionSection
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="rounded-2xl border border-slate-600/70 bg-slate-900/48 p-6 shadow-[0_24px_52px_rgba(2,6,23,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl md:p-8"
          >
            <div className="relative mb-5 flex items-center justify-between gap-3">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Route Preview</h2>
              <button
                type="button"
                onClick={() => {
                  setShowPreviewAddBox((prev) => !prev);
                  setShowPreviewEditBox(false);
                }}
                className="rounded-lg border border-amber-300/50 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-200 hover:bg-amber-400/20"
              >
                + Add Destination
              </button>

              {showPreviewAddBox && (
                <div className="absolute right-0 top-12 z-30 w-full max-w-md rounded-xl border border-slate-600/80 bg-slate-900/95 p-3 shadow-xl backdrop-blur-md">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">Add Destination</p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPreviewAddBox(false);
                        setPreviewStop(null);
                        setPreviewStopInput('');
                        setPreviewNights(1);
                      }}
                      className="rounded-md border border-slate-500 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-300"
                    >
                      Close
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      value={previewStopInput}
                      onChange={(event) => {
                        const value = event.target.value;
                        setPreviewStopInput(value);
                        setPreviewStop(null);
                      }}
                      placeholder="Search Destination"
                      className="w-full rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-300/70 focus:ring-2 focus:ring-blue-300/30"
                    />
                    {previewStopInput &&
                      availablePreviewStopOptions.length > 0 &&
                      !availablePreviewStopOptions.some((place) => place.name === previewStopInput) && (
                        <div className="absolute z-40 mt-2 max-h-44 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/95 shadow-xl">
                          {availablePreviewStopOptions.map((place) => (
                            <button
                              key={place.name}
                              type="button"
                              onMouseDown={() => {
                                setPreviewStop(place);
                                setPreviewStopInput(place.name);
                              }}
                              className="block w-full border-b border-slate-800 px-3 py-2 text-left transition hover:bg-slate-800/80"
                            >
                              <p className="text-sm text-slate-100">{place.name}</p>
                              <p className="text-xs text-slate-400">{place.lat.toFixed(2)}, {place.lng.toFixed(2)}</p>
                            </button>
                          ))}
                        </div>
                      )}
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2">
                    <p className="text-sm text-slate-200">Number of nights</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewNights((prev) => Math.max(1, prev - 1))}
                        className="h-7 w-7 rounded-full border border-slate-500 text-sm font-bold text-slate-200 transition hover:border-slate-300"
                      >
                        -
                      </button>
                      <span className="min-w-5 text-center text-sm font-semibold text-slate-100">{previewNights}</span>
                      <button
                        type="button"
                        onClick={() => setPreviewNights((prev) => Math.min(30, prev + 1))}
                        className="h-7 w-7 rounded-full border border-slate-500 text-sm font-bold text-slate-200 transition hover:border-slate-300"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addPreviewDestination}
                    className="mt-3 w-full rounded-lg border border-amber-300/50 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-200 hover:bg-amber-400/20"
                  >
                    Add Destination
                  </button>
                </div>
              )}

              {showPreviewEditBox && (
                <div className="absolute right-0 top-12 z-30 w-full max-w-md rounded-xl border border-slate-600/80 bg-slate-900/95 p-3 shadow-xl backdrop-blur-md">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">Edit Destination</p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPreviewEditBox(false);
                        setEditingRouteIndex(null);
                        setEditStopInput('');
                        setEditNights(1);
                        setEditStopSelection(null);
                      }}
                      className="rounded-md border border-slate-500 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-300"
                    >
                      Close
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      value={editStopInput}
                      onChange={(event) => {
                        setEditStopInput(event.target.value);
                        setEditStopSelection(null);
                      }}
                      placeholder="Search Destination"
                      className="w-full rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-300/70 focus:ring-2 focus:ring-blue-300/30"
                    />
                    {editStopInput &&
                      availableEditStopOptions.length > 0 &&
                      !availableEditStopOptions.some((place) => place.name === editStopInput) && (
                        <div className="absolute z-40 mt-2 max-h-44 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/95 shadow-xl">
                          {availableEditStopOptions.map((place) => (
                            <button
                              key={place.name}
                              type="button"
                              onMouseDown={() => {
                                setEditStopSelection(place);
                                setEditStopInput(place.name);
                              }}
                              className="block w-full border-b border-slate-800 px-3 py-2 text-left transition hover:bg-slate-800/80"
                            >
                              <p className="text-sm text-slate-100">{place.name}</p>
                              <p className="text-xs text-slate-400">{place.lat.toFixed(2)}, {place.lng.toFixed(2)}</p>
                            </button>
                          ))}
                        </div>
                      )}
                  </div>

                  <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2">
                    <p className="text-sm text-slate-200">Number of nights</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditNights((prev) => Math.max(1, prev - 1))}
                        className="h-7 w-7 rounded-full border border-slate-500 text-sm font-bold text-slate-200 transition hover:border-slate-300"
                      >
                        -
                      </button>
                      <span className="min-w-5 text-center text-sm font-semibold text-slate-100">{editNights}</span>
                      <button
                        type="button"
                        onClick={() => setEditNights((prev) => Math.min(30, prev + 1))}
                        className="h-7 w-7 rounded-full border border-slate-500 text-sm font-bold text-slate-200 transition hover:border-slate-300"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={applyPreviewEdit}
                    className="mt-3 w-full rounded-lg border border-blue-300/50 bg-blue-400/10 px-3 py-2 text-sm font-semibold text-blue-200 transition hover:border-blue-200 hover:bg-blue-400/20"
                  >
                    Save Changes
                  </button>
                </div>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                  {activeRoute.map((place, index) => {
                    const isCore = getPlaceLabel(place) === getPlaceLabel(origin);
                    const isSelected = finalizedRoute.some((checkpoint) => checkpoint.name === place.name);

                    return (
                      <div
                        key={`${place.name}-${index}`}
                        draggable={!isCore}
                        onDragStart={() => {
                          if (!isCore) setDragRouteIndex(index);
                        }}
                        onDragOver={(event) => {
                          if (!isCore) event.preventDefault();
                        }}
                        onDrop={() => {
                          reorderRoute(dragRouteIndex, index);
                          setDragRouteIndex(null);
                        }}
                        onDragEnd={() => setDragRouteIndex(null)}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                          isSelected
                            ? 'border-amber-300/50 bg-amber-300/10'
                            : 'border-slate-700 bg-slate-950/45 opacity-60 hover:border-amber-300/40 hover:opacity-100'
                        } ${isCore ? 'cursor-default' : 'cursor-move'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className={`h-3 w-3 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-slate-600'}`} />
                            <div className="min-w-0">
                              <p className={`truncate text-lg font-medium ${isSelected ? 'text-slate-100' : 'text-slate-400'}`}>{getPlaceLabel(place)}</p>
                              <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Stay: {getNightLabel(place, index)}</p>
                            </div>
                            {isCore && <span className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Required</span>}
                          </div>

                          {!isCore && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => editRoutePoint(index)}
                                className="rounded-md border border-blue-400/40 px-2 py-1 text-[0.62rem] uppercase tracking-[0.12em] text-blue-200 transition hover:border-blue-300 hover:bg-blue-500/20"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteRoutePoint(index)}
                                className="rounded-md border border-red-400/40 px-2 py-1 text-[0.62rem] uppercase tracking-[0.12em] text-red-200 transition hover:border-red-300 hover:bg-red-500/20"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <div className="relative h-full min-h-80 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70">
                  <MapContainer
                    center={routeMapPoints[0] ? [routeMapPoints[0].lat, routeMapPoints[0].lng] : [20, 0]}
                    zoom={3}
                    scrollWheelZoom={true}
                    className="h-full w-full z-10 custom-sea-blue-filter"
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />
                    {routeMapPath.length > 1 && (
                      <Polyline
                        positions={routeMapPath}
                        pathOptions={{ color: '#0ea5e9', weight: 3, dashArray: '5, 10' }}
                      />
                    )}
                    {routeMapPoints.map((place) => (
                      <Marker
                        key={place.name}
                        position={[place.lat, place.lng]}
                      />
                    ))}
                  </MapContainer>
                  <div className="absolute bottom-4 left-4 z-20 rounded border border-white/10 bg-black/60 p-2 px-4 text-[9px] font-mono text-cyan-400 backdrop-blur-md">
                    Route_Map_View
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Total Distance</p>
                <p className="mt-1 text-2xl font-semibold text-slate-100">{result.totalDistance} km</p>
              </div>
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Estimated Time</p>
                <p className="mt-1 text-2xl font-semibold text-slate-100">{result.estimatedHours} hrs</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={resetPlanner}
                className="rounded-xl border border-slate-600 bg-slate-900/70 px-5 py-3 text-lg font-medium text-slate-200 transition hover:bg-slate-800/80"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="rounded-xl border border-amber-300/35 bg-linear-to-r from-amber-500/85 to-amber-700/85 px-5 py-3 text-lg font-semibold text-slate-950 transition hover:brightness-110"
              >
                Continue to Stay Preferences
              </button>
            </div>
          </MotionSection>
        ) : currentStep === 3 ? (
          <MotionSection
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-600/70 bg-slate-900/48 p-6 shadow-[0_24px_52px_rgba(2,6,23,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl md:p-8"
          >
            <h2 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Stay Preferences</h2>
            <p className="mt-2 text-sm text-slate-400">Select hotel comfort and room allocation before finalizing the route.</p>

            <div className="mt-8 space-y-6">
              <div className="rounded-xl border border-amber-300/30 bg-slate-950/55 p-4">
                <p className="mb-3 text-lg font-semibold text-slate-100">Hotel Type</p>
                <div className="space-y-3">
                  {[
                    ['hotel3', '3-Stars'],
                    ['hotel4', '4-Stars'],
                    ['hotel5', '5-Stars'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setStayPreferences((prev) => ({
                          ...prev,
                          [key]: !prev[key],
                        }))
                      }
                      className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3 text-left transition hover:border-amber-300/45"
                    >
                      <span className="text-base font-medium text-slate-100">{label}</span>
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-sm font-bold ${stayPreferences[key] ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
                        {stayPreferences[key] ? '✓' : '+'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-amber-300/30 bg-slate-950/55 p-4">
                <p className="mb-3 text-lg font-semibold text-slate-100">Travellers and Rooms</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Travellers</span>
                    <input
                      type="number"
                      min="1"
                      value={stayPreferences.travelers}
                      onChange={(event) =>
                        setStayPreferences((prev) => ({
                          ...prev,
                          travelers: Math.max(1, Number(event.target.value || 1)),
                        }))
                      }
                      className="w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Rooms</span>
                    <input
                      type="number"
                      min="1"
                      value={stayPreferences.rooms}
                      onChange={(event) =>
                        setStayPreferences((prev) => ({
                          ...prev,
                          rooms: Math.max(1, Number(event.target.value || 1)),
                        }))
                      }
                      className="w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30"
                    />
                  </label>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="rounded-xl border border-slate-600 bg-slate-900/70 px-5 py-3 text-lg font-medium text-slate-200 transition hover:bg-slate-800/80"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="rounded-xl border border-amber-300/35 bg-linear-to-r from-amber-500/85 to-amber-700/85 px-5 py-3 text-lg font-semibold text-slate-950 transition hover:brightness-110"
                >
                  View Final Route
                </button>
              </div>
            </div>
          </MotionSection>
        ) : (
          <MotionSection
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="rounded-2xl border border-slate-600/70 bg-slate-900/48 p-6 shadow-[0_24px_52px_rgba(2,6,23,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl md:p-8"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Final Route</h2>
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="text-lg font-medium text-amber-300 underline-offset-2 hover:underline"
              >
                Edit Preferences
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Final Checkpoints</p>
                <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                  {activeRoute.map((place, index) => {
                    const isCore = getPlaceLabel(place) === getPlaceLabel(origin);

                    return (
                      <div key={`${place.name}-${index}`} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/45 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full bg-amber-300" />
                          <span className="text-lg font-medium text-slate-100">{getPlaceLabel(place)}</span>
                          {isCore && <span className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Required</span>}
                        </div>
                        <span className="text-xs uppercase tracking-[0.14em] text-amber-300">Locked</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <div className="relative h-full min-h-80 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70">
                  <MapContainer
                    center={routeMapPoints[0] ? [routeMapPoints[0].lat, routeMapPoints[0].lng] : [20, 0]}
                    zoom={3}
                    scrollWheelZoom={true}
                    className="h-full w-full z-10 custom-sea-blue-filter"
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />
                    {routeMapPath.length > 1 && (
                      <Polyline
                        positions={routeMapPath}
                        pathOptions={{ color: '#0ea5e9', weight: 3, dashArray: '5, 10' }}
                      />
                    )}
                    {routeMapPoints.map((place) => (
                      <Marker
                        key={place.name}
                        position={[place.lat, place.lng]}
                      />
                    ))}
                  </MapContainer>
                  <div className="absolute bottom-4 left-4 z-20 rounded border border-white/10 bg-black/60 p-2 px-4 text-[9px] font-mono text-cyan-400 backdrop-blur-md">
                    Route_Map_View
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Total Distance</p>
                <p className="mt-1 text-2xl font-semibold text-slate-100">{result.totalDistance} km</p>
              </div>
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Estimated Time</p>
                <p className="mt-1 text-2xl font-semibold text-slate-100">{result.estimatedHours} hrs</p>
              </div>
            </div>

            <section className="mt-5 space-y-5 rounded-2xl border border-slate-700/80 bg-slate-950/55 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Vector</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">
                    {getPlaceLabel(origin)} to {getPlaceLabel(destination)}
                  </p>
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Travel Window</p>
                  <p className="mt-1 text-sm text-slate-200">{result.departureDate || 'N/A'} to {result.comingDate || 'N/A'}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                  <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Budget Range</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">
                    ${Number(result.budgetRange?.[0] || 0).toLocaleString()} - ${Number(result.budgetRange?.[1] || 0).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                  <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Distance / Time</p>
                  <p className="mt-1 text-lg font-semibold text-slate-100">{result.totalDistance} km / {result.estimatedHours} hrs</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Final Route</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {activeRoute.map((place, index) => {
                    const label = getPlaceLabel(place);
                    const isStart = index === 0;
                    const isEnd = index === activeRoute.length - 1;

                    return (
                      <div
                        key={`${label}-${index}`}
                        className="rounded-lg border border-slate-700 bg-slate-950/65 p-3 shadow-[0_10px_24px_rgba(2,6,23,0.24)]"
                      >
                        <p className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-400">Stop {index + 1}</p>
                        <p className="mt-1 text-sm font-semibold text-amber-100">{label || 'Unknown checkpoint'}</p>
                        <p className="mt-2 text-xs text-slate-300">
                          {isStart ? 'Origin point' : isEnd ? 'Destination point' : 'Intermediate checkpoint'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-amber-300/35 bg-linear-to-r from-amber-500/85 to-amber-700/85 px-5 py-3 text-lg font-semibold text-slate-950 transition hover:brightness-110"
              >
                Print Hard Copy
              </button>
              <button
                type="button"
                onClick={approveJourney}
                className="rounded-xl border border-blue-300/35 bg-linear-to-r from-blue-600/90 to-blue-800/90 px-5 py-3 text-lg font-semibold text-white transition hover:brightness-110"
              >
                Proceed to Travel Alerts
              </button>
            </div>

            <div className="mt-4 flex justify-start">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="text-sm font-medium text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
              >
                Back to Stay Preferences
              </button>
            </div>
          </MotionSection>
        )}

        <footer className="mt-8 grid gap-4 border-t border-slate-800 pt-4 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
          <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3 text-center shadow-sm">Trusted by 10,000+ Travelers</p>
          <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3 text-center shadow-sm">24/7 Support</p>
          <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3 text-center shadow-sm">GST Invoice Provided</p>
          <p className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3 text-center shadow-sm">Secure Payments</p>
        </footer>
      </div>

        <style jsx>{`
          .custom-sea-blue-filter {
            filter: hue-rotate(170deg) saturate(1.8) brightness(0.9) contrast(1.1) !important;
          }

          .leaflet-container {
            background: #070a0d !important;
          }
        `}</style>
    </main>
  );
}