import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY || import.meta.env.VITE_GEOAPIFY_KEY;

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

function getBoundsCenter(points) {
  if (!points.length) return [20.5937, 78.9629];
  const lat = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const lng = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return [lat, lng];
}

function MapAutoFit({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 11);
      return;
    }

    const bounds = L.latLngBounds(points.map((point) => L.latLng(point[0], point[1])));
    map.fitBounds(bounds, { padding: [26, 26] });
  }, [map, points]);

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
    <div className="pointer-events-none absolute bottom-3 left-3 z-500 rounded-xl border border-slate-300/40 bg-white/90 px-3 py-2 text-xs text-slate-800 shadow-lg">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 py-0.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

async function fetchRoute(points) {
  if (!GEOAPIFY_KEY || points.length < 2) return null;

  const waypoints = points.map((point) => `${point[0]},${point[1]}`).join('|');
  const response = await fetch(`https://api.geoapify.com/v1/routing?waypoints=${waypoints}&mode=drive&apiKey=${GEOAPIFY_KEY}`);
  if (!response.ok) return null;

  const data = await response.json();
  const geometry = data?.features?.[0]?.geometry;
  if (!geometry) return null;

  if (geometry.type === 'LineString') {
    return geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  }

  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.flat().map(([lon, lat]) => [lat, lon]);
  }

  return null;
}

export default function PlacesMap({
  places = [],
  routePlaces = [],
  className = 'h-96',
  showRoute = true,
  originName = '',
  destinationName = '',
  activePlaceNames = [],
  focusPlaceName = '',
  onMarkerClick = null,
  userLocation = null,
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

  const points = useMemo(
    () => validPlaces.map((place) => toLatLng(place)),
    [validPlaces],
  );

  const routeInputPoints = useMemo(() => {
    const source = (routePlaces && routePlaces.length ? routePlaces : validPlaces)
      .map((place) => toLatLng(place))
      .filter(Boolean);

    return source;
  }, [routePlaces, validPlaces]);

  const [routePoints, setRoutePoints] = useState([]);

  useEffect(() => {
    let mounted = true;

    const loadRoute = async () => {
      if (!showRoute || routeInputPoints.length < 2) {
        setRoutePoints([]);
        return;
      }

      const path = await fetchRoute(routeInputPoints);
      if (!mounted) return;

      if (Array.isArray(path) && path.length > 1) {
        setRoutePoints(path);
      } else {
        setRoutePoints(routeInputPoints);
      }
    };

    loadRoute();

    return () => {
      mounted = false;
    };
  }, [routeInputPoints, showRoute]);

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70 ${className}`}>
      <MapContainer center={getBoundsCenter(points)} zoom={points.length ? 8 : 5} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='© OpenStreetMap © CARTO'
          maxZoom={20}
        />
        <MapSizeFix />
        <MapAutoFit points={points} />
        <FocusPlace focusPlaceName={focusPlaceName} places={validPlaces} />

        {routePoints.length > 1 && (
          <>
            <Polyline positions={routePoints} pathOptions={{ color: '#ffffff', weight: 7, opacity: 0.65 }} />
            <Polyline positions={routePoints} pathOptions={{ color: '#f59e0b', weight: 4, opacity: 0.95 }} />
          </>
        )}

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
      </MapContainer>

      <LegendCard />
    </div>
  );
}
