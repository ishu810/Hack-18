import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Calendar, Wallet, MapPin, ChevronRight, ChevronDown, CheckCircle2, Utensils, Briefcase } from 'lucide-react';

const History = () => {
  const { id } = useParams();
  const [trips, setTrips] = useState([]); // Now an array
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null); // Track which trip is open

  useEffect(() => {
    const fetchUserHistory = async () => {
      try {
        const response = await axios.get(`http://localhost:5000/api/${id}`);
        if (response.data.success) {
          // Data is now the array of travels from Travel.find({ user: id })
          setTrips(response.data.data);
          // Auto-expand the first one if it exists
          if (response.data.data.length > 0) {
            setExpandedId(response.data.data[0]._id);
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
      <span className="ml-4 text-xl">Retrieving mission logs...</span>
    </div>
  );

  if (!trips || trips.length === 0) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-400">
      <MapPin size={48} className="mb-4 opacity-20" />
      <p className="text-xl">No field reports found for this operative.</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 bg-slate-950 min-h-screen text-slate-200">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">Operation History</h1>
        <p className="text-slate-500">Reviewing {trips.length} documented excursions</p>
      </header>

      <div className="space-y-6">
        {trips.map((trip) => {
          const isExpanded = expandedId === trip._id;
          const { itinerary, origin, destination, budget, dates, status, selectedPlaces } = trip;

          return (
            <div key={trip._id} className={`bg-slate-900 rounded-2xl border transition-all duration-300 ${isExpanded ? 'border-blue-500/50 shadow-lg shadow-blue-500/10' : 'border-slate-800'}`}>
              
              {/* Trip Summary Card (Click to Toggle) */}
              <div 
                onClick={() => setExpandedId(isExpanded ? null : trip._id)}
                className="p-6 cursor-pointer flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400">
                    <MapPin size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{origin} → {destination}</h2>
                    <div className="flex gap-3 mt-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Calendar size={12}/> {dates[0]}</span>
                      <span className="flex items-center gap-1"><Wallet size={12}/> ₹{budget}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <span className={`text-[10px] uppercase tracking-widest px-3 py-1 rounded-full border ${
                    status === 'itinerary_generated' ? 'border-green-500/50 text-green-400 bg-green-500/5' : 'border-blue-500/50 text-blue-400 bg-blue-500/5'
                  }`}>
                    {status.replace('_', ' ')}
                  </span>
                  {isExpanded ? <ChevronDown size={20} className="text-slate-500"/> : <ChevronRight size={20} className="text-slate-500"/>}
                </div>
              </div>

              {/* Expanded Detail Section */}
              {isExpanded && (
                <div className="px-6 pb-8 pt-2 border-t border-slate-800 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
                    
                    {/* Itinerary Column */}
                    <div className="lg:col-span-2 space-y-6">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4">Detailed Timeline</h3>
                      {itinerary?.itinerary?.map((dayPlan, index) => (
                        <div key={index} className="bg-slate-800/40 rounded-xl overflow-hidden border border-slate-700/50">
                          <div className="bg-slate-800 p-4 flex justify-between items-center">
                            <h4 className="font-semibold text-blue-400">Day {dayPlan.day}: {dayPlan.city}</h4>
                            <span className="text-xs text-slate-400 italic">{dayPlan.theme}</span>
                          </div>
                          <div className="p-5 space-y-6">
                            <div className="space-y-4 border-l border-slate-700 ml-2 pl-6">
                              {dayPlan.activities.map((act, i) => (
                                <div key={i} className="relative">
                                  <div className="absolute -left-[29px] top-1.5 w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                                  <p className="text-[10px] font-bold text-blue-500 uppercase">{act.time}</p>
                                  <h5 className="font-medium text-slate-200">{act.title}</h5>
                                  <p className="text-sm text-slate-400 mt-1 leading-relaxed">{act.description}</p>
                                </div>
                              ))}
                            </div>
                            
                            {dayPlan.dining_places?.length > 0 && (
                              <div className="bg-orange-500/5 p-4 rounded-lg border border-orange-500/10">
                                <h5 className="text-xs font-bold text-orange-400 mb-2 flex items-center gap-2">
                                  <Utensils size={14} /> Recommended Provisions
                                </h5>
                                {dayPlan.dining_places.map((place, i) => (
                                  <p key={i} className="text-sm text-slate-300 mb-1 last:mb-0">
                                    <span className="text-orange-300/80">{place.name}</span> — {place.cuisine}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Sidebar Column */}
                    <div className="space-y-6">
                      <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700/50">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                          <CheckCircle2 size={14} className="text-green-500" /> Packing Strategy
                        </h3>
                        <ul className="space-y-2">
                          {itinerary?.packing_tips?.map((tip, i) => (
                            <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                              <span className="text-green-500/50">•</span> {tip}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700/50">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Location Recon</h3>
                        <div className="grid grid-cols-2 gap-2">
                          {selectedPlaces?.map((place, i) => (
                            <div key={i} className="group relative rounded-lg overflow-hidden h-24 bg-slate-700">
                              <img src={place.imageUrl} alt={place.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                              <div className="absolute bottom-0 left-0 right-0 p-2 bg-slate-900/80 backdrop-blur-sm">
                                <p className="text-[10px] font-bold truncate">{place.name}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
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