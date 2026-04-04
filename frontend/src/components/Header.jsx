export default function Header() {
  return (
    <header className="mb-8 border-b border-[rgba(201,168,76,0.15)] pb-4 flex justify-between items-center text-[#f0ede6]">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-[#4ecdc4] animate-pulse"></div>
        <h1 className="text-xl font-bold tracking-[0.2em] uppercase text-[#c9a84c]">Operation Roundtable</h1>
      </div>
      <div className="text-[#9db5b2] font-mono text-sm tracking-widest">{new Date().toLocaleString()}</div>
    </header>
  );
}
