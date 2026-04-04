import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function MissionSummaryPage() {
  const location = useLocation();
  const journey = location.state?.journey;

  const getPlaceLabel = (place) => {
    if (!place) {
      return '';
    }

    return typeof place === 'string' ? place : place.name || '';
  };

  if (!journey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="max-w-md rounded-2xl border border-slate-700 bg-slate-900/70 p-8 text-center shadow-2xl backdrop-blur-md">
          <h1 className="text-2xl font-semibold tracking-tight">No mission secured</h1>
          <p className="mt-3 text-sm text-slate-400">Open the agent desk and approve a route to view the mission summary.</p>
          <Link
            to="/agent-home"
            className="mt-6 inline-flex rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/80"
          >
            Return to Desk
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.16),transparent_34%),linear-gradient(155deg,#020617_0%,#0b1324_45%,#020617_100%)] px-4 py-8 text-slate-100 md:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[url('/detective.bg.png')] bg-cover bg-center opacity-[0.06]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.34),rgba(2,6,23,0.74))]" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative z-10 mx-auto flex w-full max-w-3xl flex-col rounded-3xl border border-slate-700/70 bg-slate-950/70 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.66)] backdrop-blur-md md:p-10"
      >
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-300/80">Mission Approved</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Route Secured</h1>
          <p className="mt-2 text-sm text-slate-400">Your selected checkpoints are locked and ready for execution.</p>
        </div>

        <section className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 md:p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Vector</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">
                {getPlaceLabel(journey.origin)} to {getPlaceLabel(journey.destination)}
              </p>
            </div>
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Travel Window</p>
              <p className="mt-1 text-sm text-slate-200">{journey.departureDate || 'N/A'} → {journey.comingDate || 'N/A'}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Budget Range</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">
                ${Number(journey.budgetRange?.[0] || 0).toLocaleString()} - ${Number(journey.budgetRange?.[1] || 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Distance / Time</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{journey.totalDistance} km / {journey.estimatedHours} hrs</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">Checkpoints</p>
            <p className="mt-2 text-sm leading-7 text-amber-100/90">
              {journey.route.map((place) => getPlaceLabel(place)).join(' → ')}
            </p>
          </div>
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl border border-amber-300/35 bg-linear-to-r from-amber-500/85 to-amber-700/85 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-950 transition hover:brightness-110"
          >
            Print Hard Copy
          </button>
          <Link
            to="/agent-home"
            className="rounded-xl border border-slate-700 bg-slate-900/70 px-5 py-3 text-center text-sm font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/80"
          >
            Return to Desk
          </Link>
        </div>
      </motion.div>
    </main>
  );
}