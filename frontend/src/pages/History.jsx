import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Calendar, 
  Wallet, 
  MapPin, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  Utensils, 
  Clock, 
  Star,
  Info
} from 'lucide-react';
import { getTravelHistory } from '../api';

const History = () => {
  const { id } = useParams();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const fetchUserHistory = async () => {
      try {
        const response = await getTravelHistory(id);
        if (response.success) {
          setTrips(response.data);
          if (response.data.length > 0) {
            setExpandedId(response.data[0]._id);
          }
        }
      } catch (error) {
        console.error("Error fetching history:", error);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchUserHistory();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-blue-400">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      <span className="ml-4 text-xl font-mono">RETRIEVING MISSION LOGS...</span>
    </div>
  );

  if (!trips || trips.length === 0) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-400">
      <MapPin size={48} className="mb-4 opacity-20" />
      <p className="text-xl font-mono">No field reports found for this operative.</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 bg-slate-950 min-h-screen text-slate-200">
      <header className="mb-10 border-l-4 border-blue-500 pl-6">
        <h1 className="text-4xl font-black text-white tracking-tighter uppercase">Operation History</h1>
        <p className="text-slate-500 font-mono text-sm">Reviewing {trips.length} archived excursions</p>
      </header>

      <div className="space-y-6">
        {trips.map((trip) => {
          const isExpanded = expandedId === trip._id;
          // Destructuring based on your Mongoose Schema
          const { 
            itinerary, 
            origin, 
            destination, 
            budget, 
            dates, 
            status, 
            selectedPlaces
          } = trip;

          return (
            <div key={trip._id} className={`bg-slate-900 rounded-2xl border transition-all duration-500 ${
              isExpanded ? 'border-blue-500/50 shadow-2xl shadow-blue-500/10' : 'border-slate-800 hover:border-slate-700'
            }`}>
              
              {/* HEADER CARD */}
              <div 
                onClick={() => setExpandedId(isExpanded ? null : trip._id)}
                className="p-6 cursor-pointer flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-center gap-6">
                  <div className={`p-4 rounded-xl transition-colors ${isExpanded ? 'bg-blue-500 text-white' : 'bg-slate-800 text-blue-400'}`}>
                    <MapPin size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">{origin} <span className="text-blue-500">→</span> {destination}</h2>
                    <div className="flex gap-4 mt-2 text-sm font-mono text-slate-400">
                      <span className="flex items-center gap-1.5"><Calendar size={14} className="text-blue-500"/> {dates[0]}</span>
                      <span className="flex items-center gap-1.5"><Wallet size={14} className="text-green-500"/> ₹{budget.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right hidden md:block">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Mission Status</p>
                    <span className={`text-xs font-bold uppercase tracking-tighter px-3 py-1 rounded-md border ${
                      status === 'itinerary_generated' ? 'border-green-500/50 text-green-400 bg-green-500/5' : 'border-blue-500/50 text-blue-400 bg-blue-500/5'
                    }`}>
                      {status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {isExpanded ? <ChevronDown size={24} className="text-blue-500"/> : <ChevronRight size={24} className="text-slate-600"/>}
                </div>
              </div>

              {/* EXPANDED CONTENT */}
              {isExpanded && (
                <div className="px-6 pb-8 pt-2 border-t border-slate-800/50 animate-in fade-in zoom-in-95 duration-300">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
                    
                    {/* LEFT COLUMN: ITINERARY */}
                    <div className="lg:col-span-2 space-y-8">
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-blue-500 mb-6 flex items-center gap-2">
                          <Clock size={16} /> Chronological Timeline
                        </h3>
                        
                        <div className="space-y-6">
                          {itinerary?.itinerary?.map((dayPlan, index) => (
                            <div key={index} className="relative pl-8 border-l border-slate-800 ml-4">
                              {/* Timeline Dot */}
                              <div className="absolute -left-[9px] top-0 w-4 h-4 bg-slate-900 border-2 border-blue-500 rounded-full z-10"></div>
                              
                              <div className="bg-slate-800/50 rounded-xl overflow-hidden border border-slate-700/30">
                                <div className="bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700/50">
                                  <h4 className="font-bold text-white uppercase tracking-tight">Day {dayPlan.day}: {dayPlan.city}</h4>
                                  <span className="text-[10px] font-mono px-2 py-1 bg-blue-500/10 text-blue-400 rounded uppercase">{dayPlan.theme}</span>
                                </div>
                                
                                <div className="p-5 space-y-6">
                                  {dayPlan.activities?.map((act, i) => (
                                    <div key={i} className="group">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-black text-blue-500 font-mono">{act.time}</span>
                                        <div className="h-[1px] flex-grow bg-slate-800 group-hover:bg-blue-500/30 transition-colors"></div>
                                      </div>
                                      <h5 className="font-bold text-slate-100 mb-1">{act.title}</h5>
                                      <p className="text-sm text-slate-400 leading-relaxed">{act.description}</p>
                                    </div>
                                  ))}
                                  
                                  {dayPlan.dining_places?.length > 0 && (
                                    <div className="mt-4 p-4 bg-orange-500/5 rounded-lg border border-orange-500/10">
                                      <h5 className="text-[10px] font-black text-orange-400 uppercase mb-3 flex items-center gap-2">
                                        <Utensils size={12} /> Culinary Intel
                                      </h5>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {dayPlan.dining_places.map((place, i) => (
                                          <div key={i} className="text-xs">
                                            <span className="text-slate-200 font-bold block">{place.name}</span>
                                            <span className="text-slate-500">{place.cuisine}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: SIDEBAR DATA */}
                    <div className="space-y-6">
                      {/* Cost Summary */}
                      <div className="bg-blue-500/5 p-5 rounded-2xl border border-blue-500/20">
                         <h3 className="text-xs font-black uppercase tracking-widest text-blue-400 mb-4">Financial Overview</h3>
                         <div className="flex justify-between items-end">
                            <span className="text-sm text-slate-400">Estimated Total</span>
                            <span className="text-2xl font-black text-white">₹{itinerary?.total_estimated_cost?.toLocaleString()}</span>
                         </div>
                      </div>

                      {/* Packing Tips */}
                      <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                          <CheckCircle2 size={14} className="text-green-500" /> Equipment List
                        </h3>
                        <ul className="space-y-3">
                          {itinerary?.packing_tips?.map((tip, i) => (
                            <li key={i} className="text-sm text-slate-400 flex items-start gap-3">
                              <span className="mt-1.5 w-1.5 h-1.5 bg-green-500/50 rounded-full shrink-0"></span>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Selected Places - Location Recon */}
                      <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                          <Info size={14} className="text-blue-500" /> Target Locations
                        </h3>
                        <div className="space-y-3">
                          {selectedPlaces?.map((place, i) => (
                            <div key={i} className="flex gap-3 p-2 rounded-lg hover:bg-slate-800 transition-colors group">
                              <div className="w-16 h-16 rounded-md bg-slate-700 overflow-hidden shrink-0">
                                {place.imageUrl ? (
                                  <img src={place.imageUrl} alt={place.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center"><MapPin size={16}/></div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-white truncate">{place.name}</p>
                                <p className="text-[10px] text-slate-500 uppercase">{place.type}</p>
                                {place.rating && (
                                  <div className="flex items-center gap-1 mt-1 text-yellow-500">
                                    <Star size={10} fill="currentColor"/>
                                    <span className="text-[10px] font-bold">{place.rating}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Best Time to Visit */}
                      {itinerary?.best_time_to_visit && (
                        <div className="p-4 rounded-xl border border-dashed border-slate-700 text-center">
                          <p className="text-[10px] text-slate-500 uppercase mb-1">Optimal Launch Window</p>
                          <p className="text-sm font-mono text-blue-400 font-bold">{itinerary.best_time_to_visit}</p>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default History;