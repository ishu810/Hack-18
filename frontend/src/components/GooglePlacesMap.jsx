import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { computeRoute } from '../api';
import { buildRouteMetrics, formatDistance } from '../utils/routeMath';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_GOOGLE_API_KEY || '';

const MARKER_COLORS = {
  current: '#0ea5e9',
  origin: '#3b82f6',
  destination: '#ef4444',
  active: '#f59e0b',
  other: '#22c55e',
};

const MAP_OPTIONS = {
  disableDefaultUI: false,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  zoomControl: true,
  clickableIcons: false,
  gestureHandling: 'greedy',
};

const EMPTY_ROUTE_OPTIONS = {};

// Load Google Maps script manually
function getWindowLoaderPromise() {
  if (typeof window === 'undefined') return null;
  return window.__googleMapsLoaderPromise || null;
}

function setWindowLoaderPromise(value) {
  if (typeof window === 'undefined') return;
  window.__googleMapsLoaderPromise = value;
}

function isMapsApiReady() {
  return Boolean(
    typeof window !== 'undefined'
    && window.google?.maps
    && (typeof window.google.maps.Map === 'function' || typeof window.google.maps.importLibrary === 'function')
  );
}

function waitForMapsApiReady(timeoutMs = 12000, pollMs = 50) {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    const poll = () => {
      if (isMapsApiReady()) {
        resolve();
        return;
      }

      if (Date.now() - started >= timeoutMs) {
        reject(new Error('Google Maps API did not finish initializing in time'));
        return;
      }

      window.setTimeout(poll, pollMs);
    };

    poll();
  });
}

function loadGoogleMapsScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Maps can only load in the browser'));
  if (isMapsApiReady()) return Promise.resolve();

  const existingPromise = getWindowLoaderPromise();
  if (existingPromise) return existingPromise;

  const existingScript = document.getElementById('google-maps-script');
  if (existingScript) {
    const promise = new Promise((resolve, reject) => {
      const poll = () => {
        if (isMapsApiReady()) {
          resolve();
          return;
        }
        if (!document.getElementById('google-maps-script')) {
          reject(new Error('Google Maps script was removed before it loaded'));
          return;
        }
        window.setTimeout(poll, 50);
      };
      poll();
    });
    setWindowLoaderPromise(promise);
    return promise;
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&v=weekly&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      waitForMapsApiReady().then(resolve).catch(reject);
    };
    script.onerror = () => {
      setWindowLoaderPromise(null);
      reject(new Error('Failed to load Google Maps'));
    };
    document.head.appendChild(script);
  });

  setWindowLoaderPromise(promise);
  return promise;
}

function normalizeName(value = '') {
  return String(value || '')
    .toLowerCase()
    .split(',')[0]
    .trim();
}

function toLatLng(place) {
  const lat = Number(place?.lat);
  const lng = Number(place?.lng ?? place?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function normalizePathPoint(point) {
  if (Array.isArray(point)) {
    const lat = Number(point[0]);
    const lng = Number(point[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  const lat = Number(point?.lat);
  const lng = Number(point?.lng ?? point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function dedupeConsecutivePoints(points = []) {
  const deduped = [];
  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.lat === point.lat && prev.lng === point.lng) continue;
    deduped.push(point);
  }
  return deduped;
}

function buildRouteInputHash(points = [], mode = 'drive', options = {}) {
  const coords = points.map((point) => `${Number(point.lat).toFixed(6)},${Number(point.lng).toFixed(6)}`).join('|');
  return `${mode}|${JSON.stringify(options || {})}|${coords}`;
}

function getBoundsCenter(points) {
  const normalized = points.map((point) => normalizePathPoint(point)).filter(Boolean);
  if (!normalized.length) return { lat: 20.5937, lng: 78.9629 };
  const lat = normalized.reduce((sum, point) => sum + point.lat, 0) / normalized.length;
  const lng = normalized.reduce((sum, point) => sum + point.lng, 0) / normalized.length;
  return { lat, lng };
}

function buildMarkerIcon(index, color, isFocused = false) {
  const size = isFocused ? 48 : 40;
  const height = isFocused ? 60 : 52;
  const fontSize = isFocused ? 16 : 13;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 ${size} ${height}">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.35" />
        </filter>
      </defs>
      ${isFocused ? `<circle cx="${size / 2}" cy="${size / 2 - 1}" r="${size / 2 - 2}" fill="none" stroke="${color}" stroke-width="2" opacity="0.5" />` : ''}
      <path filter="url(#shadow)" d="M ${size / 2} 0 C ${size - 7} 0 ${size} 8 ${size} 19.5 C ${size} 34.5 ${size / 2} ${height} ${size / 2} ${height} C ${size / 2} ${height} 0 34.5 0 19.5 C 0 8 7 0 ${size / 2} 0 Z" fill="${color}" stroke="#fff" stroke-width="3" />
      <circle cx="${size / 2}" cy="${height * 0.38}" r="${size * 0.15}" fill="#fff" opacity="0.95" />
      <text x="50%" y="${height * 0.45}" text-anchor="middle" dominant-baseline="middle" fill="#0f172a" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800">${index + 1}</text>
    </svg>
  `;

  const icon = {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
  };

  if (typeof window !== 'undefined' && window.google?.maps) {
    icon.scaledSize = new window.google.maps.Size(size, height);
    icon.anchor = new window.google.maps.Point(size / 2, height);
  }

  return icon;
}

function LegendCard() {
  const items = [
    { label: 'You are here', color: MARKER_COLORS.current },
    { label: 'Origin', color: MARKER_COLORS.origin },
    { label: 'Destination', color: MARKER_COLORS.destination },
    { label: 'Active day', color: MARKER_COLORS.active },
    { label: 'Other places', color: MARKER_COLORS.other },
  ];

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-50 rounded-xl border border-slate-300/40 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 shadow-lg backdrop-blur-sm">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 py-0.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function formatDurationLabel(minutes = 0) {
  const rounded = Math.max(1, Math.round(Number(minutes) || 0));
  if (rounded < 60) {
    return `${rounded} min`;
  }

  const hours = rounded / 60;
  return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} hrs`;
}

export default function PlacesMap({
  places = [],
  routePlaces = [],
  routeSegments = [],
  selectedRouteSegmentIndex = null,
  onRouteSegmentClick = null,
  className = 'h-96',
  showRoute = true,
  originName = '',
  destinationName = '',
  activePlaceNames = [],
  focusPlaceName = '',
  onMarkerClick = null,
  userLocation = null,
  routeMode = 'drive',
  routeOptions = EMPTY_ROUTE_OPTIONS,
  routeRefreshToken = 0,
  routeDebounceMs = 300,
  fitSignal = 'initial',
  onRouteError = null,
  onRouteComputed = null,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const infoWindowRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [selectedPlaceName, setSelectedPlaceName] = useState('');
  const [routePoints, setRoutePoints] = useState([]);
  const [routeStats, setRouteStats] = useState({
    distanceMeters: 0,
    distanceKm: 0,
    durationSeconds: 0,
    durationMinutes: 0,
    estimatedMinutes: 0,
    averageSpeedKmh: 0,
    legs: [],
    polyline: [],
    provider: null,
  });

  const routeCacheRef = useRef(new Map());
  const requestSeqRef = useRef(0);
  const lastRefreshTokenRef = useRef(routeRefreshToken);
  const routeOptionsKey = useMemo(() => JSON.stringify(routeOptions || {}), [routeOptions]);

  // Load Google Maps script on mount
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setLoadError('Google Maps API key is missing');
      return;
    }

    let cancelled = false;
    loadGoogleMapsScript()
      .then(() => {
        if (!cancelled) setIsLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize map when script loads
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || mapRef.current) return;

    let cancelled = false;

    const initializeMap = async () => {
      const resolveMapCtor = async () => {
        await waitForMapsApiReady();

        if (typeof window.google?.maps?.importLibrary === 'function') {
          const lib = await window.google.maps.importLibrary('maps');
          if (typeof lib?.Map === 'function') return lib.Map;
        }

        if (typeof window.google?.maps?.Map === 'function') {
          return window.google.maps.Map;
        }

        throw new Error('Google Maps Map constructor is unavailable');
      };

      const MapCtor = await resolveMapCtor();
      if (cancelled || !mapContainerRef.current || mapRef.current) return;

      const routeCenter = getBoundsCenter([]);
      mapRef.current = new MapCtor(mapContainerRef.current, {
        center: routeCenter,
        zoom: 5,
        mapId: 'DEMO_MAP_ID',
        ...MAP_OPTIONS,
      });

      infoWindowRef.current = new window.google.maps.InfoWindow();
    };

    initializeMap().catch((error) => {
      if (!cancelled) setLoadError(error?.message || 'Failed to initialize Google Maps');
    });

    return () => {
      cancelled = true;
    };
  }, [isLoaded]);

  // Memoized values
  const validPlaces = useMemo(() => {
    const merged = [...(routePlaces || []), ...(places || [])];
    const seen = new Set();

    return merged
      .filter((place) => toLatLng(place))
      .filter((place) => {
        const latLng = toLatLng(place);
        const key = `${normalizeName(place?.name)}|${latLng?.lat}|${latLng?.lng}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [places, routePlaces]);

  const activePlaceSet = useMemo(() => new Set((activePlaceNames || []).map((name) => normalizeName(name))), [activePlaceNames]);
  const originKey = normalizeName(originName);
  const destinationKey = normalizeName(destinationName);
  const focusedKey = normalizeName(focusPlaceName);
  const points = useMemo(() => validPlaces.map((place) => toLatLng(place)).filter(Boolean), [validPlaces]);

  const routeInputPoints = useMemo(() => {
    const preferred = (routePlaces || []).map((place) => toLatLng(place)).filter(Boolean);
    const fallback = (validPlaces || []).map((place) => toLatLng(place)).filter(Boolean);
    return dedupeConsecutivePoints(preferred.length >= 2 ? preferred : fallback);
  }, [routePlaces, validPlaces]);

  const routeInputHash = useMemo(
    () => buildRouteInputHash(routeInputPoints, routeMode, routeOptionsKey),
    [routeInputPoints, routeMode, routeOptionsKey],
  );

  // Compute route
  useEffect(() => {
    if (!showRoute || routeInputPoints.length < 2) {
      setRoutePoints((prev) => (prev.length === 0 ? prev : []));
      setRouteStats((prev) => {
        const isAlreadyEmpty = prev.distanceMeters === 0 && prev.durationSeconds === 0 && prev.polyline.length === 0 && prev.legs.length === 0;
        if (isAlreadyEmpty) return prev;

        return {
          distanceMeters: 0,
          distanceKm: 0,
          durationSeconds: 0,
          durationMinutes: 0,
          estimatedMinutes: 0,
          averageSpeedKmh: 0,
          legs: [],
          polyline: [],
          provider: null,
        };
      });
      return undefined;
    }

    const forceRefresh = routeRefreshToken !== lastRefreshTokenRef.current;
    lastRefreshTokenRef.current = routeRefreshToken;

    if (!forceRefresh) {
      const cached = routeCacheRef.current.get(routeInputHash);
      if (cached?.polyline?.length > 1) {
        const cachedMetrics = buildRouteMetrics(cached, routeMode, routeOptions);
        setRoutePoints(cachedMetrics.polyline);
        setRouteStats(cachedMetrics);
        if (typeof onRouteComputed === 'function') onRouteComputed(cachedMetrics);
        return undefined;
      }
    }

    requestSeqRef.current += 1;
    const seq = requestSeqRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const response = await computeRoute({
          waypoints: routeInputPoints.map((point) => ({ lat: point.lat, lng: point.lng })),
          mode: routeMode,
          options: routeOptions,
        });

        if (seq !== requestSeqRef.current) return;

        if (response?.success && Array.isArray(response?.route?.polyline) && response.route.polyline.length > 1) {
          routeCacheRef.current.set(routeInputHash, response.route);
          const nextStats = buildRouteMetrics(response.route, routeMode, routeOptions);
          setRoutePoints(nextStats.polyline);
          setRouteStats(nextStats);
          if (typeof onRouteComputed === 'function') onRouteComputed(nextStats);
          return;
        }

        setRoutePoints(routeInputPoints);
        setRouteStats({
          distanceMeters: 0,
          distanceKm: 0,
          durationSeconds: 0,
          durationMinutes: 0,
          estimatedMinutes: 0,
          averageSpeedKmh: 0,
          legs: [],
          polyline: routeInputPoints,
          provider: null,
        });
        if (typeof onRouteError === 'function') onRouteError(response?.error || { message: 'No route polyline' });
      } catch (error) {
        if (seq !== requestSeqRef.current) return;
        setRoutePoints(routeInputPoints);
        setRouteStats({
          distanceMeters: 0,
          distanceKm: 0,
          durationSeconds: 0,
          durationMinutes: 0,
          estimatedMinutes: 0,
          averageSpeedKmh: 0,
          legs: [],
          polyline: routeInputPoints,
          provider: null,
        });
        if (typeof onRouteError === 'function') onRouteError({ code: 'ROUTE_FETCH_FAILED', message: error?.message || 'Route request failed' });
      }
    }, Math.max(120, Number(routeDebounceMs) || 300));

    return () => window.clearTimeout(timer);
  }, [onRouteComputed, onRouteError, routeDebounceMs, routeInputHash, routeInputPoints, routeMode, routeOptionsKey, routeRefreshToken, showRoute]);

  // Update map polylines
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    polylinesRef.current.forEach((polyline) => polyline.setMap(null));
    polylinesRef.current = [];

    const routeLayerSegments = Array.isArray(routeSegments) ? routeSegments : [];
    const routeLayerPoints = routeLayerSegments.length > 0
      ? routeLayerSegments.flatMap((segment) => (Array.isArray(segment?.points) ? segment.points : [])).map((point) => normalizePathPoint(point)).filter(Boolean)
      : routePoints.map((point) => normalizePathPoint(point)).filter(Boolean);

    if (showRoute && routeLayerPoints.length > 1) {
      const polylinePoints = routeLayerPoints;

      if (polylinePoints.length > 1) {
        // Shadow polyline
        const shadowPolyline = new window.google.maps.Polyline({
          path: polylinePoints,
          geodesic: true,
          strokeColor: '#ffffff',
          strokeOpacity: 0.45,
          strokeWeight: 7,
          map: mapRef.current,
        });
        polylinesRef.current.push(shadowPolyline);

        // Main polyline
        const mainPolyline = new window.google.maps.Polyline({
          path: polylinePoints,
          geodesic: true,
          strokeColor: '#f59e0b',
          strokeOpacity: 0.95,
          strokeWeight: 4,
          map: mapRef.current,
          clickable: true,
        });

        mainPolyline.addListener('click', () => {
          if (typeof onRouteSegmentClick === 'function') {
            onRouteSegmentClick({ points: routeLayerPoints }, 0);
          }
        });

        polylinesRef.current.push(mainPolyline);
      }
    }
  }, [isLoaded, routePoints, routeSegments, showRoute, onRouteSegmentClick]);

  // Update map markers
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    // User location marker
    if (userLocation && Number.isFinite(Number(userLocation?.lat)) && Number.isFinite(Number(userLocation?.lng))) {
      const marker = new window.google.maps.Marker({
        position: { lat: Number(userLocation.lat), lng: Number(userLocation.lng) },
        map: mapRef.current,
        icon: buildMarkerIcon(0, MARKER_COLORS.current, false),
        title: 'You are here',
      });
      markersRef.current.push(marker);
    }

    // Place markers
    validPlaces.forEach((place, index) => {
      const latLng = toLatLng(place);
      if (!latLng) return;

      const placeKey = normalizeName(place?.name);
      const isOrigin = placeKey && placeKey === originKey;
      const isDestination = placeKey && placeKey === destinationKey;
      const isActive = activePlaceSet.has(placeKey);
      const isFocused = focusedKey && focusedKey === placeKey;
      const isSelected = normalizeName(selectedPlaceName) === placeKey;

      const color = isOrigin
        ? MARKER_COLORS.origin
        : isDestination
          ? MARKER_COLORS.destination
          : isActive
            ? MARKER_COLORS.active
            : MARKER_COLORS.other;

      const marker = new window.google.maps.Marker({
        position: latLng,
        map: mapRef.current,
        icon: buildMarkerIcon(index, color, isFocused),
        title: place.name || 'Place',
      });

      marker.addListener('click', () => {
        setSelectedPlaceName(place?.name || '');
        if (typeof onMarkerClick === 'function') onMarkerClick(place?.name || '');

        if (isSelected || isFocused) {
          const content = `<div class="max-w-[240px] text-sm text-slate-800">
            <strong class="block text-slate-900">${place.name || 'Place'}</strong>
            ${place.location ? `<div class="mt-1 text-xs text-slate-600">${place.location}</div>` : ''}
            ${place.best_visit_reason ? `<div class="mt-1 text-xs text-slate-600">${place.best_visit_reason}</div>` : ''}
          </div>`;
          infoWindowRef.current.setContent(content);
          infoWindowRef.current.open(mapRef.current, marker);
        }
      });

      markersRef.current.push(marker);
    });
  }, [isLoaded, validPlaces, activePlaceSet, originKey, destinationKey, focusedKey, selectedPlaceName, userLocation, onMarkerClick]);

  // Fit bounds
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;

    const routeLayerSegments = Array.isArray(routeSegments) ? routeSegments : [];
    const routeLayerPoints = routeLayerSegments.length > 0
      ? routeLayerSegments.flatMap((segment) => (Array.isArray(segment?.points) ? segment.points : [])).map((point) => normalizePathPoint(point)).filter(Boolean)
      : routePoints.map((point) => normalizePathPoint(point)).filter(Boolean);
    const fitPoints = routeLayerPoints.length > 1 ? routeLayerPoints : points.map((point) => normalizePathPoint(point)).filter(Boolean);

    if (!fitPoints.length) return;

    if (fitPoints.length === 1) {
      mapRef.current.setCenter(fitPoints[0]);
      mapRef.current.setZoom(11);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    fitPoints.forEach((point) => bounds.extend(point));
    mapRef.current.fitBounds(bounds, 28);
  }, [isLoaded, points, routePoints, routeSegments, fitSignal]);

  // Focus place
  useEffect(() => {
    if (!mapRef.current || !isLoaded || !focusPlaceName) return;

    const targetName = normalizeName(focusPlaceName);
    const target = validPlaces.find((place) => normalizeName(place?.name) === targetName);
    const latLng = toLatLng(target);
    if (!latLng) return;

    mapRef.current.panTo(latLng);
    mapRef.current.setZoom(Math.max(mapRef.current.getZoom() || 8, 13));
  }, [isLoaded, focusPlaceName, validPlaces]);

  const routeDistanceLabel = routeStats.distanceMeters > 0 ? formatDistance(routeStats.distanceMeters) : null;
  const routeTimeLabel = routeStats.estimatedMinutes > 0
    ? formatDurationLabel(routeStats.estimatedMinutes)
    : routeStats.durationMinutes > 0
      ? formatDurationLabel(routeStats.durationMinutes)
      : null;

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className={`relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70 ${className}`}>
        <div className="flex h-full min-h-[20rem] items-center justify-center px-6 text-sm text-slate-300">
          Google Maps key is missing. Set VITE_GOOGLE_MAPS_API_KEY in frontend/.env.
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70 ${className}`}>
        <div className="flex h-full min-h-[20rem] items-center justify-center px-6 text-sm text-red-200">
          Failed to load Google Maps: {loadError}
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={`relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70 ${className}`}>
        <div className="flex h-full min-h-[20rem] items-center justify-center px-6 text-sm text-slate-300">
          Loading map...
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70 ${className}`}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-14 left-3 z-50 rounded-xl border border-slate-300/40 bg-slate-950/90 px-3 py-2 text-xs text-slate-100 shadow-lg backdrop-blur-sm">
        {[
          { label: 'You are here', color: MARKER_COLORS.current },
          { label: 'Origin', color: MARKER_COLORS.origin },
          { label: 'Destination', color: MARKER_COLORS.destination },
          { label: 'Active day', color: MARKER_COLORS.active },
          { label: 'Other places', color: MARKER_COLORS.other },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 py-0.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Route stats footer */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
        <span>{routeDistanceLabel ? `Route distance: ${routeDistanceLabel}` : 'Route distance: calculating'}</span>
        <span>{routeTimeLabel ? `Avg time: ${routeTimeLabel}` : 'Avg time: calculating'}</span>
      </div>
    </div>
  );
}