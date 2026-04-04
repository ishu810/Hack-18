export default function MissionInput({ trip, dates, budget }) {
  return (
    <div className="bg-[#243b3e] border border-[rgba(201,168,76,0.15)] rounded-lg p-5 mb-6 text-[#f0ede6]">
      <h2 className="text-[#c9a84c] text-xs font-bold uppercase tracking-widest mb-4">Mission Parameters</h2>
      <div className="space-y-4">
        <div>
          <label className="text-[10px] text-[#9db5b2] uppercase tracking-[0.1em]">Origin - Destination</label>
          <div className="font-mono text-sm mt-1">{trip.origin} → {trip.destination}</div>
        </div>
        <div>
          <label className="text-[10px] text-[#9db5b2] uppercase tracking-[0.1em]">Timeline</label>
          <div className="font-mono text-sm mt-1">{dates.departure} — {dates.return}</div>
        </div>
        <div>
          <label className="text-[10px] text-[#9db5b2] uppercase tracking-[0.1em]">Allocated Budget</label>
          <div className="font-mono text-sm text-[#4ecdc4] mt-1">${budget.toLocaleString()} USD</div>
        </div>
        <button className="w-full mt-4 bg-gradient-to-r from-[#c9a84c] to-[#a88a38] text-[#1c2b2d] font-bold py-2 rounded text-xs uppercase tracking-widest shadow-[0_0_10px_rgba(201,168,76,0.3)] hover:opacity-90">
          Initiate Pursuit
        </button>
      </div>
    </div>
  );
}