<<<<<<< HEAD
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CloudSun, Navigation } from 'lucide-react';
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createTrip, generateItinerary, generatePlaces, selectPlaces } from '../api';

=======
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plane, Hotel, Navigation, ChevronDown, ChevronUp, X, ExternalLink, AlertCircle, CloudSun } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default leaflet marker icons
>>>>>>> main
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

<<<<<<< HEAD
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
=======
const TravelAlerts = () => {
  const [openLeg, setOpenLeg] = useState(1);
  const [selectedCity, setSelectedCity] = useState(null);

  const itinerary = [
    { day: 1, date: 'Apr 03', location: 'Paris', status: 'completed' },
    { day: 2, date: 'Apr 04', location: 'Helsinki', status: 'current' },
    { day: 5, date: 'Apr 07', location: 'Tokyo', status: 'upcoming' },
  ];

  const bookingCards = [
    { 
      id: 1, 
      title: 'Departure', 
      location: 'Paris (CDG)',
      cityName: 'Paris',
      coords: [48.8566, 2.3522],
      route: 'Paris (CDG) → Helsinki (HEL)', 
      date: 'May 04',
      image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=400&q=80',
      desc: 'The capital of France, famous for its art, fashion, and the Eiffel Tower.'
    },
    { 
      id: 2, 
      title: 'Layover', 
      location: 'Helsinki (HEL)',
      cityName: 'Helsinki',
      coords: [60.1699, 24.9384],
      route: 'Helsinki (HEL) → Tokyo (HND)', 
      date: 'May 05',
      image: 'https://images.unsplash.com/photo-1517154421773-0529f29ea451?auto=format&fit=crop&w=400&q=80',
      desc: 'The seaside capital of Finland, known for design and Nordic architecture.'
    },
    { 
      id: 3, 
      title: 'Arrival', 
      location: 'Tokyo (HND)',
      cityName: 'Tokyo',
      coords: [35.6762, 139.6503],
      route: 'Tokyo (HND) → Seoul (ICN)', 
      date: 'May 08',
      image: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=400&q=80',
      desc: 'Japans busy capital, mixing ultramodern skyscrapers with historic temples.'
    },
  ];

  const routePath = bookingCards.map(card => card.coords);

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-slate-300 p-6 font-sans flex flex-col gap-6 relative overflow-hidden">
      
      {/* SIDE PANEL */}
      <div className={`fixed top-0 right-0 h-full w-full md:w-96 bg-[#111827] border-l border-slate-800 z-2000 transform transition-transform duration-500 ease-in-out shadow-2xl ${selectedCity ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedCity && (
          <div className="p-6 flex flex-col h-full">
            <button onClick={() => setSelectedCity(null)} className="self-end p-2 hover:bg-slate-800 rounded-full mb-4">
              <X size={24} />
            </button>
            <img src={selectedCity.image} alt={selectedCity.cityName} className="w-full h-48 object-cover rounded-xl mb-6 border border-slate-700" />
            <h2 className="text-2xl font-bold text-white mb-2">{selectedCity.cityName}</h2>
            <p className="text-blue-400 text-sm font-mono mb-4">{selectedCity.route}</p>
            <div className="space-y-4">
              <p className="text-slate-400 leading-relaxed">{selectedCity.desc}</p>
              <button className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold transition-all mt-auto">
                <ExternalLink size={16} /> View Full Guide
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TOP BAR */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold tracking-widest text-white uppercase">Travel Ops Dashboard</h1>
        <div className="flex gap-4">
          <div className="bg-[#111827] border border-slate-800 p-3 px-6 rounded-lg min-w-40">
             <span className="text-[10px] text-slate-500 uppercase font-bold">Total Distance</span>
             <p className="text-2xl font-bold text-white">12,540 <span className="text-xs text-slate-500">KM</span></p>
          </div>
          <div className="bg-[#111827] border border-slate-800 p-3 px-6 rounded-lg min-w-40">
             <span className="text-[10px] text-slate-500 uppercase font-bold">Status</span>
             <p className="text-xl font-bold text-emerald-400 flex items-center gap-2">● ACTIVE</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 grow overflow-hidden">
        
        {/* LEFT: LEAFLET MAP (SEA BLUE COLOR) */}
        <div className="col-span-12 lg:col-span-3 bg-[#0f172a] rounded-xl border border-slate-800 overflow-hidden relative">
          <MapContainer 
            center={[45, 70]} 
            zoom={2} 
            scrollWheelZoom={true}
            className="h-full w-full z-10 custom-sea-blue-filter"
>>>>>>> main
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
<<<<<<< HEAD
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
=======
            <Polyline 
              positions={routePath} 
              pathOptions={{ color: '#0ea5e9', weight: 3, dashArray: '5, 10' }} 
            />
            {bookingCards.map((card) => (
              <Marker 
                key={card.id} 
                position={card.coords}
                eventHandlers={{ click: () => setSelectedCity(card) }}
              />
            ))}
          </MapContainer>
          <div className="absolute bottom-4 left-4 z-20 bg-black/60 backdrop-blur-md p-2 px-4 rounded border border-white/10 text-[9px] font-mono text-cyan-400">
            Sector_Sea_View
          </div>
        </div>

        {/* MIDDLE: BOOKING SECTION */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-4">
          <div className="bg-[#0f172a] p-5 rounded-xl border border-slate-800 overflow-hidden flex flex-col h-full">
            <h2 className="text-[11px] font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Navigation size={14} /> Mission Itinerary / Route Legs
            </h2>
            <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar">
              {bookingCards.map((card) => (
                <div key={card.id} className="border border-slate-800 rounded-xl overflow-hidden bg-[#111827]">
                  <button onClick={() => setOpenLeg(openLeg === card.id ? null : card.id)} className="w-full flex justify-between items-center p-4 hover:bg-slate-800/50 transition-colors">
                    <div className="text-left">
                      <span className="text-[9px] text-blue-500 font-bold uppercase">{card.title}</span>
                      <h3 className="text-lg font-bold text-white">{card.location}</h3>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-slate-400">{card.date}</span>
                      {openLeg === card.id ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                    </div>
                  </button>
                  {openLeg === card.id && (
                    <div className="p-4 pt-0 border-t border-slate-800">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div className="h-32 rounded-lg overflow-hidden border border-slate-700">
                          <img src={card.image} alt={card.location} className="w-full h-full object-cover saturate-50" />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Link
                            to="/weather-dashboard"
                            className="bg-cyan-600 hover:bg-cyan-500 py-2 rounded text-[10px] font-bold uppercase transition-all text-center"
                          >
                            <CloudSun size={14} className="inline mr-2" /> Forecast
                          </Link>
                          <button className="bg-slate-800 hover:bg-blue-600 py-2 rounded text-[10px] font-bold uppercase transition-all"><Plane size={14} className="inline mr-2"/> Flight</button>
                          <button className="bg-slate-800 hover:bg-blue-600 py-2 rounded text-[10px] font-bold uppercase transition-all"><Hotel size={14} className="inline mr-2"/> Hotel</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: ADVISORY & TIMELINE */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-4">
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
            <h2 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <AlertCircle size={14} /> Advisory
            </h2>
            <p className="text-[11px] text-slate-400 italic leading-relaxed">
              [SYS] High traffic at Paris (CDG). Standard security wait times increased by 20m.
            </p>
          </div>

          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 grow">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Mission Timeline</h2>
            <div className="relative border-l border-slate-800 ml-2 space-y-8">
              {itinerary.map((item, i) => (
                <div key={i} className="relative pl-6">
                  <div className={`absolute -left-1.25 w-2 h-2 rounded-full ${item.status === 'current' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-blue-500'}`}></div>
                  <p className="text-[10px] text-slate-500 leading-none">{item.date}</p>
                  <p className="text-sm font-bold text-white">{item.location}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        
        /* Updated for Sea Blue (Cyan) effect */
        .custom-sea-blue-filter { 
          filter: hue-rotate(170deg) saturate(1.8) brightness(0.9) contrast(1.1) !important;
        }
        
        .leaflet-container { background: #070a0d !important; }
      `}</style>
>>>>>>> main
    </div>
  );
};

export default TravelAlerts;