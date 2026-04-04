import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CloudSun, Navigation } from 'lucide-react';
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createTrip, generateItinerary, generatePlaces, selectPlaces } from '../api';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const normalizeName = (value) => {
  const text = typeof value === 'string' ? value : value?.name || '';
  return text.split(',')[0].trim() || text.trim();
};

const deriveRouteStops = (journey) => {
  if (!journey) return [];

  const originName = normalizeName(journey.origin);
  const destinationName = normalizeName(journey.destination);

  const fromRoute = Array.isArray(journey.route)
    ? journey.route
        .map((point) => normalizeName(point))
        .filter(Boolean)
        .filter((name) => name !== originName && name !== destinationName)
    : [];

  const fromStops = Array.isArray(journey.stops)
    ? journey.stops
        .map((point) => normalizeName(point))
        .filter(Boolean)
        .filter((name) => name !== originName && name !== destinationName)
    : [];

  const combined = fromRoute.length ? fromRoute : fromStops;
  return [...new Set(combined)];
};

const TravelAlerts = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const journey = location.state?.journey;

  const [tripId, setTripId] = useState('');
  const [places, setPlaces] = useState([]);
  const [selectedMap, setSelectedMap] = useState({});
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const routePath = useMemo(() => {
    if (!journey?.route || !Array.isArray(journey.route)) return [];
    return journey.route
      .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
      .map((p) => [p.lat, p.lng]);
  }, [journey]);

  useEffect(() => {
    const init = async () => {
      if (!journey) {
        setError('No mission data found. Please build route from Agent Home first.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const payload = {
          origin: normalizeName(journey.origin),
          destination: normalizeName(journey.destination),
          stops: deriveRouteStops(journey),
          budget: Array.isArray(journey.budgetRange) ? Number(journey.budgetRange[1] || 0) : Number(journey.budgetRange || 0),
          dates: [journey.departureDate, journey.comingDate].filter(Boolean),
        };

        const created = await createTrip(payload);
        const createdTripId = created?.trip?._id;
        if (!createdTripId) throw new Error('Trip creation failed: missing trip ID');

        setTripId(createdTripId);

        const placeResp = await generatePlaces(createdTripId);
        const candidatePlaces = placeResp?.places || [];
        setPlaces(candidatePlaces);

        const allSelected = {};
        candidatePlaces.forEach((p) => {
          if (p?.name) allSelected[p.name] = true;
        });
        setSelectedMap(allSelected);
      } catch (err) {
        setError(err.message || 'Unable to initialize travel mission');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [journey]);

  const togglePlace = (name) => {
    setSelectedMap((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleGenerateItinerary = async () => {
    if (!tripId) return;
    const selectedPlaces = places
      .filter((p) => selectedMap[p.name])
      .map((p) => ({
        name: p.name,
        type: p.type,
        location: p.location,
        best_visit_reason: p.best_visit_reason,
        imageUrl: p.imageUrl,
      }));

    if (!selectedPlaces.length) {
      setError('Please select at least one place to generate itinerary.');
      return;
    }

    try {
      setBusy(true);
      setError('');
      await selectPlaces(tripId, selectedPlaces);
      const itineraryResp = await generateItinerary(tripId);
      setItinerary(itineraryResp?.itinerary || null);
    } catch (err) {
      setError(err.message || 'Failed to generate itinerary');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-[#0b0f1a] text-slate-200">Initializing mission...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-slate-300 p-6 font-sans flex flex-col gap-6 relative overflow-hidden">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-widest text-white uppercase">Travel Ops Dashboard</h1>
        <div className="flex gap-3">
          <Link to="/weather-dashboard" className="bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded text-xs font-bold uppercase flex items-center gap-2">
            <CloudSun size={14} /> Forecast
          </Link>
          <button
            type="button"
            onClick={() => navigate('/agent-home')}
            className="rounded border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
          >
            Back
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/40 rounded p-3 text-red-200 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}

      <div className="grid grid-cols-12 gap-6 grow overflow-hidden">
        <div className="col-span-12 lg:col-span-3 bg-[#0f172a] rounded-xl border border-slate-800 overflow-hidden relative min-h-[480px]">
          <MapContainer
            center={routePath[0] || [23.5937, 80.9629]}
            zoom={routePath.length ? 5 : 4}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            {routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: '#0ea5e9', weight: 3 }} /> : null}
            {routePath.map((coords, idx) => <Marker key={`${coords[0]}-${coords[1]}-${idx}`} position={coords} />)}
          </MapContainer>
        </div>

        <div className="col-span-12 lg:col-span-5 bg-[#0f172a] p-5 rounded-xl border border-slate-800 overflow-y-auto max-h-[76vh]">
          <h2 className="text-[11px] font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Navigation size={14} /> Candidate Places
          </h2>

          <div className="space-y-3">
            {places.map((place) => (
              <label key={place.name} className="block border border-slate-800 rounded-lg p-3 bg-slate-900/60">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!!selectedMap[place.name]}
                    onChange={() => togglePlace(place.name)}
                  />
                  <div className="flex-1">
                    <p className="text-white font-semibold">{place.name}</p>
                    <p className="text-xs text-slate-400">{place.location} • {place.type}</p>
                    <p className="text-xs text-slate-300 mt-1">{place.best_visit_reason}</p>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={handleGenerateItinerary}
            disabled={busy || !places.length}
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold"
          >
            {busy ? 'Generating Itinerary...' : 'Generate Itinerary'}
          </button>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-slate-900 p-5 rounded-xl border border-slate-800 overflow-y-auto max-h-[76vh]">
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Mission Timeline</h2>

          {!itinerary?.itinerary?.length ? (
            <p className="text-sm text-slate-400">Generate itinerary to view day-wise mission plan.</p>
          ) : (
            <div className="space-y-4">
              {itinerary.itinerary.map((day) => (
                <div key={day.day} className="border border-slate-800 rounded-lg p-3 bg-slate-950/60">
                  <p className="text-white font-semibold">Day {day.day}: {day.city}</p>
                  {day.travel?.from ? (
                    <p className="text-xs text-amber-300 mt-1">Travel: {day.travel.from} → {day.travel.to} ({day.travel.duration})</p>
                  ) : null}
                  <ul className="mt-2 space-y-1 text-xs text-slate-300 list-disc pl-4">
                    {(day.activities || []).map((a, idx) => (
                      <li key={`${day.day}-${idx}`}>{a.time} - {a.title}</li>
                    ))}
                  </ul>
                  {day.summary ? <p className="text-xs text-slate-400 mt-2">{day.summary}</p> : null}
                </div>
              ))}
              <div className="text-sm font-semibold text-emerald-300">Estimated Cost: ₹{itinerary.total_estimated_cost || 0}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TravelAlerts;