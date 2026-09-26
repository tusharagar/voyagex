/**
 * Catalogue — hero search and the package grid.
 * Phase 7 · SRS FR-06, FR-08, FR-24 · UC-03 · wireframes/02_catalogue.svg
 */

import { useEffect, useState } from 'react';
import { api, qs } from '../api/client.js';
import QueryTrace from '../components/QueryTrace.jsx';
import PackageCard from '../components/PackageCard.jsx';
import { Spinner, ErrorNote, EmptyState } from '../components/ui.jsx';

const CATEGORIES = ['Hill', 'Beach', 'Heritage', 'Pilgrimage', 'Wildlife', 'Urban'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const BLANK = { destination: '', category: '', month: '', maxPrice: '', minDays: '', maxDays: '' };

export default function Catalogue() {
  // Draft is what the user is typing; `filters` is what has been submitted.
  // Keeping them apart means the catalogue does not re-query on every keystroke
  // and the trace panel shows the query that produced what is on screen.
  const [draft, setDraft] = useState(BLANK);
  const [filters, setFilters] = useState(BLANK);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.get(`/packages${qs(filters)}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters]);

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const submit = (e) => { e.preventDefault(); setFilters(draft); };
  const clear = () => { setDraft(BLANK); setFilters(BLANK); };

  const packages = data?.packages ?? [];
  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <>
      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden bg-ocean-900">
        <div className="absolute inset-0 opacity-70 ph-Hill" />
        <div className="absolute inset-0 bg-gradient-to-br from-ocean-900/90 via-ocean-900/70 to-ocean-800/40" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <p className="text-ocean-200 text-xs font-semibold uppercase tracking-[0.18em]">
            Curated tours across India
          </p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-bold text-white tracking-tight max-w-2xl">
            Find a trip with seats that are
            <span className="text-sand-300"> actually still there</span>.
          </h1>
          <p className="mt-4 text-ocean-100/90 max-w-xl text-sm sm:text-base">
            Every departure shows live availability, held under a database lock at the
            moment you book — so two people can never take the same last seat.
          </p>

          {/* ---------- search ---------- */}
          <form onSubmit={submit} className="mt-8 rounded-xl2 bg-white shadow-lift p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="label" htmlFor="destination">Where to</label>
                <input id="destination" className="field" placeholder="Manali, Jaipur, Goa…"
                       value={draft.destination} onChange={set('destination')} />
              </div>
              <div>
                <label className="label" htmlFor="category">Type of trip</label>
                <select id="category" className="field" value={draft.category} onChange={set('category')}>
                  <option value="">Any</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="month">Month</label>
                <select id="month" className="field" value={draft.month} onChange={set('month')}>
                  <option value="">Any</option>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
              <div>
                <label className="label" htmlFor="maxPrice">Max price per seat</label>
                <input id="maxPrice" type="number" min="0" step="1000" className="field"
                       placeholder="₹ any" value={draft.maxPrice} onChange={set('maxPrice')} />
              </div>
              <div>
                <label className="label" htmlFor="minDays">Min nights</label>
                <input id="minDays" type="number" min="1" className="field" placeholder="any"
                       value={draft.minDays} onChange={set('minDays')} />
              </div>
              <div>
                <label className="label" htmlFor="maxDays">Max nights</label>
                <input id="maxDays" type="number" min="1" className="field" placeholder="any"
                       value={draft.maxDays} onChange={set('maxDays')} />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1">Search</button>
                {activeCount > 0 && (
                  <button type="button" onClick={clear} className="btn-ghost">Clear</button>
                )}
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* ---------- results ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
          <h2 className="text-xl font-bold text-ink-900">
            {loading ? 'Searching…' : `${packages.length} ${packages.length === 1 ? 'package' : 'packages'}`}
            {activeCount > 0 && !loading && (
              <span className="ml-2 text-sm font-normal text-ink-500">matching your filters</span>
            )}
          </h2>
          {data?.filters?.applied?.length > 0 && (
            <p className="text-xs text-ink-500">
              filters applied: <span className="font-mono text-ocean-700">{data.filters.applied.join(', ')}</span>
            </p>
          )}
        </div>

        {/* Unknown filter keys are reported rather than silently dropped, so a
            mistyped filter name is visible instead of quietly returning
            everything (NFR-04). */}
        {data?.filters?.ignored?.length > 0 && (
          <div className="mb-5 rounded-lg bg-sand-50 ring-1 ring-sand-200 p-3">
            <p className="text-xs text-sand-800">
              <strong>Ignored unknown filter(s):</strong>{' '}
              <span className="font-mono">{data.filters.ignored.join(', ')}</span> — these were not in
              the server's whitelist, so they contributed nothing to the SQL.
            </p>
          </div>
        )}

        <ErrorNote error={error} onRetry={() => setFilters({ ...filters })} />

        {loading ? (
          <Spinner label="Querying the catalogue" />
        ) : packages.length === 0 && !error ? (
          <EmptyState
            title="No packages match those filters"
            action={<button onClick={clear} className="btn-primary">Clear filters</button>}
          >
            The query ran and returned zero rows — expand the SQL below to see exactly what was asked.
          </EmptyState>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((p) => <PackageCard key={p.package_id} pkg={p} />)}
          </div>
        )}

        <QueryTrace trace={data?.trace} label="SQL behind these results" />
      </section>
    </>
  );
}
