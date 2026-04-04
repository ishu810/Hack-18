import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { computeRoute } from '../api';
import MapRouteLayer from './MapRouteLayer';
import { buildRouteMetrics, formatDistance } from '../utils/routeMath';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MARKER_COLORS = {
  current: '#0ea5e9',
  origin: '#3b82f6',
  destination: '#ef4444',
  active: '#f59e0b',
  other: '#22c55e',
};

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
  return [lat, lng];
}

function dedupeConsecutivePoints(points = []) {
  const deduped = [];
  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev[0] === point[0] && prev[1] === point[1]) continue;
    deduped.push(point);
  }
  return deduped;
}

function buildRouteInputHash(points = [], mode = 'drive', options = {}) {
  const coords = points.map((point) => `${Number(point[0]).toFixed(6)},${Number(point[1]).toFixed(6)}`).join('|');
  return `${mode}|${JSON.stringify(options || {})}|${coords}`;
}

function getBoundsCenter(points) {
  if (!points.length) return [20.5937, 78.9629];
  const lat = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const lng = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return [lat, lng];
}

function MapAutoFit({ points, fitSignal }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 11);
      return;
    }

    const bounds = L.latLngBounds(points.map((point) => L.latLng(point[0], point[1])));
    map.fitBounds(bounds, { padding: [26, 26] });
  }, [fitSignal, map, points]);

  return null;
}

function MapSizeFix() {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [map]);

  return null;
}

function FocusPlace({ focusPlaceName, places }) {
  const map = useMap();

  useEffect(() => {
    const targetName = normalizeName(focusPlaceName);
    if (!targetName) return;

    const target = (places || []).find((place) => normalizeName(place?.name) === targetName);
    const latLng = toLatLng(target);
    if (!latLng) return;

    map.flyTo(latLng, Math.max(map.getZoom(), 13), { duration: 0.7 });
  }, [focusPlaceName, map, places]);

  return null;
}

function buildNumberedIcon(index, color, isFocused = false) {
  const pinSize = isFocused ? 40 : 34;

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative; width:${pinSize}px; height:${pinSize}px;">
        ${isFocused ? `<div style="
          position:absolute; inset:-6px;
          border-radius:999px;
          border:2px solid ${color};
          opacity:0.55;
        "></div>` : ''}
        <div style="
          position:absolute; inset:0;
          border-radius:50% 50% 50% 0;
          background:${color};
          border:3px solid #fff;
          transform:rotate(-45deg);
          box-shadow:0 4px 14px rgba(15,23,42,0.35);
        "></div>
        <div style="
          position:absolute; inset:0;
          display:flex; align-items:center; justify-content:center;
          font-size:12px; font-weight:800; color:#7c2d12;
          transform:translateY(-1px);
        ">${index + 1}</div>
      </div>
    `,
    iconSize: [pinSize, pinSize],
    iconAnchor: [pinSize / 2, pinSize],
    popupAnchor: [0, -pinSize + 2],
  });
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
    <div className="pointer-events-none absolute bottom-3 left-3 z-50 rounded-xl border border-slate-300/40 bg-white/90 px-3 py-2 text-xs text-slate-800 shadow-lg">
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
  routeOptions = {},
  routeRefreshToken = 0,
  routeDebounceMs = 300,
  fitSignal = 'initial',
  onRouteError = null,
  onRouteComputed = null,
}) {
  const validPlaces = useMemo(() => {
    const merged = [...(routePlaces || []), ...(places || [])];
    const seen = new Set();

    return merged
      .filter((place) => toLatLng(place))
      .filter((place) => {
        const latLng = toLatLng(place);
        const key = `${normalizeName(place?.name)}|${latLng?.[0]}|${latLng?.[1]}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [places, routePlaces]);

  const activePlaceSet = useMemo(() => new Set((activePlaceNames || []).map((name) => normalizeName(name))), [activePlaceNames]);
  const originKey = normalizeName(originName);
  const destinationKey = normalizeName(destinationName);
  const focusedKey = normalizeName(focusPlaceName);

  const points = useMemo(() => validPlaces.map((place) => toLatLng(place)), [validPlaces]);

  const routeInputPoints = useMemo(() => {
    const preferred = (routePlaces || []).map((place) => toLatLng(place)).filter(Boolean);
    const fallback = (validPlaces || []).map((place) => toLatLng(place)).filter(Boolean);
    const source = preferred.length >= 2 ? preferred : fallback;

    return dedupeConsecutivePoints(source);
  }, [routePlaces, validPlaces]);

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
  const routeInputHash = useMemo(
    () => buildRouteInputHash(routeInputPoints, routeMode, routeOptions),
    [routeInputPoints, routeMode, routeOptions],
  );

  useEffect(() => {
    if (!showRoute || routeInputPoints.length < 2) {
      setRoutePoints([]);
      setRouteStats({
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
        if (typeof onRouteComputed === 'function') {
          onRouteComputed(cachedMetrics);
        }
        return undefined;
      }
    }

    requestSeqRef.current += 1;
    const seq = requestSeqRef.current;

    const timer = window.setTimeout(async () => {
      try {
        const payload = {
          waypoints: routeInputPoints.map((point) => ({ lat: point[0], lng: point[1] })),
          mode: routeMode,
          options: routeOptions,
        };

        const response = await computeRoute(payload);
        if (seq !== requestSeqRef.current) return;

        if (response?.success && Array.isArray(response?.route?.polyline) && response.route.polyline.length > 1) {
          routeCacheRef.current.set(routeInputHash, response.route);
          const nextStats = buildRouteMetrics(response.route, routeMode, routeOptions);
          setRoutePoints(nextStats.polyline);
          setRouteStats(nextStats);
          if (typeof onRouteComputed === 'function') {
            onRouteComputed(nextStats);
          }
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

        if (typeof onRouteError === 'function') {
          onRouteError(response?.error || { message: 'Routing service returned no route polyline.' });
        }
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

        if (typeof onRouteError === 'function') {
          onRouteError({
            code: 'ROUTE_FETCH_FAILED',
            message: error?.message || 'Route request failed.',
          });
        }
      }
    }, Math.max(120, Number(routeDebounceMs) || 300));

    return () => {
      window.clearTimeout(timer);
    };
  }, [onRouteComputed, onRouteError, routeDebounceMs, routeInputHash, routeInputPoints, routeMode, routeOptions, routeRefreshToken, showRoute]);

  const routeLayerSegments = useMemo(() => (Array.isArray(routeSegments) ? routeSegments : []), [routeSegments]);

  const routeLayerPoints = useMemo(() => {
    if (routeLayerSegments.length > 0) {
      return routeLayerSegments.flatMap((segment) => (Array.isArray(segment?.points) ? segment.points : [])).filter(Boolean);
    }

    return routePoints;
  }, [routeLayerSegments, routePoints]);

  const fitPoints = routeLayerPoints.length > 1 ? routeLayerPoints : points;
  const routeDistanceLabel = routeStats.distanceMeters > 0 ? formatDistance(routeStats.distanceMeters) : null;
  const routeTimeLabel = routeStats.estimatedMinutes > 0
    ? formatDurationLabel(routeStats.estimatedMinutes)
    : routeStats.durationMinutes > 0
      ? formatDurationLabel(routeStats.durationMinutes)
      : null;

  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70 ${className}`}>
      <MapContainer center={getBoundsCenter(points)} zoom={points.length ? 8 : 5} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='© OpenStreetMap © CARTO'
          maxZoom={20}
        />
        <MapSizeFix />
        <MapAutoFit points={fitPoints} fitSignal={fitSignal} />
        <FocusPlace focusPlaceName={focusPlaceName} places={validPlaces} />

        {showRoute ? (
          <MapRouteLayer
            points={routePoints}
            segments={routeLayerSegments}
            selectedSegmentIndex={selectedRouteSegmentIndex}
            onSegmentClick={onRouteSegmentClick}
          />
        ) : null}

        {userLocation && Number.isFinite(Number(userLocation?.lat)) && Number.isFinite(Number(userLocation?.lng)) ? (
          <Marker
            position={[Number(userLocation.lat), Number(userLocation.lng)]}
            icon={buildNumberedIcon(0, MARKER_COLORS.current, false)}
          >
            <Popup>
              <div>
                <strong>You are here</strong>
              </div>
            </Popup>
          </Marker>
        ) : null}

        {validPlaces.map((place, index) => {
          const latLng = toLatLng(place);
          if (!latLng) return null;

          const placeKey = normalizeName(place?.name);
          const isOrigin = placeKey && placeKey === originKey;
          const isDestination = placeKey && placeKey === destinationKey;
          const isActive = activePlaceSet.has(placeKey);
          const isFocused = focusedKey && focusedKey === placeKey;

          const color = isOrigin
            ? MARKER_COLORS.origin
            : isDestination
              ? MARKER_COLORS.destination
              : isActive
                ? MARKER_COLORS.active
                : MARKER_COLORS.other;

          return (
            <Marker
              key={`${place.name || 'place'}-${index}`}
              position={latLng}
              icon={buildNumberedIcon(index, color, isFocused)}
              eventHandlers={{
                mouseover: (event) => {
                  event.target.openTooltip();
                },
                mouseout: (event) => {
                  event.target.closeTooltip();
                },
                click: () => {
                  if (typeof onMarkerClick === 'function') {
                    onMarkerClick(place?.name || '');
                  }
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -30]} opacity={0.95}>
                {place.name || 'Place'}
              </Tooltip>
              <Popup>
                <div>
                  <strong>{place.name || 'Place'}</strong>
                  {place.location ? <div>{place.location}</div> : null}
                  {place.best_visit_reason ? <div>{place.best_visit_reason}</div> : null}
                </div>
              </Popup>
            </Marker>
          );
        })}

        <LegendCard />
      </MapContainer>

      <div className="flex items-center justify-between gap-3 border-t border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-300">
        <span>{routeDistanceLabel ? `Route distance: ${routeDistanceLabel}` : 'Route distance: calculating'}</span>
        <span>{routeTimeLabel ? `Avg time: ${routeTimeLabel}` : 'Avg time: calculating'}</span>
      </div>
    </div>
  );
}
