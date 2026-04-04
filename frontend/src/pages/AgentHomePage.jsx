import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createTrip, generateItinerary, generatePlaces, logoutUser, selectPlaces } from '../api';
import PlacesMap from '../components/PlacesMap';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MotionSection = motion.section;
const OPENCAGE_API_KEY = import.meta.env.VITE_OPENCAGE_API_KEY || '28c64189eddc4ad5a26acec1c867fdc8';
const HISTORY_KEY = 'agentJourneyHistory';
const STEP_ITEMS = ['Plan Your Trip', 'Customize Route', 'Stay Preferences', 'Final Route'];
const DUMMY_NIGHTS_PATTERN = [2, 1, 3, 2, 1, 2];

// ─── Wikipedia Photo Helpers ───────────────────────────────────────────────────

async function fetchWikipediaPhoto(locationName, searchHint = '') {
  const buildQueries = (name, hint) => {
    const base = String(name || '').split(',')[0].trim();
    const extra = String(hint || '').split(',')[0].trim();
    return [...new Set([
      `${base} ${extra}`.trim(),
      `${base} tourism`.trim(),
      `${base} landmark`.trim(),
      base,
      extra,
    ].filter(Boolean))];
  };

  try {
    const simpleName = locationName.split(',')[0].trim();
    const hintName = String(searchHint || '').split(',')[0].trim();

    for (const query of buildQueries(simpleName, hintName)) {
      // 1. Try direct page summary
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.thumbnail?.source) return data.thumbnail.source;
    }

    // 2. Fallback: search API
    for (const query of buildQueries(simpleName, hintName)) {
      const searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`
      );
      const searchData = await searchRes.json();
      const topTitle = searchData.query?.search?.[0]?.title;
      if (!topTitle) continue;

      const finalRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topTitle)}`
      );
      const finalData = await finalRes.json();
      if (finalData.thumbnail?.source) return finalData.thumbnail.source;
    }
  } catch {
    try {
      const simpleName = locationName.split(',')[0].trim();
      const hintName = String(searchHint || '').split(',')[0].trim();

      for (const query of buildQueries(simpleName, hintName)) {
        const commonsRes = await fetch(
          `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=900&format=json&origin=*`,
        );
        const commonsData = await commonsRes.json();
        const pages = commonsData?.query?.pages || {};
        const firstPage = Object.values(pages)[0];
        const imageUrl = firstPage?.imageinfo?.[0]?.thumburl || firstPage?.imageinfo?.[0]?.url || null;
        if (imageUrl) return imageUrl;
      }

      return null;
    } catch {
      return null;
    }
  }
}

// ─── LocationPhoto Component ───────────────────────────────────────────────────

function LocationPhoto({ placeName, searchHint = '', className = '' }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!placeName) { setLoading(false); return; }
    setLoading(true);
    setPhotoUrl(null);
    fetchWikipediaPhoto(placeName, searchHint).then((url) => {
      setPhotoUrl(url);
      setLoading(false);
    });
  }, [placeName, searchHint]);

  if (loading) return <div className={`animate-pulse rounded-xl bg-slate-800 ${className}`} />;
  if (!photoUrl) return (
    <div className={`flex items-center justify-center rounded-xl bg-slate-800/60 text-xs text-slate-500 ${className}`}>
      No photo
    </div>
  );
  return <img src={photoUrl} alt={placeName} className={`rounded-xl object-cover ${className}`} />;
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

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
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;

  const contextLines = [
    `It gives your ${checkpointLabel || 'route'} segment a stronger local flavor and a distinct memory point.`,
    `It balances the itinerary with a high-value ${placeType} experience near ${placeLocation}.`,
    `It works well as a practical stop around ${placeLocation} without slowing the journey too much.`,
    `It adds a different vibe to your route and complements the nearby highlights around ${placeLocation}.`,
  ];
  const selectedLine = contextLines[hash % contextLines.length];

  if (!cleanReason) return `Why visit: ${placeName} is a notable ${placeType} around ${placeLocation}. ${selectedLine}`;
  const sentence = /[.!?]$/.test(cleanReason) ? cleanReason : `${cleanReason}.`;
  return cleanReason.split(/\s+/).filter(Boolean).length < 10
    ? `Why visit: ${sentence} ${selectedLine}`
    : `Why visit: ${sentence}`;
}

function deriveRouteStops(route, originName, destinationName) {
  if (!Array.isArray(route)) return [];
  return [...new Set(
    route.map((p) => normalizeName(p)).filter(Boolean)
      .filter((n) => n !== originName && n !== destinationName),
  )];
}

function groupPlacesByCheckpoint(checkpoints, places) {
  const grouped = {};
  checkpoints.forEach((cp) => { grouped[normalizeName(cp)] = []; });
  places.forEach((place) => {
    const loc = normalizeName(place?.location).toLowerCase();
    const nm = normalizeName(place?.name).toLowerCase();
    const key = Object.keys(grouped).find((cp) => {
      const t = cp.toLowerCase();
      return loc.includes(t) || nm.includes(t);
    });
    if (key) grouped[key].push(place);
  });
  return grouped;
}

async function fetchPlaces(query) {
  if (!query || query.length < 2) return [];
  try {
    const res = await fetch(
      `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${OPENCAGE_API_KEY}&limit=5`
    );
    const data = await res.json();
    return (data.results || []).map((item) => ({
      name: item.formatted, lat: item.geometry.lat, lng: item.geometry.lng,
    }));
  } catch { return []; }
}

function useDebouncedSearch(query) {
  const [results, setResults] = useState([]);
  useEffect(() => {
    const id = setTimeout(async () => setResults(await fetchPlaces(query)), 400);
    return () => clearTimeout(id);
  }, [query]);
  return results;
}

function distanceKmCoords(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lng - a.lng);
  const aVal = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

function summarizeOrderedRoute(route) {
  const points = (Array.isArray(route) ? route : [])
    .map((point) => ({
      lat: Number(point?.lat),
      lng: Number(point?.lng ?? point?.lon),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  if (points.length < 2) {
    return { totalDistance: 0, estimatedHours: 0 };
  }

  let totalDistance = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    totalDistance += distanceKmCoords(points[index], points[index + 1]);
  }

  const estimatedHours = Math.max(1, Math.round((totalDistance / 50) * 10) / 10);
  return {
    totalDistance: Math.max(1, Math.round(totalDistance)),
    estimatedHours,
  };
}

function findBestRoute(origin, destination, stops) {
  const rem = [...stops], ordered = [origin];
  let current = origin, total = 0;
  while (rem.length > 0) {
    let ni = 0, nd = distanceKmCoords(current, rem[0]);
    for (let i = 1; i < rem.length; i++) {
      const d = distanceKmCoords(current, rem[i]);
      if (d < nd) { nd = d; ni = i; }
    }
    const [next] = rem.splice(ni, 1);
    ordered.push(next); total += nd; current = next;
  }
  total += distanceKmCoords(current, destination);
  ordered.push(destination);
  const metrics = summarizeOrderedRoute(ordered);
  return { route: ordered, ...metrics };
}

// ─── Main Component ────────────────────────────────────────────────────────────

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
  const [stayPreferences, setStayPreferences] = useState({ hotel3: true, hotel4: true, hotel5: true, travelers: 1, rooms: 1 });
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');

  // Doc-3 API state
  const [checkpointPlaces, setCheckpointPlaces] = useState({});
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState('');
  const [placesRequestKey, setPlacesRequestKey] = useState('');
  const [hiddenPlaces, setHiddenPlaces] = useState({});
  const [draftTripId, setDraftTripId] = useState('');
  const [itineraryLoading, setItineraryLoading] = useState(false);

  // Doc-2 route-edit state
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
        setHistory(parsed.map((item) => ({
          ...item,
          departureDate: item.departureDate || '',
          comingDate: item.comingDate || '',
          budgetRange: Array.isArray(item.budgetRange) ? item.budgetRange : [0, 0],
        })));
      }
    } catch { setHistory([]); }
  }, []);

  const availableStopOptions = useMemo(() => {
    const sel = new Set(stops.map((s) => s.name));
    return stopSuggestions.filter(
      (p) => !sel.has(p.name) && p.name !== getPlaceLabel(origin) && p.name !== getPlaceLabel(destination)
    );
  }, [stopSuggestions, origin, destination, stops]);

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
  const previewSelectedNames = new Set(activeRoute.map((p) => getPlaceLabel(p)));
  const availablePreviewStopOptions = previewStopSuggestions.filter((p) => !previewSelectedNames.has(p.name));
  const occupiedEditNames = new Set(activeRoute.filter((_, i) => i !== editingRouteIndex).map((p) => getPlaceLabel(p)));
  const availableEditStopOptions = editStopSuggestions.filter((p) => !occupiedEditNames.has(p.name));
  const routeMapPoints = activeRoute
    .map((p) => ({
      ...p,
      lat: Number(p?.lat),
      lng: Number(p?.lng ?? p?.lon),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const routeMapPath = routeMapPoints.map((p) => [p.lat, p.lng]);
  const progressPercent = ((currentStep - 1) / (STEP_ITEMS.length - 1)) * 100;

  const commitRouteChange = (nextRoute) => {
    const next = Array.isArray(nextRoute) ? nextRoute : [];
    setFinalizedRoute(next);

    if (!result) return;

    const metrics = summarizeOrderedRoute(next);
    setResult((prev) => (prev ? {
      ...prev,
      route: next,
      totalDistance: metrics.totalDistance,
      estimatedHours: metrics.estimatedHours,
      routeMetrics: metrics,
    } : prev));
  };

  const getNightLabel = (place, index) => {
    const n = Number(place?.nights);
    if (Number.isFinite(n) && n > 0) return `${n} night${n > 1 ? 's' : ''}`;
    const f = DUMMY_NIGHTS_PATTERN[index % DUMMY_NIGHTS_PATTERN.length];
    return `${f} night${f > 1 ? 's' : ''}`;
  };

  // ── Stop management ──
  const addStop = () => {
    setError('');
    if (!newStop) return;
    if (!availableStopOptions.some((p) => p.name === newStop.name)) { setError('Choose a checkpoint from the dropdown suggestions.'); return; }
    if (stops.some((s) => s.name === newStop.name)) return;
    setStops((prev) => [...prev, newStop]);
    setNewStop(null); setNewStopInput('');
  };

  const removeStop = (s) => setStops((prev) => prev.filter((x) => x.name !== s.name));

  const reorderStops = (from, to) => {
    if (from === to || from == null || to == null) return;
    setStops((prev) => {
      if (from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  };

  // ── Route editing (doc-2) ──
  const reorderRoute = (from, to) => {
    if (!result || from === to || from == null || to == null) return;
    const src = finalizedRoute.length > 0 ? finalizedRoute : result.route || [];
    if (from < 0 || to < 0 || from >= src.length || to >= src.length) return;
    if (getPlaceLabel(src[from]) === getPlaceLabel(origin) || getPlaceLabel(src[to]) === getPlaceLabel(origin)) return;
    const next = [...src];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    commitRouteChange(next);
  };

  const editRoutePoint = (index) => {
    if (!result) return;
    const src = finalizedRoute.length > 0 ? finalizedRoute : result.route || [];
    const point = src[index];
    if (!point || getPlaceLabel(point) === getPlaceLabel(origin)) return;
    setEditingRouteIndex(index);
    setEditStopInput(point.name || '');
    setEditNights(Math.max(1, Number(point.nights || 1)));
    setEditStopSelection(null);
    setShowPreviewAddBox(false);
    setShowPreviewEditBox(true);
  };

  const deleteRoutePoint = (index) => {
    if (!result) return;
    const src = finalizedRoute.length > 0 ? finalizedRoute : result.route || [];
    const point = src[index];
    if (!point || getPlaceLabel(point) === getPlaceLabel(origin)) return;
    commitRouteChange(src.filter((_, i) => i !== index));
  };

  const addPreviewDestination = () => {
    if (!result) return;
    const typedName = (previewStopInput || '').trim();
    if (!previewStop && !typedName) { setError('Enter destination name before adding.'); return; }
    const src = finalizedRoute.length > 0 ? finalizedRoute : result.route || [];
    const base = src[src.length - 1] || destination || origin;
    const newPoint = {
      ...(previewStop || {}),
      name: previewStop?.name || typedName,
      lat: typeof previewStop?.lat === 'number' ? previewStop.lat : (base?.lat ?? 20) + 0.12,
      lng: typeof previewStop?.lng === 'number' ? previewStop.lng : (base?.lng ?? 0) + 0.12,
      nights: Math.max(1, Number(previewNights || 1)),
    };
    setError('');
    commitRouteChange([...src, newPoint]);
    setPreviewStop(null); setPreviewStopInput(''); setPreviewNights(1);
    setShowPreviewAddBox(false); setDragRouteIndex(null);
  };

  const applyPreviewEdit = () => {
    if (!result || editingRouteIndex == null) return;
    const nextName = (editStopInput || '').trim();
    if (!nextName) { setError('Enter destination name before saving edits.'); return; }
    const src = finalizedRoute.length > 0 ? finalizedRoute : result.route || [];
    if (editingRouteIndex < 0 || editingRouteIndex >= src.length) return;
    setError('');
    commitRouteChange(src.map((item, i) =>
      i === editingRouteIndex
        ? { ...item, name: nextName, lat: editStopSelection?.lat ?? item.lat, lng: editStopSelection?.lng ?? item.lng, nights: Math.max(1, Number(editNights || 1)) }
        : item
    ));
    setShowPreviewEditBox(false); setEditingRouteIndex(null); setEditStopInput(''); setEditNights(1); setEditStopSelection(null);
  };

  // ── Build journey ──
  const buildJourney = () => {
    setError(''); setPlacesError(''); setCheckpointPlaces({}); setPlacesRequestKey(''); setHiddenPlaces({});
    if (!origin || !destination) { setError('Select valid start and destination cities from suggestions.'); return; }
    if (origin.name === destination.name) { setError('Origin and destination must be different.'); return; }
    if (!departureDate || !comingDate) { setError('Please add both departure and coming dates.'); return; }
    if (new Date(comingDate) < new Date(departureDate)) { setError('Coming date must be after departure date.'); return; }
    const optimized = findBestRoute(origin, destination, stops);
    const journeyRecord = {
      id: Date.now(), createdAt: new Date().toISOString(),
      origin, destination, departureDate, comingDate, budgetRange, stops,
      route: optimized.route,
      totalDistance: optimized.totalDistance,
      estimatedHours: optimized.estimatedHours,
      routeMetrics: {
        totalDistance: optimized.totalDistance,
        estimatedHours: optimized.estimatedHours,
      },
    };
    setResult(journeyRecord);
    setFinalizedRoute(optimized.route);
    setShowPreviewAddBox(false); setShowPreviewEditBox(false);
    setEditingRouteIndex(null); setEditStopSelection(null);
    setCurrentStep(2);
  };

  // ── Checkpoint toggle ──
  const toggleCheckpoint = (place) => {
    if (!result || place.name === origin?.name || place.name === destination?.name) return;
    setFinalizedRoute((prev) => {
      if (prev.some((cp) => cp.name === place.name)) return prev.filter((cp) => cp.name !== place.name);
      const next = [...prev];
      const di = next.findIndex((cp) => cp.name === destination.name);
      di >= 0 ? next.splice(di, 0, place) : next.push(place);
      const metrics = summarizeOrderedRoute(next);
      setResult((current) => (current ? {
        ...current,
        route: next,
        totalDistance: metrics.totalDistance,
        estimatedHours: metrics.estimatedHours,
        routeMetrics: metrics,
      } : current));
      return next;
    });
  };

  // ── Approve / generate itinerary ──
  const approveJourney = async () => {
    if (!result) return;
    const routeForPlanner = finalizedRoute.length > 0 ? finalizedRoute : result.route;
    const approvedJourney = { ...result, route: routeForPlanner, stayPreferences };
    const approvedHistory = [approvedJourney, ...history].slice(0, 12);
    setHistory(approvedHistory);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(approvedHistory));

    const selectedPlaces = routeForPlanner
      .slice(1)
      .flatMap((place) => {
        const key = normalizeName(place);
        return (checkpointPlaces[key] || []).filter((c) => !hiddenPlaces[key]?.[normalizeName(c.name)]);
      })
      .map((c) => ({
        name: c.name,
        type: c.type,
        location: c.location,
        lat: Number(c?.lat),
        lng: Number(c?.lng ?? c?.lon),
        rating: Number(c?.rating),
        popularity: Number(c?.popularity),
        best_visit_reason: c.best_visit_reason,
        imageUrl: c.imageUrl,
      }))
      .filter((c, i, all) => all.findIndex((x) => `${x.name}|${x.location}` === `${c.name}|${c.location}`) === i);

    const fallbackRoutePlaces = routeForPlanner
      .slice(1)
      .map((place) => {
        const label = normalizeName(place);
        if (!label) return null;

        return {
          name: label,
          type: 'route-stop',
          location: label,
          lat: Number(place?.lat),
          lng: Number(place?.lng ?? place?.lon),
          best_visit_reason: 'Route stop added from the approved journey path.',
          imageUrl: '',
        };
      })
      .filter(Boolean);

    const itineraryPlaces = selectedPlaces.length > 0 ? selectedPlaces : fallbackRoutePlaces;

    if (!itineraryPlaces.length) { setPlacesError('Please keep at least one stop before generating itinerary.'); return; }

    try {
      setItineraryLoading(true); setPlacesError('');
      let currentTripId = draftTripId;
      if (!currentTripId) {
        const originName = normalizeName(origin), destinationName = normalizeName(destination);
        const created = await createTrip({
          origin: originName, destination: destinationName,
          stops: deriveRouteStops(routeForPlanner, originName, destinationName),
          budget: Number(budgetRange?.[1] || 0),
          dates: [departureDate, comingDate].filter(Boolean),
        });
        currentTripId = created?.trip?._id || '';
        if (!currentTripId) throw new Error('Unable to create trip for itinerary generation.');
        setDraftTripId(currentTripId);
      }
      await selectPlaces(currentTripId, itineraryPlaces);
      const itineraryResp = await generateItinerary(currentTripId);
      navigate('/itinerary-planner', {
        state: { journey: approvedJourney, itinerary: itineraryResp?.itinerary || null, selectedPlaces: itineraryPlaces, tripId: currentTripId },
      });
    } catch (err) {
      setPlacesError(err.message || 'Failed to generate itinerary.');
    } finally {
      setItineraryLoading(false);
    }
  };

  // ── Fetch places on step 4 ──
  useEffect(() => {
    if (currentStep !== 4 || !result || activeRoute.length === 0) return;
    const originName = normalizeName(origin), destinationName = normalizeName(destination);
    const payload = {
      origin: originName, destination: destinationName,
      stops: deriveRouteStops(activeRoute, originName, destinationName),
      budget: Number(budgetRange?.[1] || 0),
      dates: [departureDate, comingDate].filter(Boolean),
    };
    const requestKey = JSON.stringify({ route: activeRoute.map((p) => normalizeName(p)), dates: payload.dates, budget: payload.budget });
    if (requestKey === placesRequestKey) return;

    (async () => {
      try {
        setPlacesLoading(true); setPlacesError('');
        const created = await createTrip(payload);
        const tripId = created?.trip?._id;
        if (!tripId) throw new Error('Unable to generate recommendations right now.');
        setDraftTripId(tripId);
        const placeResp = await generatePlaces(tripId);
        const candidates = Array.isArray(placeResp?.places) ? placeResp.places : [];
        setCheckpointPlaces(groupPlacesByCheckpoint(activeRoute, candidates));
        setPlacesRequestKey(requestKey);
      } catch (err) {
        setPlacesError(err.message || 'Failed to load checkpoint recommendations.');
      } finally {
        setPlacesLoading(false);
      }
    })();
  }, [activeRoute, budgetRange, comingDate, currentStep, departureDate, destination, origin, placesRequestKey, result]);

  const hidePlaceCard = (checkpointName, placeName) => {
    const ck = normalizeName(checkpointName), pk = normalizeName(placeName);
    if (!ck || !pk) return;
    setHiddenPlaces((prev) => ({ ...prev, [ck]: { ...(prev[ck] || {}), [pk]: true } }));
  };

  const handleLogout = async () => {
    try { await logoutUser(); } catch { /* redirect anyway */ }
    navigate('/login');
  };

  const resetPlanner = () => {
    setResult(null); setFinalizedRoute([]); setError('');
    setOrigin(null); setOriginInput(''); setDestination(null); setDestinationInput('');
    setNewStop(null); setNewStopInput(''); setStops([]);
    setDragStopIndex(null); setDragRouteIndex(null);
    setPreviewStop(null); setPreviewStopInput(''); setPreviewNights(1);
    setShowPreviewAddBox(false); setShowPreviewEditBox(false);
    setEditingRouteIndex(null); setEditStopInput(''); setEditNights(1); setEditStopSelection(null);
    setStayPreferences({ hotel3: true, hotel4: true, hotel5: true, travelers: 1, rooms: 1 });
    setCheckpointPlaces({}); setPlacesLoading(false); setPlacesError('');
    setPlacesRequestKey(''); setHiddenPlaces({}); setDraftTripId(''); setItineraryLoading(false);
    setCurrentStep(1);
  };

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[radial-gradient(1200px_600px_at_85%_-15%,rgba(245,158,11,0.12),transparent_60%),radial-gradient(1000px_560px_at_0%_100%,rgba(37,99,235,0.18),transparent_56%),linear-gradient(155deg,#020617_0%,#0b1324_45%,#020617_100%)] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[url('/detective.bg.png')] bg-cover bg-center opacity-[0.5]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.4),rgba(2,6,23,0.75))]" aria-hidden="true" />

      {/* ── Header ── */}
      <header className="relative z-10 w-full border-b border-amber-300/20 bg-slate-950/70 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-4 px-4 py-5 md:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/85">Field Command</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-100 md:text-3xl">Operation Round Table</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">Align route strategy, checkpoints, and approvals from one control desk before final mission lock.</p>
          </div>
          <button type="button" onClick={handleLogout}
            className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/80">
            Sign out
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-8 md:px-8">

        {/* ── Progress Bar ── */}
        <section className="mb-8 rounded-2xl border border-slate-700/70 bg-slate-900/55 p-4 shadow-[0_18px_44px_rgba(2,6,23,0.28)] backdrop-blur-sm md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Route Planner</p>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Step {currentStep} of {STEP_ITEMS.length}</p>
          </div>
          <div className="relative h-2 w-full rounded-full bg-slate-800/80">
            <motion.div className="h-full rounded-full bg-linear-to-r from-amber-300 via-amber-400 to-blue-400"
              animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.35, ease: 'easeOut' }} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {STEP_ITEMS.map((label, index) => {
              const n = index + 1, isActive = n === currentStep, isDone = n < currentStep;
              return (
                <div key={label} className={`rounded-xl border px-3 py-3 text-center text-sm shadow-sm transition ${isActive ? 'border-amber-300/50 bg-slate-950/90 font-semibold text-amber-200' : isDone ? 'border-slate-600 bg-slate-900/80 font-medium text-slate-300' : 'border-slate-700 bg-slate-900/60 font-medium text-slate-500 opacity-70'}`}>
                  {label}
                </div>
              );
            })}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            STEP 1
        ══════════════════════════════════════════════════════════════════ */}
        {!result ? (
          <MotionSection initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}
            className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-700/70 bg-slate-900/75 p-5 shadow-[0_24px_52px_rgba(2,6,23,0.52)] backdrop-blur-md md:p-6">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Select Your Travel Destinations and Dates</h2>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {/* Left */}
              <div className="space-y-6">
                {/* Origin */}
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">Start Location</span>
                  <div className="relative">
                    <input value={originInput} onChange={(e) => { setOriginInput(e.target.value); setOrigin(null); }} placeholder="Type to search city"
                      className="w-full rounded-xl border border-slate-600 bg-slate-950/75 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30" />
                    {originInput && originSuggestions.length > 0 && !originSuggestions.some((p) => p.name === originInput) && (
                      <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950/95 shadow-xl">
                        {originSuggestions.map((place) => (
                          <button key={place.name} type="button" onMouseDown={() => { setOrigin(place); setOriginInput(place.name); }}
                            className="block w-full border-b border-slate-800 px-4 py-3 text-left transition hover:bg-slate-800/80">
                            <p className="text-sm text-slate-100">{place.name}</p>
                            <p className="text-xs text-slate-400">{place.lat.toFixed(2)}, {place.lng.toFixed(2)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </label>

                {/* Destination */}
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">Destination</span>
                  <div className="relative">
                    <input value={destinationInput} onChange={(e) => { setDestinationInput(e.target.value); setDestination(null); }} placeholder="Type to search city"
                      className="w-full rounded-xl border border-slate-600 bg-slate-950/75 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30" />
                    {destinationInput && destinationSuggestions.length > 0 && !destinationSuggestions.some((p) => p.name === destinationInput) && (
                      <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950/95 shadow-xl">
                        {destinationSuggestions.map((place) => (
                          <button key={place.name} type="button" onMouseDown={() => { setDestination(place); setDestinationInput(place.name); }}
                            className="block w-full border-b border-slate-800 px-4 py-3 text-left transition hover:bg-slate-800/80">
                            <p className="text-sm text-slate-100">{place.name}</p>
                            <p className="text-xs text-slate-400">{place.lat.toFixed(2)}, {place.lng.toFixed(2)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </label>

                {/* Dates */}
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">Departure Date</span>
                    <input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-600 bg-slate-950/75 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">Coming Date</span>
                    <input type="date" value={comingDate} onChange={(e) => setComingDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-600 bg-slate-950/75 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30" />
                  </label>
                </div>
              </div>

              {/* Right */}
              <div className="space-y-6">
                {/* Budget */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-300">Budget Range</p>
                    <p className="text-sm font-semibold text-slate-100">${budgetRange[0].toLocaleString()} - ${budgetRange[1].toLocaleString()}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input type="number" min="0" step="100" value={budgetRange[0]} onChange={(e) => setBudgetRange([Number(e.target.value || 0), budgetRange[1]])}
                      className="rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/70 focus:ring-2 focus:ring-blue-400/30" placeholder="Min budget" />
                    <input type="number" min="0" step="100" value={budgetRange[1]} onChange={(e) => setBudgetRange([budgetRange[0], Number(e.target.value || 0)])}
                      className="rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/70 focus:ring-2 focus:ring-blue-400/30" placeholder="Max budget" />
                  </div>
                </div>

                {/* Checkpoints */}
                <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                  <p className="mb-3 text-sm font-medium text-slate-300">Route Checkpoints</p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <input value={newStopInput} onChange={(e) => { setNewStopInput(e.target.value); setNewStop(null); }}
                        className="w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30"
                        placeholder="Type to search checkpoint" />
                      {newStopInput && availableStopOptions.length > 0 && !availableStopOptions.some((p) => p.name === newStopInput) && (
                        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950/95 shadow-xl">
                          {availableStopOptions.map((place) => (
                            <button key={place.name} type="button" onMouseDown={() => { setNewStop(place); setNewStopInput(place.name); }}
                              className="block w-full border-b border-slate-800 px-4 py-3 text-left transition hover:bg-slate-800/80">
                              <p className="text-sm text-slate-100">{place.name}</p>
                              <p className="text-xs text-slate-400">{place.lat.toFixed(2)}, {place.lng.toFixed(2)}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={addStop} disabled={!newStop}
                      className="rounded-xl border border-amber-300/35 bg-linear-to-b from-amber-500/85 to-amber-700/85 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                      + Add
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {stops.length === 0 ? (
                      <p className="text-sm text-slate-500">No checkpoints added.</p>
                    ) : stops.map((stop, index) => (
                      <div key={stop.name} draggable
                        onDragStart={() => setDragStopIndex(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => { reorderStops(dragStopIndex, index); setDragStopIndex(null); }}
                        onDragEnd={() => setDragStopIndex(null)}
                        className={`flex items-center justify-between rounded-xl border bg-slate-900/70 px-3 py-2 text-sm text-slate-200 transition ${dragStopIndex === index ? 'border-amber-300/80 bg-amber-300/10' : 'border-slate-700 hover:border-amber-300/60'}`}>
                        <div className="flex items-center gap-2">
                          <span className="cursor-grab text-xs text-slate-400">::</span>
                          <span>{stop.name}</span>
                        </div>
                        <button type="button" onClick={() => removeStop(stop)}
                          className="rounded-md border border-slate-600 px-2 py-1 text-[0.68rem] uppercase tracking-[0.12em] text-slate-300 transition hover:border-red-300/70 hover:text-red-200">Delete</button>
                      </div>
                    ))}
                  </div>
                </div>

                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <button type="button" onClick={resetPlanner}
                    className="rounded-xl border border-slate-600 bg-slate-900/70 px-5 py-3 text-lg font-medium text-slate-200 transition hover:bg-slate-800/80">Cancel</button>
                  <button type="button" onClick={buildJourney}
                    className="rounded-xl border border-amber-300/35 bg-linear-to-r from-blue-600/85 to-blue-800/85 px-5 py-3 text-lg font-semibold text-white transition hover:brightness-110">Continue</button>
                </div>
              </div>
            </div>
          </MotionSection>

        /* ══════════════════════════════════════════════════════════════════
            STEP 2 — Route Preview (Leaflet map + drag/edit + Wikipedia thumbs)
        ══════════════════════════════════════════════════════════════════ */
        ) : currentStep === 2 ? (
          <MotionSection initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}
            className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-6 shadow-[0_24px_52px_rgba(2,6,23,0.52)] backdrop-blur-md md:p-8">
            <div className="relative mb-5 flex items-center justify-between gap-3">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Route Preview</h2>
              <button type="button" onClick={() => { setShowPreviewAddBox((p) => !p); setShowPreviewEditBox(false); }}
                className="rounded-lg border border-amber-300/50 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-200 hover:bg-amber-400/20">
                + Add Destination
              </button>

              {/* Add box */}
              {showPreviewAddBox && (
                <div className="absolute right-0 top-12 z-30 w-full max-w-md rounded-xl border border-slate-600/80 bg-slate-900/95 p-3 shadow-xl backdrop-blur-md">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">Add Destination</p>
                    <button type="button" onClick={() => { setShowPreviewAddBox(false); setPreviewStop(null); setPreviewStopInput(''); setPreviewNights(1); }}
                      className="rounded-md border border-slate-500 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-300">Close</button>
                  </div>
                  <div className="relative">
                    <input value={previewStopInput} onChange={(e) => { setPreviewStopInput(e.target.value); setPreviewStop(null); }} placeholder="Search Destination"
                      className="w-full rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-300/70 focus:ring-2 focus:ring-blue-300/30" />
                    {previewStopInput && availablePreviewStopOptions.length > 0 && !availablePreviewStopOptions.some((p) => p.name === previewStopInput) && (
                      <div className="absolute z-40 mt-2 max-h-44 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/95 shadow-xl">
                        {availablePreviewStopOptions.map((place) => (
                          <button key={place.name} type="button" onMouseDown={() => { setPreviewStop(place); setPreviewStopInput(place.name); }}
                            className="block w-full border-b border-slate-800 px-3 py-2 text-left transition hover:bg-slate-800/80">
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
                      <button type="button" onClick={() => setPreviewNights((p) => Math.max(1, p - 1))} className="h-7 w-7 rounded-full border border-slate-500 text-sm font-bold text-slate-200 transition hover:border-slate-300">-</button>
                      <span className="min-w-5 text-center text-sm font-semibold text-slate-100">{previewNights}</span>
                      <button type="button" onClick={() => setPreviewNights((p) => Math.min(30, p + 1))} className="h-7 w-7 rounded-full border border-slate-500 text-sm font-bold text-slate-200 transition hover:border-slate-300">+</button>
                    </div>
                  </div>
                  <button type="button" onClick={addPreviewDestination}
                    className="mt-3 w-full rounded-lg border border-amber-300/50 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-200 hover:bg-amber-400/20">Add Destination</button>
                </div>
              )}

              {/* Edit box */}
              {showPreviewEditBox && (
                <div className="absolute right-0 top-12 z-30 w-full max-w-md rounded-xl border border-slate-600/80 bg-slate-900/95 p-3 shadow-xl backdrop-blur-md">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">Edit Destination</p>
                    <button type="button" onClick={() => { setShowPreviewEditBox(false); setEditingRouteIndex(null); setEditStopInput(''); setEditNights(1); setEditStopSelection(null); }}
                      className="rounded-md border border-slate-500 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-300">Close</button>
                  </div>
                  <div className="relative">
                    <input value={editStopInput} onChange={(e) => { setEditStopInput(e.target.value); setEditStopSelection(null); }} placeholder="Search Destination"
                      className="w-full rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-300/70 focus:ring-2 focus:ring-blue-300/30" />
                    {editStopInput && availableEditStopOptions.length > 0 && !availableEditStopOptions.some((p) => p.name === editStopInput) && (
                      <div className="absolute z-40 mt-2 max-h-44 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-950/95 shadow-xl">
                        {availableEditStopOptions.map((place) => (
                          <button key={place.name} type="button" onMouseDown={() => { setEditStopSelection(place); setEditStopInput(place.name); }}
                            className="block w-full border-b border-slate-800 px-3 py-2 text-left transition hover:bg-slate-800/80">
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
                      <button type="button" onClick={() => setEditNights((p) => Math.max(1, p - 1))} className="h-7 w-7 rounded-full border border-slate-500 text-sm font-bold text-slate-200 transition hover:border-slate-300">-</button>
                      <span className="min-w-5 text-center text-sm font-semibold text-slate-100">{editNights}</span>
                      <button type="button" onClick={() => setEditNights((p) => Math.min(30, p + 1))} className="h-7 w-7 rounded-full border border-slate-500 text-sm font-bold text-slate-200 transition hover:border-slate-300">+</button>
                    </div>
                  </div>
                  <button type="button" onClick={applyPreviewEdit}
                    className="mt-3 w-full rounded-lg border border-blue-300/50 bg-blue-400/10 px-3 py-2 text-sm font-semibold text-blue-200 transition hover:border-blue-200 hover:bg-blue-400/20">Save Changes</button>
                </div>
              )}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Route list: drag + Wikipedia thumb + edit/delete */}
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                  {activeRoute.map((place, index) => {
                    const isCore = getPlaceLabel(place) === getPlaceLabel(origin);
                    const isSelected = finalizedRoute.some((cp) => cp.name === place.name);
                    return (
                      <div key={`${place.name}-${index}`} draggable={!isCore}
                        onDragStart={() => { if (!isCore) setDragRouteIndex(index); }}
                        onDragOver={(e) => { if (!isCore) e.preventDefault(); }}
                        onDrop={() => { reorderRoute(dragRouteIndex, index); setDragRouteIndex(null); }}
                        onDragEnd={() => setDragRouteIndex(null)}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition ${isSelected ? 'border-amber-300/50 bg-amber-300/10' : 'border-slate-700 bg-slate-950/45 opacity-60 hover:border-amber-300/40 hover:opacity-100'} ${isCore ? 'cursor-default' : 'cursor-move'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <LocationPhoto placeName={getPlaceLabel(place)} searchHint={place.location || getPlaceLabel(destination)} className="h-10 w-14 shrink-0 rounded-lg" />
                            <div className="min-w-0">
                              <p className={`truncate text-sm font-medium ${isSelected ? 'text-slate-100' : 'text-slate-400'}`}>{getPlaceLabel(place)}</p>
                              <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Stay: {getNightLabel(place, index)}</p>
                            </div>
                            {isCore && <span className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Required</span>}
                          </div>
                          {!isCore && (
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => editRoutePoint(index)}
                                className="rounded-md border border-blue-400/40 px-2 py-1 text-[0.62rem] uppercase tracking-[0.12em] text-blue-200 transition hover:border-blue-300 hover:bg-blue-500/20">Edit</button>
                              <button type="button" onClick={() => deleteRoutePoint(index)}
                                className="rounded-md border border-red-400/40 px-2 py-1 text-[0.62rem] uppercase tracking-[0.12em] text-red-200 transition hover:border-red-300 hover:bg-red-500/20">Delete</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Final route map + mission status */}
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
                    <p className="mt-1 text-lg font-semibold text-slate-100">{getPlaceLabel(origin)} -&gt; {getPlaceLabel(destination)}</p>
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

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button type="button" onClick={resetPlanner}
                className="rounded-xl border border-slate-600 bg-slate-900/70 px-5 py-3 text-lg font-medium text-slate-200 transition hover:bg-slate-800/80">Back</button>
              <button type="button" onClick={() => setCurrentStep(3)}
                className="rounded-xl border border-amber-300/35 bg-linear-to-r from-amber-500/85 to-amber-700/85 px-5 py-3 text-lg font-semibold text-slate-950 transition hover:brightness-110">Continue to Stay Preferences</button>
            </div>
          </MotionSection>

        /* ══════════════════════════════════════════════════════════════════
            STEP 3 — Stay Preferences
        ══════════════════════════════════════════════════════════════════ */
        ) : currentStep === 3 ? (
          <MotionSection initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}
            className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-700/70 bg-slate-900/75 p-6 shadow-[0_24px_52px_rgba(2,6,23,0.52)] backdrop-blur-md md:p-8">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Stay Preferences</h2>
            <p className="mt-2 text-sm text-slate-400">Select hotel comfort and room allocation before finalizing the route.</p>
            <div className="mt-8 space-y-6">
              <div className="rounded-xl border border-amber-300/30 bg-slate-950/55 p-4">
                <p className="mb-3 text-lg font-semibold text-slate-100">Hotel Type</p>
                <div className="space-y-3">
                  {[['hotel3', '3-Stars'], ['hotel4', '4-Stars'], ['hotel5', '5-Stars']].map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setStayPreferences((prev) => ({ ...prev, [key]: !prev[key] }))}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3 text-left transition hover:border-amber-300/45">
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
                    <input type="number" min="1" value={stayPreferences.travelers}
                      onChange={(e) => setStayPreferences((prev) => ({ ...prev, travelers: Math.max(1, Number(e.target.value || 1)) }))}
                      className="w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Rooms</span>
                    <input type="number" min="1" value={stayPreferences.rooms}
                      onChange={(e) => setStayPreferences((prev) => ({ ...prev, rooms: Math.max(1, Number(e.target.value || 1)) }))}
                      className="w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-base font-medium text-slate-100 outline-none transition focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30" />
                  </label>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <button type="button" onClick={() => setCurrentStep(2)}
                  className="rounded-xl border border-slate-600 bg-slate-900/70 px-5 py-3 text-lg font-medium text-slate-200 transition hover:bg-slate-800/80">Back</button>
                <button type="button" onClick={() => setCurrentStep(4)}
                  className="rounded-xl border border-amber-300/35 bg-linear-to-r from-amber-500/85 to-amber-700/85 px-5 py-3 text-lg font-semibold text-slate-950 transition hover:brightness-110">View Final Route</button>
              </div>
            </div>
          </MotionSection>

        /* ══════════════════════════════════════════════════════════════════
            STEP 4 — Final Route (API place cards + Leaflet + Wikipedia photos)
        ══════════════════════════════════════════════════════════════════ */
        ) : (
          <MotionSection initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}
            className="rounded-2xl border border-slate-700/70 bg-slate-900/75 p-6 shadow-[0_24px_52px_rgba(2,6,23,0.52)] backdrop-blur-md md:p-8">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Final Route</h2>
              <button type="button" onClick={() => setCurrentStep(3)} className="text-lg font-medium text-amber-300 underline-offset-2 hover:underline">Edit Preferences</button>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Checkpoints with Wikipedia thumbs */}
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Final Checkpoints</p>
                  {placesLoading && <p className="text-[0.68rem] text-slate-400">Loading place intel...</p>}
                </div>
                {placesError && <p className="mt-2 text-xs text-red-300">{placesError}</p>}
                <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                  {activeRoute.map((place, index) => {
                    const label = getPlaceLabel(place);
                    const isCore = label === getPlaceLabel(origin) || label === getPlaceLabel(destination);
                    return (
                      <div key={`${label}-${index}`} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/45 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <LocationPhoto placeName={label} searchHint={label} className="h-10 w-14 shrink-0 rounded-lg" />
                          <span className="h-3 w-3 shrink-0 rounded-full bg-amber-300" />
                          <span className="text-sm font-medium text-slate-100">{label}</span>
                          {isCore && <span className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Required</span>}
                        </div>
                        <span className="text-xs uppercase tracking-[0.14em] text-amber-300">Locked</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Leaflet map */}
              <div className="rounded-xl border border-slate-700/80 bg-slate-950/55 p-4">
                <div className="relative h-full min-h-80 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70">
                  <MapContainer center={routeMapPoints[0] ? [routeMapPoints[0].lat, routeMapPoints[0].lng] : [20, 0]} zoom={3} scrollWheelZoom className="h-full w-full z-10 custom-sea-blue-filter">
                    <TileLayer attribution='&copy; <a href="https://carto.com/">CartoDB</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                    {routeMapPath.length > 1 && <Polyline positions={routeMapPath} pathOptions={{ color: '#0ea5e9', weight: 3, dashArray: '5, 10' }} />}
                    {routeMapPoints.map((p, index) => <Marker key={`${p.name || 'route-point'}-${index}`} position={[p.lat, p.lng]} />)}
                  </MapContainer>
                  <div className="absolute bottom-4 left-4 z-20 rounded border border-white/10 bg-black/60 p-2 px-4 text-[9px] font-mono text-cyan-400 backdrop-blur-md">Route_Map_View</div>
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

            {/* Generated Place Blocks (doc-3) + Wikipedia photo fallback */}
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
                    (c) => !hiddenPlaces[checkpointKey]?.[normalizeName(c.name)],
                  );
                  const isDestination = index === activeRoute.slice(1).length - 1;

                  return (
                    <div key={`${checkpointKey}-${index}`} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
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
                        ) : relatedPlaces.map((candidate) => (
                          <div key={`${candidate.name}-${candidate.location}`}
                            className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/80 shadow-[0_10px_28px_rgba(2,6,23,0.32)]">
                            <div className="flex items-start justify-between gap-3 p-3 pb-1">
                              <div className="min-w-0 flex-1">
                                <p className="text-lg font-semibold text-slate-100">{candidate.name || 'Unnamed place'}</p>
                                <p className="mt-1 text-sm text-slate-300">{candidate.location || 'Location unavailable'}</p>
                              </div>
                              <button type="button" onClick={() => hidePlaceCard(checkpointKey, candidate.name)}
                                className="rounded-full border border-slate-600 px-3 py-1 text-[0.68rem] uppercase tracking-[0.14em] text-slate-200 transition hover:border-rose-400 hover:text-rose-300">Remove</button>
                            </div>

                            {/* API image → Wikipedia fallback */}
                            {candidate.imageUrl ? (
                              <img src={candidate.imageUrl} alt={candidate.name || 'Place image'}
                                className="mt-2 h-44 w-full object-cover" loading="lazy" />
                            ) : (
                              <LocationPhoto placeName={candidate.name} searchHint={candidate.location} className="mt-2 h-44 w-full rounded-none" />
                            )}

                            <div className="p-3 pt-3">
                              <p className="border-l-2 border-amber-300/70 pl-3 text-sm leading-relaxed text-slate-200">
                                {getVisitDescription(candidate, label)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="mt-6">
              <button type="button" onClick={approveJourney} disabled={itineraryLoading || placesLoading}
                className="w-full rounded-xl border border-amber-200/40 bg-linear-to-r from-amber-300 via-amber-500 to-amber-700 px-5 py-3 text-lg font-semibold text-slate-950 shadow-[0_12px_28px_rgba(245,158,11,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                {itineraryLoading ? 'Generating Itinerary...' : 'Generate Itinerary'}
              </button>
            </div>

            <div className="mt-4 flex justify-start">
              <button type="button" onClick={() => setCurrentStep(3)}
                className="text-sm font-medium text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">
                Back to Stay Preferences
              </button>
            </div>
          </MotionSection>
        )}

        {/* ── Footer ── */}
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
