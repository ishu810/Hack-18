export default function TravelAlerts() {
  return (
    <div className="bg-[rgba(232,149,109,0.1)] border border-[#e8956d] rounded-lg p-4 flex gap-4 items-start">
      <div className="text-[#e8956d] font-bold text-lg mt-0.5">!</div>
      <div>
        <h4 className="text-[#e8956d] text-xs font-bold uppercase tracking-widest mb-1">Field Alert</h4>
        <p className="text-[#f0ede6] text-sm opacity-90">High hazard storm conditions detected mid-route. Rerouting models engaged.</p>
      </div>
    </div>
  );
}
