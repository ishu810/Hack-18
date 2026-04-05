import React, { useState } from 'react';
import { Plane, Hotel, Navigation, ChevronDown, ChevronUp, X, ExternalLink, AlertCircle, CloudSun } from 'lucide-react';
import PlacesMap from '../components/GooglePlacesMap';

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
      <div className={`fixed top-0 right-0 h-full w-full md:w-96 bg-[#111827] border-l border-slate-800 z-[2000] transform transition-transform duration-500 ease-in-out shadow-2xl ${selectedCity ? 'translate-x-0' : 'translate-x-full'}`}>
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
          <div className="bg-[#111827] border border-slate-800 p-3 px-6 rounded-lg min-w-[160px]">
             <span className="text-[10px] text-slate-500 uppercase font-bold">Total Distance</span>
             <p className="text-2xl font-bold text-white">12,540 <span className="text-xs text-slate-500">KM</span></p>
          </div>
          <div className="bg-[#111827] border border-slate-800 p-3 px-6 rounded-lg min-w-[160px]">
             <span className="text-[10px] text-slate-500 uppercase font-bold">Status</span>
             <p className="text-xl font-bold text-emerald-400 flex items-center gap-2">● ACTIVE</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 flex-grow overflow-hidden">
        
        {/* LEFT: GOOGLE MAP (SEA BLUE COLOR) */}
        <div className="col-span-12 lg:col-span-3 bg-[#0f172a] rounded-xl border border-slate-800 overflow-hidden relative">
          <PlacesMap
            places={bookingCards.map((card) => ({ name: card.cityName, lat: card.coords[0], lng: card.coords[1] }))}
            routePlaces={bookingCards.map((card) => ({ name: card.cityName, lat: card.coords[0], lng: card.coords[1] }))}
            className="h-full min-h-[28rem]"
            showRoute
            onMarkerClick={(name) => setSelectedCity(bookingCards.find((card) => card.cityName === name) || null)}
          />
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

          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex-grow">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Mission Timeline</h2>
            <div className="relative border-l border-slate-800 ml-2 space-y-8">
              {itinerary.map((item, i) => (
                <div key={i} className="relative pl-6">
                  <div className={`absolute -left-[5px] w-2 h-2 rounded-full ${item.status === 'current' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-blue-500'}`}></div>
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
      `}</style>
    </div>
  );
};

export default TravelAlerts;