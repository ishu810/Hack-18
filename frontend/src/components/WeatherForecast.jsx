import React, { useState, useEffect } from 'react';
import { 
  CloudLightning, Droplets, Eye, CloudRain, Thermometer, 
  Sun, Moon, MapPin, AlertTriangle, Wind, Plane, Cloud, Search,
  
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
    <div className="min-h-screen bg-[#0b0f1a] flex flex-col items-center justify-center text-blue-400 font-mono">
      <div className="relative mb-4">
        <div className="h-14 w-14 rounded-full border border-slate-700 bg-[#111827] grid place-items-center">
          <span className="absolute h-14 w-14 rounded-full border-2 border-transparent border-t-blue-500 border-r-blue-500 animate-spin" />
          <Search className="text-slate-200" size={24} strokeWidth={1.75} />
        </div>
      </div>
      <p className="text-sm tracking-wide text-slate-300">Initializing intelligence feed</p>
      <p className="mt-1 text-xs tracking-wide text-blue-400/80">Syncing global terminals</p>
    </div>
  );

  const { current, hourly, daily, location, advisories } = weatherData;

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-slate-200 p-4 md:p-8 selection:bg-blue-500/30">
      
      {/* 1. NAVIGATION HEADER */}
      <div className="max-w-6xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-5 gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-amber-500 p-2 rounded-lg shadow-[0_0_14px_rgba(251,191,36,0.45)]">
            <Globe className="text-[#111827]" size={24} />
          </div>
          <div>
            <h1 className="text-white font-semibold text-2xl">Weather Overview</h1>
            <p className="text-sm text-slate-400">Global logistics and climate intelligence</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6 text-xs font-medium text-slate-400">
          <div className="flex flex-col items-end">
            <span className="text-blue-400 uppercase tracking-wide">Terminal ID</span>
            <span className="text-white font-mono">BOM-GATE-04</span>
          </div>
          <div className="h-8 w-px bg-slate-800"></div>
          <div className="flex flex-col items-end">
            <span className="text-blue-400 uppercase tracking-wide">Local Time</span>
            <span className="text-white font-mono">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} IST</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: MAIN STATUS (8 Units) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* MAIN WEATHER GLASS CARD */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a] p-6 md:p-8 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-blue-400 text-xs font-medium mb-2">
                <MapPin size={14} /> {location.city}, {location.region}
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-5xl md:text-6xl font-light text-white tracking-tight leading-none">
                    {current.temp}<span className="text-amber-400 font-normal">°</span>
                  </h2>
                  <p className="text-base text-slate-400 font-medium">
                    Expect <span className="text-white font-semibold">{current.condition_text}</span> today.
                  </p>
                </div>
                <div className="text-right">
                  <WeatherIcon condition={current.condition_code} size={64} className="text-white mb-2" />
                  <div className="bg-[#111827] rounded-full px-4 py-1 border border-blue-500/35">
                    <span className="text-xs font-semibold text-blue-400">AQI {current.aqi}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* GRID METRICS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <GlassMetric icon={<Droplets className="text-blue-400"/>} label="Humidity" value={`${current.humidity}%`} />
            <GlassMetric icon={<Wind className="text-blue-400"/>} label="Wind Speed" value={`${current.wind_speed}km/h`} />
            <GlassMetric icon={<Eye className="text-blue-400"/>} label="Visibility" value={`${current.visibility}km`} />
            <GlassMetric icon={<Thermometer className="text-amber-400"/>} label="UV Index" value={current.uv} />
          </div>

          {/* HOURLY STRIP */}
          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
             <h3 className="text-sm font-semibold mb-4 text-amber-400">Hourly Forecast (Next 6 Hours)</h3>
             <div className="flex justify-between gap-4 overflow-x-auto pb-2">
                {hourly.map((h, i) => (
                  <div key={i} className="flex flex-col items-center min-w-20 rounded-xl border border-transparent px-2 py-3 hover:border-blue-500/30 hover:bg-[#111827] transition-colors">
                    <span className="text-xs text-slate-400 mb-3 font-medium font-mono">{h.time}</span>
                    <WeatherIcon condition={h.condition} size={20} className="mb-3 text-white" />
                    <span className="text-sm font-semibold text-white">{h.temp}°</span>
                    <span className="text-[11px] text-blue-400 mt-1 font-mono">{h.precip_prob}</span>
                  </div>
                ))}
             </div>
          </div>
        </div>

        {/* RIGHT COLUMN: ADVISORIES & 5-DAY (4 Units) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* ADVISORY BOX */}
          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
            <div className="flex items-center gap-2 mb-6">
              <AlertTriangle className="text-amber-400" size={18} />
              <h3 className="text-sm font-semibold text-amber-400">Travel Alerts</h3>
            </div>
            <div className="space-y-6">
              {advisories.map((adv, i) => (
                <div key={i} className="group cursor-default">
                  <p className={`text-sm font-semibold mb-1 transition-colors ${adv.color.replace('bg-', 'text-')}`}>
                    {adv.title}
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed group-hover:text-white transition-colors">
                    {adv.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 5-DAY VERTICAL */}
          <div className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
            <h3 className="text-sm font-semibold mb-4 text-amber-400">5-Day Outlook</h3>
            <div className="space-y-5">
              {daily.map((day, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-[#111827] transition-colors">
                  <span className="text-xs font-medium text-slate-400 w-10">{day.label}</span>
                  <WeatherIcon condition={day.condition} size={16} className="text-white" />
                  <div className="flex gap-3 text-sm font-semibold">
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
  <div className="rounded-xl border border-slate-800 bg-[#0f172a] p-4 hover:bg-[#111827] transition-colors cursor-default">
    <div className="mb-3">{icon}</div>
    <p className="text-xs font-medium text-slate-400">{label}</p>
    <p className="text-2xl font-semibold text-white mt-1">{value}</p>
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