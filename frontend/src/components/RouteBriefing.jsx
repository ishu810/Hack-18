export default function RouteBriefing({ route }) {
  return (
    <div className="bg-[#243b3e] border border-[rgba(201,168,76,0.15)] rounded-lg p-5">
      <h2 className="text-[#f0ede6] text-sm uppercase tracking-widest mb-4 border-b border-[rgba(201,168,76,0.15)] pb-2">Route Briefing</h2>
      <div className="relative border-l border-dashed border-[#4ecdc4]/40 ml-2 space-y-6">
        {route.map((step, i) => (
          <div key={i} className="relative pl-6">
            <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#c9a84c]"></div>
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[10px] text-[#9db5b2] uppercase tracking-[0.1em]">{step.label}</div>
                <div className="text-[#f0ede6] font-bold text-sm tracking-wide">{step.city}</div>
              </div>
              <div className="font-mono text-xs text-[#4ecdc4]">{step.distance}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}