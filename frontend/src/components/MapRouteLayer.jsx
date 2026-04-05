import { Fragment, memo } from 'react';
import { Polyline } from 'react-leaflet';

function MapRouteLayer({ points = [], segments = [], selectedSegmentIndex = null, onSegmentClick = null, onRouteClick = null }) {
  const hasSegments = Array.isArray(segments) && segments.length > 0;
  const routePoints = hasSegments ? [] : points;
  const routeSegments = hasSegments ? segments : [];

  if (!hasSegments && (!Array.isArray(routePoints) || routePoints.length < 2)) return null;

  const handleClick = (segment, index) => {
    if (typeof onSegmentClick === 'function') {
      onSegmentClick(segment, index);
      return;
    }

    if (typeof onRouteClick === 'function') {
      onRouteClick(segment, index);
    }
  };

  return (
    <>
      {routeSegments.map((segment, index) => {
        const positions = Array.isArray(segment?.points) ? segment.points : [];
        if (positions.length < 2) return null;

        const isSelected = selectedSegmentIndex === index;

        return (
          <Fragment key={`segment-${segment?.fromName || 'from'}-${segment?.toName || 'to'}-${index}`}>
            <Polyline
              positions={positions}
              pathOptions={{
                color: '#ffffff',
                weight: isSelected ? 9 : 7,
                opacity: 0.45,
                lineCap: 'round',
                lineJoin: 'round',
                interactive: false,
              }}
            />
            <Polyline
              positions={positions}
              pathOptions={{
                color: isSelected ? '#f59e0b' : '#38bdf8',
                weight: isSelected ? 5 : 4,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
              eventHandlers={{
                click: () => handleClick(segment, index),
              }}
            />
          </Fragment>
        );
      })}

      {!hasSegments ? (
        <>
          <Polyline positions={routePoints} pathOptions={{ color: '#ffffff', weight: 7, opacity: 0.65, interactive: false }} />
          <Polyline
            positions={routePoints}
            pathOptions={{ color: '#f59e0b', weight: 4, opacity: 0.95 }}
            eventHandlers={{
              click: () => handleClick({ points: routePoints }, 0),
            }}
          />
        </>
      ) : null}
    </>
  );
}

export default memo(MapRouteLayer);
