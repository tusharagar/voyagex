/**
 * PackageDetail — itinerary, destinations, hotels and bookable departures.
 * Phase 7 · SRS FR-07, FR-08, FR-24 · UC-06 · wireframes/03_package_detail.svg
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, qs, inr, shortDate } from '../api/client.js';
import QueryTrace from '../components/QueryTrace.jsx';
import { Spinner, ErrorNote, SeatsBadge, CategoryBadge, Crumbs } from '../components/ui.jsx';
import { useAuth } from '../auth.jsx';

const TABS = [
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'destinations', label: 'Destinations' },
];

function DepartureRow({ dep, onBook, signedIn }) {
  const sold = dep.available_seats === 0;
  return (
    <div className={`rounded-lg ring-1 p-3 flex flex-wrap items-center gap-3 ${
      sold ? 'ring-ink-100 bg-ink-50/60' : 'ring-ink-200 bg-white hover:ring-ocean-300 transition-colors'
    }`}>
      <div className="min-w-[9rem]">
        <p className={`text-sm font-semibold ${sold ? 'text-ink-400' : 'text-ink-900'}`}>
          {shortDate(dep.start_date)}
        </p>
        <p className="text-xs text-ink-500">to {shortDate(dep.end_date)}</p>
      </div>

      <div className="min-w-[6rem]">
        <p className={`text-base font-bold ${sold ? 'text-ink-400' : 'text-ocean-800'}`}>{inr(dep.price)}</p>
        <p className="text-[0.68rem] text-ink-400">per seat</p>
      </div>

      <div className="min-w-[7rem]">
        <SeatsBadge seats={dep.available_seats} total={dep.total_seats} />
        <p className="text-[0.68rem] text-ink-400 mt-1">{dep.occupancy_pct}% full</p>
      </div>

      <div className="ml-auto">
        {sold ? (
          <span className="text-xs text-ink-400 font-medium">Sold out</span>
        ) : signedIn ? (
          <button onClick={() => onBook(dep)} className="btn-primary !py-2">Select</button>
        ) : (
          <Link to="/login" className="btn-ghost !py-2">Sign in to book</Link>
        )}
      </div>
    </div>
  );
}

export default function PackageDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [pkg, setPkg] = useState(null);
  const [deps, setDeps] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('itinerary');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.get(`/packages/${id}`), api.get(`/departures${qs({ packageId: id })}`)])
      .then(([p, d]) => { if (!cancelled) { setPkg(p); setDeps(d); } })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="mx-auto max-w-6xl px-4"><Spinner label="Loading package" /></div>;
  if (error) return <div className="mx-auto max-w-6xl px-4 py-10"><ErrorNote error={error} /></div>;

  const p = pkg.package;
  const days = [...new Set(pkg.itinerary.map((a) => a.day_number))].sort((a, b) => a - b);
  const departures = deps?.departures ?? [];
  const bookable = departures.filter((d) => d.available_seats > 0);

  return (
    <>
      <section className={`relative h-56 sm:h-72 ph-${p.category ?? 'default'}`}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 h-full flex flex-col justify-end pb-6">
          <div className="mb-2"><CategoryBadge category={p.category} /></div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">{p.title}</h1>
          <p className="mt-2 text-white/85 text-sm">
            {p.duration_days} days / {p.duration_nights} nights · max group {p.max_group_size} ·{' '}
            {pkg.destinations.map((d) => d.name).join(' → ')}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <Crumbs items={[{ label: 'Packages', to: '/' }, { label: p.category }, { label: p.title }]} />

        <div className="grid gap-8 lg:grid-cols-[1fr,22rem]">
          {/* ---------- left: description and tabs ---------- */}
          <div>
            {p.description && <p className="text-sm text-ink-600 leading-relaxed">{p.description}</p>}

            <div className="mt-6 border-b border-ink-200 flex gap-1">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    tab === t.id ? 'border-ocean-600 text-ocean-800' : 'border-transparent text-ink-500 hover:text-ink-800'
                  }`}>
                  {t.label}
                  <span className="ml-1.5 text-xs text-ink-400">
                    {t.id === 'itinerary' ? days.length : t.id === 'hotels' ? pkg.hotels.length : pkg.destinations.length}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5">
              {tab === 'itinerary' && (
                <ol className="space-y-5">
                  {days.map((day) => (
                    <li key={day} className="flex gap-4">
                      <div className="shrink-0 flex flex-col items-center">
                        <span className="h-8 w-8 rounded-full bg-ocean-600 text-white text-xs font-bold grid place-items-center">
                          {day}
                        </span>
                        {day !== days[days.length - 1] && <span className="w-px flex-1 bg-ink-200 mt-1" />}
                      </div>
                      <div className="pb-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Day {day}</p>
                        <ul className="mt-1.5 space-y-1.5">
                          {pkg.itinerary.filter((a) => a.day_number === day).map((a, i) => (
                            <li key={i} className="text-sm">
                              <span className="chip bg-ink-100 text-ink-600 mr-2">{a.time_slot}</span>
                              <span className="text-ink-800">{a.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {tab === 'hotels' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {pkg.hotels.map((h) => (
                    <div key={h.hotel_id} className="card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-ink-900 text-sm">{h.name}</p>
                        <span className="text-sand-500 text-xs shrink-0">{'★'.repeat(h.star_rating)}</span>
                      </div>
                      <p className="text-xs text-ink-500 mt-1">{h.destination}</p>
                      <p className="text-sm font-medium text-ocean-800 mt-2">{inr(h.price_per_night)} / night</p>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'destinations' && (
                <div className="space-y-3">
                  {pkg.destinations.map((d, i) => (
                    <div key={i} className="card p-4 flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-lg shrink-0 ph-${d.category ?? 'default'}`} />
                      <div>
                        <p className="font-semibold text-ink-900 text-sm">{d.name}</p>
                        <p className="text-xs text-ink-500">
                          {d.state} · arrives day {d.day_number}
                          {d.nights_stay ? ` · ${d.nights_stay} night${d.nights_stay > 1 ? 's' : ''}` : ''}
                        </p>
                      </div>
                      {d.best_season && (
                        <span className="chip bg-ocean-50 text-ocean-700 ml-auto">{d.best_season}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ---------- right: departures ---------- */}
          <aside>
            <div className="card p-4 lg:sticky lg:top-20">
              <h2 className="font-bold text-ink-900">Choose a departure</h2>
              <p className="text-xs text-ink-500 mt-1">
                Price and seats belong to the departure, not the package — the same tour on a
                different date is priced separately.
              </p>

              <div className="mt-4 space-y-2 max-h-[26rem] overflow-y-auto pr-1">
                {departures.length === 0 ? (
                  <p className="text-sm text-ink-500 py-6 text-center">No upcoming departures.</p>
                ) : departures.map((d) => (
                  <DepartureRow key={d.departure_id} dep={d} signedIn={Boolean(user)}
                    onBook={(dep) => navigate(`/book/${dep.departure_id}`)} />
                ))}
              </div>

              {bookable.length > 0 && (
                <p className="mt-3 text-[0.7rem] text-ink-400 border-t border-ink-100 pt-3">
                  {bookable.length} of {departures.length} departures still have seats.
                </p>
              )}
            </div>
          </aside>
        </div>

        <QueryTrace
          trace={[...(pkg.trace ?? []), deps?.trace]}
          label="SQL behind this package (one statement per section)"
        />
      </section>
    </>
  );
}
