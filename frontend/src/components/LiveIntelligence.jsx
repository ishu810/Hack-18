export default function LiveIntelligence() {
  return (
    <div className="bg-[#243b3e] border border-[rgba(201,168,76,0.15)] rounded-lg p-5 h-full flex flex-col">
      <h2 className="text-[#c9a84c] text-xs font-bold uppercase tracking-widest mb-4 border-b border-[rgba(201,168,76,0.15)] pb-2">Live Intel Log</h2>
      <div className="flex-1 font-mono text-[10px] text-[#4ecdc4] space-y-2 opacity-80 overflow-y-auto">
        <p>[SYS] Ops terminal initialized.</p>
        <p>[SYS] Establishing secure connection...</p>
        <p className="text-[#9db5b2]">[SYS] Waiting for pursuit initiation...</p>
      </div>
    </div>
  );
}
