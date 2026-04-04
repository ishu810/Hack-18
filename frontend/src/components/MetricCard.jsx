export default function MetricCard({ title, value, type }) {
  const valueColor = type === 'hazard' ? 'text-[#e8956d]' : 'text-[#4ecdc4]';
  return (
    <div className="bg-[#243b3e] border border-[rgba(201,168,76,0.15)] rounded-lg p-4">
      <h3 className="text-[10px] uppercase font-bold text-[#c9a84c] tracking-[0.15em] mb-2">{title}</h3>
      <div className={`font-mono text-2xl ${valueColor}`}>{value}</div>
    </div>
  );
}