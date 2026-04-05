import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createTrip, generateItinerary, generatePlaces, logoutUser, selectPlaces } from '../api';
import PlacesMap from '../components/PlacesMap';

const MotionSection = motion.section;
const OPENCAGE_API_KEY = import.meta.env.VITE_OPENCAGE_API_KEY || '28c64189eddc4ad5a26acec1c867fdc8';
const HISTORY_KEY = 'agentJourneyHistory';
const ITINERARY_SNAPSHOT_KEY = 'itinerary-planner:snapshot:v1';
const STEP_ITEMS = ['Plan Your Trip', 'Customize Route', 'Stay Preferences', 'Final Route'];

function getPlaceLabel(place) {
  if (!place) return '';
  return typeof place === 'string' ? place : place.name || '';
}

function normalizeName(value) {
  const text = typeof value === 'string' ? value : value?.name || '';
  return text.split(',')[0].trim() || text.trim();
}

function getVisitDescription(place, checkpointLabel) {
  const cleanReason = (place?.best_visit_reason || '').toString().trim();
  const placeName = place?.name || 'This place';
  const placeType = (place?.type || 'attraction').toLowerCase();
  const placeLocation = place?.location || checkpointLabel || 'this stop';

  const seed = `${placeName}|${placeLocation}|${checkpointLabel || ''}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const contextLines = [
    `It gives your ${checkpointLabel || 'route'} segment a stronger local flavor and a distinct memory point.`,
    `It balances the itinerary with a high-value ${placeType} experience near ${placeLocation}.`,
    `It works well as a practical stop around ${placeLocation} without slowing the journey too much.`,
    `It adds a different vibe to your route and complements the nearby highlights around ${placeLocation}.`,
  ];
  const selectedLine = contextLines[hash % contextLines.length];

  if (!cleanReason) {
    return `Why visit: ${placeName} is a notable ${placeType} around ${placeLocation}. ${selectedLine}`;
  }

  const sentence = /[.!?]$/.test(cleanReason) ? cleanReason : `${cleanReason}.`;
  const wordCount = cleanReason.split(/\s+/).filter(Boolean).length;

  if (wordCount < 10) {
    return `Why visit: ${sentence} ${selectedLine}`;
  }

  return `Why visit: ${sentence}`;
}

function deriveRouteStops(route, originName, destinationName) {
  if (!Array.isArray(route)) return [];

  return [...new Set(
    route
      .map((point) => normalizeName(point))
      .filter(Boolean)
      .filter((name) => name !== originName && name !== destinationName),
  )];
}

function groupPlacesByCheckpoint(checkpoints, places) {
  const grouped = {};

  checkpoints.forEach((checkpoint) => {
    grouped[normalizeName(checkpoint)] = [];
  });

  places.forEach((place) => {
    const locationText = normalizeName(place?.location).toLowerCase();
    const nameText = normalizeName(place?.name).toLowerCase();

    const matchedKey = Object.keys(grouped).find((checkpoint) => {
      const checkpointText = checkpoint.toLowerCase();
      return locationText.includes(checkpointText) || nameText.includes(checkpointText);
    });

    if (matchedKey) {
      grouped[matchedKey].push(place);
    }
  });

  return grouped;
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
  const [checkpointPlaces, setCheckpointPlaces] = useState({});
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState('');
  const [placesRequestKey, setPlacesRequestKey] = useState('');
  const [hiddenPlaces, setHiddenPlaces] = useState({});
  const [draftTripId, setDraftTripId] = useState('');
  const [itineraryLoading, setItineraryLoading] = useState(false);

  const originSuggestions = useDebouncedSearch(originInput);
  const destinationSuggestions = useDebouncedSearch(destinationInput);
  const stopSuggestions = useDebouncedSearch(newStopInput);

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

  const buildJourney = () => {
    setError('');
    setPlacesError('');
    setCheckpointPlaces({});
    setPlacesRequestKey('');
    setHiddenPlaces({});

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
    setCurrentStep(2);
  };

  const toggleCheckpoint = (place) => {
    if (!result || place.name === origin?.name || place.name === destination?.name) return;

    setFinalizedRoute((previous) => {
      if (previous.some((checkpoint) => checkpoint.name === place.name)) {
        return previous.filter((checkpoint) => checkpoint.name !== place.name);
      }

      const nextRoute = [...previous];
      const destinationIndex = nextRoute.findIndex((checkpoint) => checkpoint.name === destination.name);
      if (destinationIndex >= 0) {
        nextRoute.splice(destinationIndex, 0, place);
      } else {
        nextRoute.push(place);
      }

      return nextRoute;
    });
  };

  const approveJourney = async () => {
    if (!result) return;

    const routeForPlanner = finalizedRoute.length > 0 ? finalizedRoute : result.route;
    const approvedJourney = {
      ...result,
      route: routeForPlanner,
      stayPreferences,
    };

    const approvedHistory = [approvedJourney, ...history].slice(0, 12);
    setHistory(approvedHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(approvedHistory));

    const selectedPlaces = routeForPlanner
      .slice(1)
      .flatMap((place) => {
        const checkpointKey = normalizeName(place);
        return (checkpointPlaces[checkpointKey] || []).filter(
          (candidate) => !hiddenPlaces[checkpointKey]?.[normalizeName(candidate.name)],
        );
      })
      .map((candidate) => ({
        name: candidate.name,
        type: candidate.type,
        location: candidate.location,
        lat: candidate.lat,
        lng: candidate.lng,
        rating: candidate.rating,
        popularity: candidate.popularity,
        best_visit_reason: candidate.best_visit_reason,
        imageUrl: candidate.imageUrl,
      }))
      .filter((candidate, index, all) =>
        all.findIndex((item) => `${item.name}|${item.location}` === `${candidate.name}|${candidate.location}`) === index,
      );

    if (!selectedPlaces.length) {
      setPlacesError('Please keep at least one place before generating itinerary.');
      return;
    }

    try {
      setItineraryLoading(true);
      setPlacesError('');

      let currentTripId = draftTripId;

      if (!currentTripId) {
        const originName = normalizeName(origin);
        const destinationName = normalizeName(destination);
        const created = await createTrip({
          origin: originName,
          destination: destinationName,
          stops: deriveRouteStops(routeForPlanner, originName, destinationName),
          budget: Number(budgetRange?.[1] || 0),
          dates: [departureDate, comingDate].filter(Boolean),
        });

        currentTripId = created?.trip?._id || '';
        if (!currentTripId) throw new Error('Unable to create trip for itinerary generation.');
        setDraftTripId(currentTripId);
      }

      await selectPlaces(currentTripId, selectedPlaces);
      const itineraryResp = await generateItinerary(currentTripId);

      try {
        window.localStorage.removeItem(ITINERARY_SNAPSHOT_KEY);
      } catch {
        // Ignore storage errors.
      }

      navigate('/itinerary-planner', {
        state: {
          journey: approvedJourney,
          itinerary: itineraryResp?.itinerary || null,
          selectedPlaces,
          tripId: currentTripId,
        },
      });
    } catch (err) {
      setPlacesError(err.message || 'Failed to generate itinerary.');
    } finally {
      setItineraryLoading(false);
    }
  };

  const activeRoute = finalizedRoute.length > 0 ? finalizedRoute : result?.route || [];
  const checkpointMapPlaces = activeRoute
    .map((place) => ({
      name: place?.name || '',
      location: place?.name || '',
      lat: Number(place?.lat),
      lng: Number(place?.lng),
      best_visit_reason: '',
    }))
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));

  const finalMapPlaces = activeRoute
    .slice(1)
    .flatMap((place) => {
      const checkpointKey = normalizeName(place);
      return (checkpointPlaces[checkpointKey] || []).filter(
        (candidate) => !hiddenPlaces[checkpointKey]?.[normalizeName(candidate.name)],
      );
    })
    .filter((candidate, index, all) =>
      all.findIndex((item) => `${item.name}|${item.location}` === `${candidate.name}|${candidate.location}`) === index,
    );
  const mapPlacesForFinalRoute = finalMapPlaces.length ? finalMapPlaces : checkpointMapPlaces;
  const progressPercent = ((currentStep - 1) / (STEP_ITEMS.length - 1)) * 100;

  useEffect(() => {
    if (currentStep !== 4 || !result || activeRoute.length === 0) return;

    const originName = normalizeName(origin);
    const destinationName = normalizeName(destination);
    const payload = {
      origin: originName,
      destination: destinationName,
      stops: deriveRouteStops(activeRoute, originName, destinationName),
      budget: Number(budgetRange?.[1] || 0),
      dates: [departureDate, comingDate].filter(Boolean),
    };

    const requestKey = JSON.stringify({
      route: activeRoute.map((place) => normalizeName(place)),
      dates: payload.dates,
      budget: payload.budget,
    });

    if (requestKey === placesRequestKey) return;

    const fetchCheckpointPlaces = async () => {
      try {
        setPlacesLoading(true);
        setPlacesError('');

        const created = await createTrip(payload);
        const createdTripId = created?.trip?._id;
        if (!createdTripId) {
          throw new Error('Unable to generate recommendations right now.');
        }
        setDraftTripId(createdTripId);

        const placeResp = await generatePlaces(createdTripId);
        const candidatePlaces = Array.isArray(placeResp?.places) ? placeResp.places : [];
        setCheckpointPlaces(groupPlacesByCheckpoint(activeRoute, candidatePlaces));
        setPlacesRequestKey(requestKey);
      } catch (err) {
        setPlacesError(err.message || 'Failed to load checkpoint recommendations.');
      } finally {
        setPlacesLoading(false);
      }
    };

    fetchCheckpointPlaces();
  }, [
    activeRoute,
    budgetRange,
    comingDate,
    currentStep,
    departureDate,
    destination,
    origin,
    placesRequestKey,
    result,
  ]);

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
    setStayPreferences({
      hotel3: true,
      hotel4: true,
      hotel5: true,
      travelers: 1,
      rooms: 1,
    });
    setCheckpointPlaces({});
    setPlacesLoading(false);
    setPlacesError('');
    setPlacesRequestKey('');
    setHiddenPlaces({});
    setDraftTripId('');
    setItineraryLoading(false);
    setCurrentStep(1);
  };

  const hidePlaceCard = (checkpointName, placeName) => {
    const checkpointKey = normalizeName(checkpointName);
    const placeKey = normalizeName(placeName);

    if (!checkpointKey || !placeKey) return;

    setHiddenPlaces((previous) => ({
      ...previous,
      [checkpointKey]: {
        ...(previous[checkpointKey] || {}),
        [placeKey]: true,
      },
    }));
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch (_err) {
      // Even if backend logout fails, redirect user to login screen.
    }
    navigate('/login');
  };

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[radial-gradient(1200px_600px_at_85%_-15%,rgba(245,158,11,0.12),transparent_60%),radial-gradient(1000px_560px_at_0%_100%,rgba(37,99,235,0.18),transparent_56%),linear-gradient(155deg,#020617_0%,#0b1324_45%,#020617_100%)] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[url('/detective.bg.png')] bg-cover bg-center opacity-[0.08]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.4),rgba(2,6,23,0.75))]" aria-hidden="true" />

      <header className="relative z-10 w-full border-b border-amber-300/20 bg-slate-950/70 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-4 px-4 py-5 md:px-8 md:py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/85">Field Command</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-100 md:text-3xl">Operation Round Table</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">Align route strategy, checkpoints, and approvals from one control desk before final mission lock.</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/80"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <section className="mb-8 rounded-2xl border border-slate-700/70 bg-slate-900/55 p-4 shadow-[0_18px_44px_rgba(2,6,23,0.28)] backdrop-blur-sm md:p-5">
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
            className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-700/70 bg-slate-900/75 p-5 shadow-[0_24px_52px_rgba(2,6,23,0.52)] backdrop-blur-md md:p-6"
          >
            <h2 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Select Your Travel Destinations and Dates</h2>

            <div className="mt-8 space-y-6">
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
                <div className="mt-3 flex flex-wrap gap-2">
                  {stops.length === 0 ? (
                    <p className="text-sm text-slate-500">No checkpoints added.</p>
                  ) : (
                    stops.map((stop) => (
                      <button
                        key={stop.name}
                        type="button"
                        onClick={() => removeStop(stop)}
                        className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1 text-xs text-slate-200 transition hover:border-amber-300/70 hover:text-amber-200"
                      >
                        {stop.name} x
                      </button>
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
          </MotionSection>
        ) : currentStep === 2 ? (
          <MotionSection
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-6 shadow-[0_24px_52px_rgba(2,6,23,0.52)] backdrop-blur-md md:p-8"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Route Preview</h2>
              <button
                type="button"
                onClick={resetPlanner}
                className="text-lg font-medium text-amber-300 underline-offset-2 hover:underline"
              >
                + Add Destination
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                  {activeRoute.map((place, index) => {
                    const isCore = getPlaceLabel(place) === getPlaceLabel(origin) || getPlaceLabel(place) === getPlaceLabel(destination);
                    const isSelected = finalizedRoute.some((checkpoint) => checkpoint.name === place.name);

                    return (
                      <button
                        key={`${place.name}-${index}`}
                        type="button"
                        onClick={() => toggleCheckpoint(place)}
                        disabled={isCore}
                        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                          isSelected
                            ? 'border-amber-300/50 bg-amber-300/10'
                            : 'border-slate-700 bg-slate-950/45 opacity-60 hover:border-amber-300/40 hover:opacity-100'
                        } ${isCore ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`h-3 w-3 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-slate-600'}`} />
                          <span className={`text-lg font-medium ${isSelected ? 'text-slate-100' : 'text-slate-400'}`}>{getPlaceLabel(place)}</span>
                          {isCore && <span className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Required</span>}
                        </div>
                        <span className={`text-xs uppercase tracking-[0.14em] ${isSelected ? 'text-amber-300' : 'text-slate-500'}`}>{isSelected ? 'On' : 'Off'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <div className="relative h-full min-h-80 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(59,130,246,0.2),transparent_40%),radial-gradient(circle_at_85%_12%,rgba(245,158,11,0.18),transparent_40%)]" />
                  <div className="relative flex h-full items-center justify-center">
                    <svg viewBox="0 0 340 180" className="h-44 w-[90%] text-blue-500" fill="none" aria-hidden="true">
                      <path d="M24 152 C84 40, 136 158, 196 76 S286 124, 320 28" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray="6 6" />
                      <circle cx="24" cy="152" r="8" fill="#111827" />
                      <circle cx="196" cy="76" r="8" fill="#eab308" />
                      <circle cx="320" cy="28" r="8" fill="#ef4444" />
                    </svg>
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
            className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-700/70 bg-slate-900/75 p-6 shadow-[0_24px_52px_rgba(2,6,23,0.52)] backdrop-blur-md md:p-8"
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
            className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-6 shadow-[0_24px_52px_rgba(2,6,23,0.52)] backdrop-blur-md md:p-8"
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
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Final Checkpoints</p>
                  {placesLoading && <p className="text-[0.68rem] text-slate-400">Loading place intel...</p>}
                </div>
                {placesError && <p className="mt-2 text-xs text-red-300">{placesError}</p>}
                <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                  {activeRoute.map((place, index) => {
                    const label = getPlaceLabel(place);
                    const isCore = getPlaceLabel(place) === getPlaceLabel(origin) || getPlaceLabel(place) === getPlaceLabel(destination);

                    return (
                      <div key={`${label || 'checkpoint'}-${index}`} className="rounded-xl border border-slate-700 bg-slate-950/45 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="h-3 w-3 rounded-full bg-amber-300" />
                            <span className="text-lg font-medium text-slate-100">{label}</span>
                            {isCore && <span className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Required</span>}
                          </div>
                          <span className="text-xs uppercase tracking-[0.14em] text-amber-300">Locked</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <div className="space-y-3">
                  <PlacesMap
                    places={mapPlacesForFinalRoute}
                    routePlaces={checkpointMapPlaces}
                    className="h-80"
                    showRoute
                    originName={getPlaceLabel(origin)}
                    destinationName={getPlaceLabel(destination)}
                  />
                  <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Mission Ready</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{getPlaceLabel(origin)} → {getPlaceLabel(destination)}</p>
                    <p className="mt-1 text-xs text-slate-400">All route, budget, and stay selections are locked for review.</p>
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

            <section className="mt-5 rounded-2xl border border-slate-700/80 bg-slate-950/55 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Generated Place Blocks</p>
                  <p className="mt-1 text-sm text-slate-300">Intermediate checkpoints and destination only.</p>
                </div>
                {placesLoading && <p className="text-[0.68rem] text-slate-400">Loading place intel...</p>}
              </div>
              {placesError && <p className="mt-2 text-xs text-red-300">{placesError}</p>}

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {activeRoute.slice(1).map((place, index) => {
                  const label = getPlaceLabel(place);
                  const checkpointKey = normalizeName(label);
                  const relatedPlaces = (checkpointPlaces[checkpointKey] || []).filter(
                    (candidate) => !hiddenPlaces[checkpointKey]?.[normalizeName(candidate.name)],
                  );
                  const isDestination = index === activeRoute.slice(1).length - 1;

                  return (
                    <div key={`${checkpointKey || 'checkpoint'}-${index}`} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full bg-amber-300" />
                          <span className="text-lg font-semibold text-slate-100">{label}</span>
                        </div>
                        <span className="text-xs uppercase tracking-[0.14em] text-amber-300">
                          {isDestination ? 'Destination' : 'Intermediate'}
                        </span>
                      </div>

                      <div className="mt-4 space-y-3">
                        {placesLoading ? (
                          <p className="text-xs text-slate-500">Generating recommendations...</p>
                        ) : relatedPlaces.length === 0 ? (
                          <p className="text-xs text-slate-500">No places generated for this checkpoint yet.</p>
                        ) : (
                          relatedPlaces.map((candidate) => (
                            <div key={`${candidate.name}-${candidate.location}`} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/80 shadow-[0_10px_28px_rgba(2,6,23,0.32)]">
                              <div className="flex items-start justify-between gap-3 p-3 pb-1">
                                <div className="min-w-0 flex-1">
                                  <p className="text-lg font-semibold text-slate-100">{candidate.name || 'Unnamed place'}</p>
                                  <p className="mt-1 text-sm text-slate-300">{candidate.location || 'Location unavailable'}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => hidePlaceCard(checkpointKey, candidate.name)}
                                  className="rounded-full border border-slate-600 px-3 py-1 text-[0.68rem] uppercase tracking-[0.14em] text-slate-200 transition hover:border-rose-400 hover:text-rose-300"
                                >
                                  Remove
                                </button>
                              </div>
                              {candidate.imageUrl && (
                                <img
                                  src={candidate.imageUrl}
                                  alt={candidate.name || 'Place image'}
                                  className="mt-2 h-44 w-full object-cover"
                                  loading="lazy"
                                />
                              )}
                              <div className="p-3 pt-3">
                                <p className="border-l-2 border-amber-300/70 pl-3 text-sm leading-relaxed text-slate-200">
                                  {getVisitDescription(candidate, label)}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={approveJourney}
                disabled={itineraryLoading || placesLoading}
                className="rounded-xl border border-amber-200/40 bg-linear-to-r from-amber-300 via-amber-500 to-amber-700 px-5 py-3 text-lg font-semibold text-slate-950 shadow-[0_12px_28px_rgba(245,158,11,0.28)] transition hover:brightness-110 sm:col-span-2"
              >
                {itineraryLoading ? 'Generating Itinerary...' : 'Generate Itinerary'}
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
    </main>
  );
}