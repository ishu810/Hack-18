import { memo } from 'react';
import { Polyline } from 'react-leaflet';

function MapRouteLayer({ points = [] }) {
  if (!Array.isArray(points) || points.length < 2) return null;

  return (
    <>
      <Polyline positions={points} pathOptions={{ color: '#ffffff', weight: 7, opacity: 0.65 }} />
      <Polyline positions={points} pathOptions={{ color: '#f59e0b', weight: 4, opacity: 0.95 }} />
    </>
  );
}

export default memo(MapRouteLayer);
