import React, { useState, useEffect } from 'react';
import { 
  CloudLightning, Droplets, Eye, CloudRain, Thermometer, 
  Sun, Moon, MapPin, AlertTriangle, Wind, Sunrise, 
  Sunset, Plane, Umbrella, Cloud, 
  
  Globe,
} from 'lucide-react';

const WeatherDashboard = () => {
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mocking the fetch - Replace with your actual backend route
    const timer = setTimeout(() => {
      setWeatherData(sampleData); // Assume sampleData matches the structure from previous response
      setLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-[#05070a] flex flex-col items-center justify-center text-cyan-400 font-mono">
      <Plane className="animate-bounce mb-4" size={40} />
      <p className="tracking-[0.3em] text-[10px]">SYNCING GLOBAL TERMINALS...</p>
    </div>
  );

  const { current, hourly, daily, alerts, location, advisories } = weatherData;

  return (
    <div className="min-h-screen bg-[#05070a] bg-[radial-gradient(circle_at_top_right,_#1e293b_0%,_#05070a_60%)] text-slate-300 p-4 md:p-8 font-sans selection:bg-cyan-500/30">
      
      {/* 1. NAVIGATION HEADER */}
      <div className="max-w-6xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between border-b border-white/10 pb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-cyan-500 p-2 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.5)]">
            <Globe className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-white font-black tracking-tighter text-2xl">VOYAGE<span className="text-cyan-500">INTEL</span></h1>
            <p className="text-[9px] tracking-[0.2em] text-slate-500 font-bold uppercase">Global Logistics & Weather Division</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6 text-[10px] font-bold tracking-widest text-slate-400">
          <div className="flex flex-col items-end">
            <span className="text-cyan-500/80">TERMINAL ID</span>
            <span className="text-white">BOM-GATE-04</span>
          </div>
          <div className="h-8 w-[1px] bg-white/10"></div>
          <div className="flex flex-col items-end">
            <span className="text-cyan-500/80">LOCAL TIME</span>
            <span className="text-white">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} IST</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: MAIN STATUS (8 Units) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* MAIN WEATHER GLASS CARD */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl">
            <div className="absolute top-0 right-0 p-8 opacity-10">
               <Plane size={180} className="-rotate-12" />
            </div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-cyan-400 text-[10px] font-bold tracking-widest mb-2">
                <MapPin size={12} /> {location.city.toUpperCase()} / {location.region.toUpperCase()}
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-6xl md:text-8xl font-light text-white tracking-tighter">
                    {current.temp}<span className="text-cyan-500 font-normal">°</span>
                  </h2>
                  <p className="text-lg text-slate-400 font-medium lowercase">
                    Expect <span className="text-white">{current.condition_text}</span> today.
                  </p>
                </div>
                <div className="text-right">
                  <WeatherIcon condition={current.condition_code} size={64} className="text-white mb-2" />
                  <div className="bg-white/10 rounded-full px-4 py-1 backdrop-blur-md border border-white/10">
                    <span className="text-[10px] font-bold text-cyan-400">AQI {current.aqi}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* GRID METRICS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <GlassMetric icon={<Droplets className="text-cyan-400"/>} label="Humidity" value={`${current.humidity}%`} />
            <GlassMetric icon={<Wind className="text-blue-400"/>} label="Wind Speed" value={`${current.wind_speed}km/h`} />
            <GlassMetric icon={<Eye className="text-indigo-400"/>} label="Visibility" value={`${current.visibility}km`} />
            <GlassMetric icon={<Thermometer className="text-orange-400"/>} label="UV Index" value={current.uv} />
          </div>

          {/* HOURLY STRIP */}
          <div className="rounded-3xl border border-white/5 bg-black/20 p-6">
             <h3 className="text-[10px] font-bold tracking-[0.2em] mb-6 text-slate-500 uppercase">Hourly Forecast / Next 6 Hours</h3>
             <div className="flex justify-between gap-4 overflow-x-auto pb-2">
                {hourly.map((h, i) => (
                  <div key={i} className="flex flex-col items-center min-w-[70px]">
                    <span className="text-[10px] text-slate-500 mb-3 font-bold">{h.time}</span>
                    <WeatherIcon condition={h.condition} size={20} className="mb-3 text-white" />
                    <span className="text-sm font-bold text-white">{h.temp}°</span>
                    <span className="text-[9px] text-cyan-500 mt-1">{h.precip_prob}</span>
                  </div>
                ))}
             </div>
          </div>
        </div>

        {/* RIGHT COLUMN: ADVISORIES & 5-DAY (4 Units) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* ADVISORY BOX */}
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <AlertTriangle className="text-orange-500" size={18} />
              <h3 className="text-[10px] font-bold tracking-[0.2em] text-white uppercase">Travel Alerts</h3>
            </div>
            <div className="space-y-6">
              {advisories.map((adv, i) => (
                <div key={i} className="group cursor-default">
                  <p className={`text-[11px] font-bold mb-1 transition-colors ${adv.color.replace('bg-', 'text-')}`}>
                    {adv.title.toUpperCase()}
                  </p>
                  <p className="text-[10px] text-slate-500 leading-relaxed group-hover:text-slate-300 transition-colors">
                    {adv.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 5-DAY VERTICAL */}
          <div className="rounded-3xl border border-white/10 bg-black/40 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.2em] mb-6 text-slate-500 uppercase">5-Day Outlook</h3>
            <div className="space-y-5">
              {daily.map((day, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 w-10">{day.label}</span>
                  <WeatherIcon condition={day.condition} size={16} className="text-white" />
                  <div className="flex gap-3 text-[11px] font-bold">
                    <span className="text-white">{day.temp_high}°</span>
                    <span className="text-slate-600">{day.temp_low}°</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};

// --- STYLED SUB-COMPONENTS ---

const GlassMetric = ({ icon, label, value }) => (
  <div className="rounded-2xl border border-white/5 bg-white/5 p-5 hover:bg-white/10 transition-all cursor-default">
    <div className="mb-3">{icon}</div>
    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
    <p className="text-xl font-bold text-white mt-1">{value}</p>
  </div>
);

const WeatherIcon = ({ condition, size, className }) => {
  switch (condition) {
    case 'storm': return <CloudLightning size={size} className={className} />;
    case 'rain': return <CloudRain size={size} className={className} />;
    case 'cloud': return <Cloud size={size} className={className} />;
    case 'moon': return <Moon size={size} className={className} />;
    case 'sun': return <Sun size={size} className={className} />;
    default: return <Sun size={size} className={className} />;
  }
};

// --- SAMPLE DATA (For Preview) ---
const sampleData = {
  location: { name: "MUMBAI INTL", city: "Mumbai", region: "India" },
  current: {
    temp: 28, feels_like: 31, condition_text: "Monsoon Storms", condition_code: "storm",
    humidity: 84, visibility: 2, wind_speed: 42, aqi: 163, uv: 7
  },
  hourly: [
    { time: "14:00", temp: 28, precip_prob: "90%", condition: "storm" },
    { time: "15:00", temp: 27, precip_prob: "85%", condition: "rain" },
    { time: "16:00", temp: 26, precip_prob: "70%", condition: "rain" },
    { time: "17:00", temp: 25, precip_prob: "60%", condition: "cloud" },
    { time: "18:00", temp: 24, precip_prob: "20%", condition: "moon" },
    { time: "19:00", temp: 24, precip_prob: "10%", condition: "moon" }
  ],
  daily: [
    { label: "MON", temp_high: 32, temp_low: 27, condition: "storm" },
    { label: "TUE", temp_high: 30, temp_low: 23, condition: "rain" },
    { label: "WED", temp_high: 31, temp_low: 25, condition: "cloud" },
    { label: "THU", temp_high: 33, temp_low: 25, condition: "sun" },
    { label: "FRI", temp_high: 35, temp_low: 26, condition: "sun" }
  ],
  advisories: [
    { color: "bg-red-500", title: "Route Restriction", text: "Coastal highway flooded. Transit delays exceeding 45 minutes." },
    { color: "bg-orange-500", title: "Flight Alert", text: "Heavy crosswinds at BOM Terminal 2. Check gate status." }
  ]
};

export default WeatherDashboard;