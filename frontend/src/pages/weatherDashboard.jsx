import { useMemo } from 'react';
import { CloudLightning, CloudRain, Droplets, Eye, Globe, MapPin, Moon, Sun, Thermometer, Wind, AlertTriangle } from 'lucide-react';

const sampleData = {
  location: { city: 'Mumbai', region: 'India' },
  current: {
    temp: 28,
    condition_text: 'Monsoon Storms',
    condition_code: 'storm',
    humidity: 84,
    visibility: 2,
    wind_speed: 42,
    aqi: 163,
    uv: 7,
  },
  hourly: [
    { time: '14:00', temp: 28, precip_prob: '90%', condition: 'storm' },
    { time: '15:00', temp: 27, precip_prob: '85%', condition: 'rain' },
    { time: '16:00', temp: 26, precip_prob: '70%', condition: 'rain' },
    { time: '17:00', temp: 25, precip_prob: '60%', condition: 'cloud' },
    { time: '18:00', temp: 24, precip_prob: '20%', condition: 'moon' },
    { time: '19:00', temp: 24, precip_prob: '10%', condition: 'moon' },
  ],
  daily: [
    { label: 'MON', temp_high: 32, temp_low: 27, condition: 'storm' },
    { label: 'TUE', temp_high: 30, temp_low: 23, condition: 'rain' },
    { label: 'WED', temp_high: 31, temp_low: 25, condition: 'cloud' },
    { label: 'THU', temp_high: 33, temp_low: 25, condition: 'sun' },
    { label: 'FRI', temp_high: 35, temp_low: 26, condition: 'sun' },
  ],
  advisories: [
    { color: 'bg-red-500', title: 'Route Restriction', text: 'Coastal highway flooded. Transit delays exceeding 45 minutes.' },
    { color: 'bg-orange-500', title: 'Flight Alert', text: 'Heavy crosswinds at BOM Terminal 2. Check gate status.' },
  ],
};

function WeatherIcon({ condition, size, className }) {
  switch (condition) {
    case 'storm':
      return <CloudLightning size={size} className={className} />;
    case 'rain':
      return <CloudRain size={size} className={className} />;
    case 'moon':
      return <Moon size={size} className={className} />;
    case 'sun':
      return <Sun size={size} className={className} />;
    default:
      return <Sun size={size} className={className} />;
  }
}

function GlassMetric({ icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-[#0f172a] p-4 transition-colors hover:bg-[#111827]">
      <div className="mb-3">{icon}</div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

export default function WeatherDashboard() {
  const weatherData = useMemo(() => sampleData, []);
  const { current, hourly, daily, location, advisories } = weatherData;

  return (
    <main className="min-h-screen bg-[#0b0f1a] px-4 py-8 text-slate-200 md:px-8">
      <div className="mx-auto mb-8 max-w-6xl border-b border-slate-800 pb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-amber-500 p-2 shadow-[0_0_14px_rgba(251,191,36,0.45)]">
              <Globe className="text-[#111827]" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Weather Overview</h1>
              <p className="text-sm text-slate-400">Global logistics and climate intelligence</p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs font-medium text-slate-400">
            <div className="flex flex-col items-end">
              <span className="uppercase tracking-wide text-blue-400">Terminal ID</span>
              <span className="font-mono text-white">BOM-GATE-04</span>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div className="flex flex-col items-end">
              <span className="uppercase tracking-wide text-blue-400">Local Time</span>
              <span className="font-mono text-white">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} IST</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6 shadow-[0_16px_40px_rgba(0,0,0,0.35)] md:p-8">
            <div className="flex items-center gap-2 text-sm text-blue-400">
              <MapPin size={14} /> {location.city}, {location.region}
            </div>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-6xl font-light leading-none text-white md:text-7xl">
                  {current.temp}<span className="font-normal text-amber-400">°</span>
                </h2>
                <p className="mt-2 text-base text-slate-400">
                  Expect <span className="font-semibold text-white">{current.condition_text}</span> today.
                </p>
              </div>
              <div className="text-right">
                <WeatherIcon condition={current.condition_code} size={64} className="mb-2 text-white" />
                <div className="rounded-full border border-blue-500/35 bg-[#111827] px-4 py-1 text-xs font-semibold text-blue-400">
                  AQI {current.aqi}
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <GlassMetric icon={<Droplets className="text-blue-400" />} label="Humidity" value={`${current.humidity}%`} />
            <GlassMetric icon={<Wind className="text-blue-400" />} label="Wind Speed" value={`${current.wind_speed} km/h`} />
            <GlassMetric icon={<Eye className="text-blue-400" />} label="Visibility" value={`${current.visibility} km`} />
            <GlassMetric icon={<Thermometer className="text-amber-400" />} label="UV Index" value={current.uv} />
          </section>

          <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
            <h3 className="mb-4 text-sm font-semibold text-amber-400">Hourly Forecast (Next 6 Hours)</h3>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {hourly.map((hour) => (
                <div key={hour.time} className="min-w-20 rounded-xl border border-transparent px-2 py-3 text-center transition-colors hover:border-blue-500/30 hover:bg-[#111827]">
                  <div className="mb-3 font-mono text-xs text-slate-400">{hour.time}</div>
                  <WeatherIcon condition={hour.condition} size={20} className="mx-auto mb-3 text-white" />
                  <div className="text-sm font-semibold text-white">{hour.temp}°</div>
                  <div className="mt-1 font-mono text-[11px] text-blue-400">{hour.precip_prob}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6 lg:col-span-4">
          <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
            <div className="mb-6 flex items-center gap-2">
              <AlertTriangle className="text-amber-400" size={18} />
              <h3 className="text-sm font-semibold text-amber-400">Travel Alerts</h3>
            </div>
            <div className="space-y-5">
              {advisories.map((advisory) => (
                <div key={advisory.title}>
                  <p className={`mb-1 text-sm font-semibold ${advisory.color.replace('bg-', 'text-')}`}>{advisory.title}</p>
                  <p className="text-xs leading-relaxed text-slate-400">{advisory.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-[#0f172a] p-6">
            <h3 className="mb-4 text-sm font-semibold text-amber-400">5-Day Outlook</h3>
            <div className="space-y-4">
              {daily.map((day) => (
                <div key={day.label} className="flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-[#111827]">
                  <span className="w-10 text-xs font-medium text-slate-400">{day.label}</span>
                  <WeatherIcon condition={day.condition} size={16} className="text-white" />
                  <div className="flex gap-3 text-sm font-semibold">
                    <span className="text-white">{day.temp_high}°</span>
                    <span className="text-slate-600">{day.temp_low}°</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}