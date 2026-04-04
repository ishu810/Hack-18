import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

function formatTransit(travel) {
  if (!travel?.from || !travel?.to) return null;
  const mode = travel.mode ? ` via ${travel.mode}` : '';
  const duration = travel.duration ? ` (${travel.duration})` : '';
  return `${travel.from} -> ${travel.to}${mode}${duration}`;
}

export default function ItineraryPlannerPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const journey = location.state?.journey || null;
  const itineraryBundle = location.state?.itinerary || null;
  const selectedPlaces = Array.isArray(location.state?.selectedPlaces) ? location.state.selectedPlaces : [];

  const days = useMemo(() => {
    if (!itineraryBundle?.itinerary || !Array.isArray(itineraryBundle.itinerary)) return [];
    return itineraryBundle.itinerary;
  }, [itineraryBundle]);

  if (!journey || !itineraryBundle) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center px-6">
        <div className="max-w-lg rounded-2xl border border-slate-700 bg-slate-900/70 p-6 text-center">
          <h1 className="text-2xl font-semibold">No itinerary data found</h1>
          <p className="mt-2 text-sm text-slate-300">Generate an itinerary from Agent Home first.</p>
          <button
            type="button"
            onClick={() => navigate('/agent-home')}
            className="mt-5 rounded-xl border border-amber-300/40 bg-linear-to-r from-amber-300 via-amber-500 to-amber-700 px-5 py-3 text-sm font-semibold text-slate-950"
          >
            Back to Agent Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(1100px_540px_at_85%_-10%,rgba(245,158,11,0.12),transparent_60%),linear-gradient(160deg,#020617_0%,#0b1324_48%,#020617_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <header className="mb-6 rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Mission Itinerary</p>
          <h1 className="mt-2 text-3xl font-semibold">{journey.origin?.name || journey.origin} to {journey.destination?.name || journey.destination}</h1>
          <p className="mt-2 text-sm text-slate-300">Day-wise route planner with transit, activities, dining, and local exploration picks.</p>
        </header>

        <section className="grid gap-6 lg:grid-cols-12">
          <aside className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 lg:col-span-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">Map Zone</h2>
            <div className="mt-4 min-h-130 rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-slate-400">
              <p className="text-sm">Map placeholder. Live route map will be integrated here.</p>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Selected Stops</p>
                <ul className="mt-2 space-y-2 text-sm text-slate-300">
                  {selectedPlaces.slice(0, 12).map((place, index) => (
                    <li key={`${place.name}-${index}`} className="rounded border border-slate-700 bg-slate-900/80 px-3 py-2">
                      {place.name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 lg:col-span-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">Planner Itinerary</h2>

            <div className="mt-4 space-y-5">
              {days.map((day, index) => (
                <article key={`${day.day || index + 1}-${day.city || 'city'}`} className="rounded-xl border border-slate-700 bg-slate-950/60 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <h3 className="text-xl font-semibold text-amber-200">Day {day.day || index + 1}</h3>
                    <p className="text-sm text-slate-300">{day.city || 'Unknown city'} {day.theme ? `• ${day.theme}` : ''}</p>
                  </div>

                  <div className="mt-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Transit</p>
                    {formatTransit(day.travel) ? (
                      <>
                        <p className="mt-1 text-base font-semibold text-amber-100">{formatTransit(day.travel)}</p>
                        {day.travel?.note ? <p className="mt-1 text-sm text-amber-100/90">{day.travel.note}</p> : null}
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-slate-300">No inter-city transfer planned for this day.</p>
                    )}
                  </div>

                  <div className="mt-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Weather</p>
                    <p className="mt-1 text-base font-semibold text-cyan-100">{day.weather || 'Not specified'}</p>
                    {day.weather_note ? <p className="mt-1 text-sm text-cyan-100/90">{day.weather_note}</p> : null}
                  </div>

                  <div className="mt-5 grid gap-6 md:grid-cols-2">
                    <section>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Activities</p>
                      <ol className="mt-3 space-y-3">
                        {(day.activities || []).map((activity, activityIndex) => (
                          <li key={`${day.day}-${activityIndex}`} className="pl-1">
                            <p className="text-sm font-semibold text-slate-100">{activity.time || 'Flexible time'} • {activity.title}</p>
                            <p className="mt-1 text-xs text-slate-400">{activity.location || day.city}</p>
                            {activity.description ? <p className="mt-1 text-sm text-slate-300">{activity.description}</p> : null}
                          </li>
                        ))}
                      </ol>

                      <div className="mt-5">
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Local Explorations</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                          {(day.local_explorations || []).map((item, itemIndex) => (
                            <li key={`${day.day}-local-${itemIndex}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </section>

                    <section>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Dining Picks</p>
                      <ul className="mt-3 space-y-3">
                        {(day.dining_places || []).map((spot, spotIndex) => (
                          <li key={`${day.day}-dining-${spotIndex}`} className="pl-1">
                            <p className="text-base font-semibold text-slate-100">{spot.name || 'Recommended dining place'}</p>
                            <p className="mt-1 text-sm text-slate-300">{spot.cuisine || 'Cuisine'} • {spot.area || day.city}</p>
                            {spot.best_for ? <p className="mt-1 text-sm text-emerald-200/90">Best for: {spot.best_for}</p> : null}
                          </li>
                        ))}
                        {(!day.dining_places || day.dining_places.length === 0) ? (
                          <li className="text-sm text-slate-400">No dining picks generated for this day.</li>
                        ) : null}
                      </ul>

                      <div className="mt-5">
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Stay</p>
                        {day.stay?.area ? (
                          <>
                            <p className="mt-2 text-base font-semibold text-emerald-100">{day.stay.area} {day.stay.type ? `• ${day.stay.type}` : ''}</p>
                            {day.stay.reason ? <p className="mt-1 text-sm text-emerald-100/90">{day.stay.reason}</p> : null}
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-slate-300">Stay recommendation not available.</p>
                        )}
                      </div>
                    </section>
                  </div>

                  <div className="mt-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">Tips</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
                      {(day.tips || []).map((tip, tipIndex) => (
                        <li key={`${day.day}-tip-${tipIndex}`}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/agent-home"
            className="rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
          >
            Back to Planner
          </Link>
          <Link
            to="/weather-dashboard"
            className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/30"
          >
            Open Weather Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
