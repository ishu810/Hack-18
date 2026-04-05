function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export default function BudgetBreakdown({ budgetData, loading, error, totalBudget = 0, estimatedBudget = 0 }) {
  const perDay = Array.isArray(budgetData?.perDay) ? budgetData.perDay : [];
  const smartTips = Array.isArray(budgetData?.smartTips) ? budgetData.smartTips : [];
  const health = Number(budgetData?.budgetHealth || 0);
  const budgetDelta = Number(totalBudget || 0) - Number(estimatedBudget || 0);

  const getTransportParts = (day) => {
    const interDay = Number(day?.transport?.interDayCost || 0);
    const intraDay = Number(day?.transport?.intraDayCost || 0);
    const total = Number(day?.transport?.cost || interDay + intraDay || 0);
    return { interDay, intraDay, total };
  };

  return (
    <section className="mt-4 rounded-2xl border border-[rgba(201,168,76,0.15)] bg-[linear-gradient(180deg,rgba(15,23,42,0.92)_0%,rgba(2,6,23,0.96)_100%)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.24)]">
      <div className="flex items-start justify-between gap-3 border-b border-[rgba(201,168,76,0.15)] pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-amber-300">Budget Ops</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Travel budget breakdown</h2>
        </div>
       
      </div>

      {loading ? (
        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-4 text-sm text-slate-400">
          Loading budget clearance...
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">
          {error}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Allocated</p>
              <p className="mt-1 text-xl font-semibold text-amber-100">{formatCurrency(totalBudget)}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Estimated</p>
              <p className="mt-1 text-xl font-semibold text-slate-100">{formatCurrency(estimatedBudget)}</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-500/8 px-4 py-3 text-sm text-amber-50">
            <p className="text-[11px] uppercase tracking-[0.14em] text-amber-200">Budget Delta</p>
            <p className="mt-1 font-semibold">
              {budgetDelta >= 0 ? `${formatCurrency(budgetDelta)} remaining` : `${formatCurrency(Math.abs(budgetDelta))} over budget`}
            </p>
          </div>

          {perDay.length ? (
            <div className="mt-4 space-y-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Day wise ledger</p>
              {perDay.slice(0, 4).map((day) => (
                <div key={day.day} className="rounded-xl border border-slate-700 bg-slate-950/55 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        Day {day.day} <span className="text-slate-500">- {day.city || 'Unknown city'}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{day.withinBudget ? 'Within target band' : 'Needs trimming'}</p>
                    </div>
                    <p className={`text-sm font-semibold ${day.withinBudget ? 'text-emerald-200' : 'text-rose-200'}`}>{formatCurrency(day.total)}</p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300 sm:grid-cols-5">
                    <span>Hotel {formatCurrency(day.hotel?.mid || 0)}</span>
                    <span>Food {formatCurrency(day.food || 0)}</span>
                    <span>Activities {formatCurrency(day.activities || 0)}</span>
                    <span>Inter-day {formatCurrency(getTransportParts(day).interDay)}</span>
                    <span>Intra-day {formatCurrency(getTransportParts(day).intraDay)}</span>
                    <span className="sm:col-span-5">Transport total {formatCurrency(getTransportParts(day).total)}</span>
                  </div>
                  {Array.isArray(day.recommendations) && day.recommendations.length ? (
                    <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
                      {day.recommendations.slice(0, 2).map((tip, index) => (
                        <li key={`${day.day}-tip-${index}`}>- {tip}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {smartTips.length ? (
            <div className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-500/8 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Smart tips</p>
              <ul className="mt-2 space-y-2 text-sm text-cyan-50/90">
                {smartTips.slice(0, 3).map((tip, index) => (
                  <li key={`${tip}-${index}`}>- {tip}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
