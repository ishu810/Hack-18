export default function AgentStatusIndicator() {
  const agents = [
    { name: "Weather Agent", status: "STANDBY" },
    { name: "Maps Agent", status: "STANDBY" },
    { name: "Budget Agent", status: "STANDBY" }
  ];
  return (
    <div className="bg-[#243b3e] border border-[rgba(201,168,76,0.15)] rounded-lg p-5 text-[#f0ede6]">
      <h2 className="text-[#c9a84c] text-xs font-bold uppercase tracking-widest mb-4">Agent Network</h2>
      <div className="space-y-3">
        {agents.map((ag, i) => (
          <div key={i} className="flex justify-between items-center bg-[#1c2b2d] p-2 rounded">
            <span className="text-[10px] text-[#9db5b2] uppercase tracking-widest">{ag.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold text-[#c9a84c]">{ag.status}</span>
              <div className="w-2 h-2 rounded-full bg-[#c9a84c] opacity-50"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}