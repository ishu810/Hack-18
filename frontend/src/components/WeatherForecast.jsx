export default function WeatherForecast({ weather }) {
  return (
    <div className="bg-[#243b3e] border border-[rgba(201,168,76,0.15)] rounded-lg p-5">
      <h2 className="text-[#f0ede6] text-sm uppercase tracking-widest mb-4 border-b border-[rgba(201,168,76,0.15)] pb-2">Weather Intelligence</h2>
      <div className="grid grid-cols-5 gap-3">
        {weather.map((w, i) => (
          <div key={i} className={`flex flex-col items-center bg-[#1c2b2d] rounded py-3 border ${w.risk === 'HIGH' ? 'border-[#e8956d]' : 'border-transparent'}`}>
            <span className="text-[10px] text-[#c9a84c] font-bold mb-2">{w.day}</span>
            <span className={`font-mono text-lg mb-1 ${w.risk === 'HIGH' ? 'text-[#e8956d]' : 'text-[#f0ede6]'}`}>{w.temp}</span>
            <span className="text-[8px] uppercase tracking-widest text-[#9db5b2]">{w.condition}</span>
          </div>
        ))}
      </div>
    </div>
  );
}