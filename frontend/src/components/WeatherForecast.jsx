import React, { useState, useEffect } from 'react';
import { 
  CloudLightning, Droplets, Eye, CloudRain, Thermometer, 
  Sun, Moon, MapPin, Wind, Globe, Search, Loader2, Calendar
} from 'lucide-react';

const API_KEY = "14a6e1190b8b40edb95195715260404"; 

const WeatherDashboard = () => {
  const [locationInput, setLocationInput] = useState('Mumbai');
  const [dateInput, setDateInput] = useState(new Date().toISOString().split('T')[0]);
  
  // State for the actual API trigger
  const [query, setQuery] = useState({ city: 'Mumbai', date: new Date().toISOString().split('T')[0] });
  
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchWeather = async () => {
      setLoading(true);
      setError(null);
      try {
        // Using the 'forecast' endpoint as it supports specific dates
        const response = await fetch(
          `https://api.weatherapi.com/v1/forecast.json?key=${API_KEY}&q=${query.city}&dt=${query.date}&aqi=yes`
        );
        
        if (!response.ok) throw new Error('Location or Date out of range');
        
        const data = await response.json();
        setWeatherData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [query]);

  const handleUpdate = (e) => {
    e.preventDefault();
    setQuery({ city: locationInput, date: dateInput });
  };

  return (
    <div className="min-h-screen bg-[#05070a] bg-[radial-gradient(circle_at_top_right,_#1e293b_0%,_#05070a_60%)] text-slate-300 p-4 md:p-8 font-sans">
      
      {/* DYNAMIC SEARCH  BAR */}  
      <div className="max-w-6xl mx-auto mb-10 border-b border-white/10 pb-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-cyan-500 p-2 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.4)]">
              <Globe className="text-white" size={24} />
            </div>
            <h1 className="text-white font-black tracking-tighter text-2xl uppercase">Voyage<span className="text-cyan-500">Intel</span></h1>
          </div>

          <form onSubmit={handleUpdate} className="flex flex-col sm:flex-row gap-3 w-full max-w-2xl">
            <div className="relative flex-1">
              <MapPin className="absolute left-4 top-3 text-slate-500" size={16} />
              <input 
                type="text"
                placeholder="Destination..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-12 text-sm focus:border-cyan-500 outline-none transition-all"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
              />
            </div>
            <div className="relative flex-1">
              <Calendar className="absolute left-4 top-3 text-slate-500" size={16} />
              <input 
                type="date"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-12 text-sm focus:border-cyan-500 outline-none transition-all [color-scheme:dark]"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
              />
            </div>
            <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-colors">
              SYNC
            </button>
          </form>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-cyan-400 font-mono">
          <Loader2 className="animate-spin mb-4" size={40} />
          <p className="tracking-[0.3em] text-[10px]">ANALYZING ATMOSPHERIC DATA...</p>
        </div>
      ) : error ? (
        <div className="max-w-md mx-auto text-center p-8 border border-red-500/20 bg-red-500/5 rounded-3xl">
          <p className="text-red-400 font-mono text-sm mb-2">SYSTEM ERROR: {error.toUpperCase()}</p>
          <p className="text-slate-500 text-xs">Verify your location and ensure the date is within the 14-day range.</p>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-700">
          
          <div className="lg:col-span-8 space-y-6">
            {/* CURRENT WEATHER OVERVIEW */}
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                 <Globe size={200} />
              </div>
              
              <div className="relative z-10">
                <div className="flex items-center gap-2 text-cyan-400 text-[10px] font-bold tracking-[0.3em] mb-4 uppercase">
                  ACTIVE TERMINAL: {weatherData.location.name}, {weatherData.location.country}
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-7xl md:text-9xl font-light text-white tracking-tighter leading-none">
                      {Math.round(weatherData.current.temp_c)}<span className="text-cyan-500 font-normal">°</span>
                    </h2>
                    <p className="text-lg text-slate-400 mt-4">
                      {weatherData.current.condition.text} at <span className="text-white">{weatherData.location.localtime.split(' ')[1]}</span>
                    </p>
                  </div>
                  <div className="text-center">
                    <img src={weatherData.current.condition.icon} alt="icon" className="w-24 h-24 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
                    <div className="mt-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-3 py-1">
                       <span className="text-[10px] font-bold text-cyan-400">AQI: {weatherData.current.air_quality['us-epa-index']}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* METRICS GRID */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricBox icon={<Droplets className="text-cyan-400"/>} label="Humidity" value={`${weatherData.current.humidity}%`} />
              <MetricBox icon={<Wind className="text-blue-400"/>} label="Wind Gusts" value={`${weatherData.current.wind_kph} kmh`} />
              <MetricBox icon={<Eye className="text-indigo-400"/>} label="Visibilty" value={`${weatherData.current.vis_km} km`} />
              <MetricBox icon={<Thermometer className="text-orange-400"/>} label="UV Index" value={weatherData.current.uv} />
            </div>

            {/* HOURLY DATA FOR SELECTED DATE */}
            <div className="rounded-3xl border border-white/5 bg-black/20 p-6">
              <h3 className="text-[10px] font-bold tracking-[0.2em] mb-6 text-slate-500 uppercase italic">Forecast for {query.date}</h3>
              <div className="flex justify-between gap-6 overflow-x-auto pb-4 scrollbar-hide">
                {weatherData.forecast.forecastday[0].hour.filter((_, index) => index % 3 === 0).map((h, i) => (
                  <div key={i} className="flex flex-col items-center min-w-[60px] group">
                    <span className="text-[10px] text-slate-500 mb-3 font-bold group-hover:text-cyan-400 transition-colors">{h.time.split(' ')[1]}</span>
                    <img src={h.condition.icon} alt="icon" className="w-8 h-8 mb-3" />
                    <span className="text-sm font-bold text-white">{Math.round(h.temp_c)}°</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SIDEBAR - ASTRONOMY & EXTRAS */}
          <div className="lg:col-span-4 space-y-6">
             <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent p-8">
                <h3 className="text-[10px] font-bold tracking-[0.2em] mb-8 text-slate-500 uppercase">Astro Data</h3>
                <div className="space-y-8">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <Sun className="text-orange-400" size={20} />
                         <div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase">Sunrise</p>
                            <p className="text-sm font-bold text-white">{weatherData.forecast.forecastday[0].astro.sunrise}</p>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-[9px] text-slate-500 font-bold uppercase">Sunset</p>
                         <p className="text-sm font-bold text-white">{weatherData.forecast.forecastday[0].astro.sunset}</p>
                      </div>
                   </div>
                   <div className="flex items-center justify-between pt-8 border-t border-white/5">
                      <div className="flex items-center gap-3">
                         <Moon className="text-indigo-400" size={20} />
                         <div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase">Moon Phase</p>
                            <p className="text-sm font-bold text-white">{weatherData.forecast.forecastday[0].astro.moon_phase}</p>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>

        </div>
      )}
    </div>
  );
};

const MetricBox = ({ icon, label, value }) => (
  <div className="rounded-2xl border border-white/5 bg-white/5 p-5 hover:border-cyan-500/30 transition-all group">
    <div className="mb-3 transform group-hover:scale-110 transition-transform">{icon}</div>
    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
    <p className="text-xl font-bold text-white mt-1">{value}</p>
  </div>
);

export default WeatherDashboard;