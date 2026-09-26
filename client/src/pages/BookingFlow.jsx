/**
 * BookingFlow — pick travellers, confirm, and handle the failure paths.
 * Phase 7 · SRS FR-10 … FR-13, FR-24 · UC-07 · wireframes/04_booking_flow.svg
 *
 * The insufficient-seats state is given the same care as the success state.
 * It is not an edge case here: it is where the concurrency design becomes
 * visible to a user, and the wireframe drew both side by side for that reason.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, inr, shortDate } from '../api/client.js';
import QueryTrace from '../components/QueryTrace.jsx';
import { Spinner, ErrorNote, SeatsBadge, Crumbs } from '../components/ui.jsx';

function Stepper({ step }) {
  const steps = ['Departure', 'Travellers', 'Confirm'];
  return (
    <ol className="flex items-center gap-2 mb-6">
      {steps.map((s, i) => {
        const n = i + 1;
        const done = n < step;
        const now = n === step;
        return (
          <li key={s} className="flex items-center gap-2">
            <span className={`h-7 w-7 rounded-full grid place-items-center text-xs font-bold ${
              done ? 'bg-ocean-600 text-white' : now ? 'bg-ocean-600 text-white ring-4 ring-ocean-100' : 'bg-ink-200 text-ink-500'
            }`}>{done ? '✓' : n}</span>
            <span className={`text-sm ${now ? 'font-semibold text-ink-900' : 'text-ink-500'}`}>{s}</span>
            {i < steps.length - 1 && <span className="w-8 h-px bg-ink-200 mx-1" />}
          </li>
        );
      })}
    </ol>
  );
}

export default function BookingFlow() {
  const { departureId } = useParams();
  const navigate = useNavigate();

  const [dep, setDep] = useState(null);
  const [travellers, setTravellers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);

  // inline "add a traveller" so the flow is not a dead end for a new account
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get(`/departures/${departureId}`), api.get('/travellers')])
      .then(([d, t]) => {
        if (cancelled) return;
        setDep(d);
        setTravellers(t.travellers);
        // Most bookings are the whole household, so preselect everyone and let
        // the user remove rather than start from nothing.
        setSelected(t.travellers.map((x) => x.traveller_id));
      })
      .catch((e) => { if (!cancelled) setLoadError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [departureId]);

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function addTraveller(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const d = await api.post('/travellers', { fullName: newName.trim() });
      setTravellers((t) => [...t, d.traveller]);
      setSelected((s) => [...s, d.traveller.traveller_id]);
      setNewName('');
    } catch (err) {
      setFailure(err);
    } finally {
      setAdding(false);
    }
  }

  async function confirm() {
    setSubmitting(true);
    setFailure(null);
    try {
      const d = await api.post('/bookings', {
        departureId: Number(departureId),
        travellerIds: selected,
      });
      setResult(d);
    } catch (err) {
      setFailure(err);
      // Re-read availability: losing a race means the number on screen is
      // already stale, and showing the stale one invites a second failure.
      api.get(`/departures/${departureId}`).then(setDep).catch(() => {});
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-4xl px-4"><Spinner label="Loading departure" /></div>;
  if (loadError) return <div className="mx-auto max-w-4xl px-4 py-10"><ErrorNote error={loadError} /></div>;

  const d = dep.departure;
  const total = Number(d.price) * selected.length;

  /* ---------------- success ---------------- */
  if (result) {
    const b = result.booking;
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="card overflow-hidden">
          <div className="bg-emerald-50 border-b border-emerald-200 p-6 flex items-start gap-4">
            <span className="h-10 w-10 rounded-full bg-emerald-600 text-white grid place-items-center text-lg shrink-0">✓</span>
            <div>
              <h1 className="text-xl font-bold text-emerald-900">Booking confirmed</h1>
              <p className="text-sm text-emerald-800/80 mt-0.5">
                Reference <span className="font-mono font-semibold">#{result.bookingId}</span>
              </p>
            </div>
          </div>
          <div className="p-6 grid gap-4 sm:grid-cols-2">
            <Detail label="Package" value={b.package_title} />
            <Detail label="Departs" value={`${shortDate(b.start_date)} → ${shortDate(b.end_date)}`} />
            <Detail label="Travellers" value={b.num_travellers} />
            <Detail label="Total" value={inr(b.total_amount)} strong />
            <Detail label="Status" value={b.status} />
            <Detail label="Seats now left on this departure" value={b.available_seats} />
          </div>
          <div className="px-6 pb-6 flex flex-wrap gap-2">
            <Link to="/bookings" className="btn-primary">View my bookings</Link>
            <Link to="/" className="btn-ghost">Browse more packages</Link>
          </div>
        </div>

        <p className="mt-4 text-xs text-ink-500">
          A pending payment for the full amount was raised by the same stored procedure, inside
          the same transaction. The seat count above was decremented by a trigger, not by this page.
        </p>

        <QueryTrace trace={result.trace} label="SQL that created this booking" />
      </div>
    );
  }

  /* ---------------- form ---------------- */
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Crumbs items={[
        { label: 'Packages', to: '/' },
        { label: d.package_title, to: `/packages/${d.package_id}` },
        { label: 'Book' },
      ]} />
      <Stepper step={2} />

      <div className="grid gap-6 lg:grid-cols-[1fr,18rem]">
        <div>
          {/* chosen departure */}
          <div className="card p-4 flex flex-wrap items-center gap-4">
            <div>
              <p className="font-semibold text-ink-900">{d.package_title}</p>
              <p className="text-xs text-ink-500 mt-0.5">
                {shortDate(d.start_date)} → {shortDate(d.end_date)} · {inr(d.price)} per seat
              </p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <SeatsBadge seats={d.available_seats} total={d.total_seats} />
              <Link to={`/packages/${d.package_id}`} className="text-xs text-ocean-700 hover:underline">Change</Link>
            </div>
          </div>

          {/* travellers */}
          <h2 className="mt-6 font-bold text-ink-900">Who is travelling?</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            One seat is taken per traveller. You may only book travellers on your own account —
            the database enforces that too.
          </p>

          <div className="mt-3 space-y-2">
            {travellers.length === 0 && (
              <p className="text-sm text-ink-500 py-3">
                No travellers on your account yet — add one below.
              </p>
            )}
            {travellers.map((t) => {
              const on = selected.includes(t.traveller_id);
              return (
                <label key={t.traveller_id}
                  className={`flex items-center gap-3 rounded-lg p-3 cursor-pointer ring-1 transition-colors ${
                    on ? 'ring-ocean-400 bg-ocean-50/50' : 'ring-ink-200 bg-white hover:bg-ink-50'
                  }`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(t.traveller_id)}
                         className="h-4 w-4 rounded border-ink-300 text-ocean-600 focus:ring-ocean-500" />
                  <div>
                    <p className="text-sm font-medium text-ink-900">{t.full_name}</p>
                    <p className="text-xs text-ink-500">
                      {t.relation_to_customer ?? 'Traveller'}
                      {t.date_of_birth ? ` · born ${shortDate(t.date_of_birth)}` : ''}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <form onSubmit={addTraveller} className="mt-3 flex gap-2">
            <input className="field flex-1" placeholder="Add another traveller by name"
                   value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button type="submit" className="btn-ghost" disabled={adding || !newName.trim()}>
              {adding ? 'Adding…' : 'Add'}
            </button>
          </form>
        </div>

        {/* summary */}
        <aside>
          <div className="card p-4 lg:sticky lg:top-20">
            <h2 className="font-bold text-ink-900">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Seats requested" value={selected.length} />
              <Row label="Price per seat" value={inr(d.price)} />
              <div className="border-t border-ink-100 pt-2 mt-2">
                <Row label="Total" value={inr(total)} strong />
              </div>
            </dl>
            <p className="mt-2 text-[0.7rem] text-ink-400">
              A pending payment for the full amount is created with the booking.
            </p>

            <button onClick={confirm} disabled={submitting || selected.length === 0}
                    className="btn-primary w-full mt-4">
              {submitting ? 'Confirming…' : `Confirm booking${selected.length ? ` · ${inr(total)}` : ''}`}
            </button>

            {selected.length === 0 && (
              <p className="mt-2 text-xs text-ink-500 text-center">Select at least one traveller.</p>
            )}
          </div>
        </aside>
      </div>

      {/* failure — deliberately as prominent as the success state */}
      {failure && (
        <div className="mt-6 rounded-xl2 bg-red-50 ring-1 ring-red-200 overflow-hidden" role="alert">
          <div className="p-5 flex items-start gap-4">
            <span className="h-9 w-9 rounded-full bg-red-600 text-white grid place-items-center shrink-0">!</span>
            <div className="min-w-0">
              <h2 className="font-bold text-red-900">
                {failure.code === 'INSUFFICIENT_SEATS' ? 'Not enough seats' : 'Booking not completed'}
              </h2>
              <p className="text-sm text-red-800 mt-1">{failure.message}</p>
              {failure.detail && (
                <p className="mt-2 text-xs font-mono text-red-700/80 break-words">{failure.detail}</p>
              )}
              <p className="mt-3 text-sm text-red-900/80">
                <strong>Nothing was booked and you have not been charged.</strong>{' '}
                The whole attempt ran in one transaction, so it left no partial record behind.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/packages/${d.package_id}`} className="btn-ghost !py-2">Choose another date</Link>
                {failure.code === 'INSUFFICIENT_SEATS' && d.available_seats > 0 && (
                  <button onClick={() => { setSelected(selected.slice(0, d.available_seats)); setFailure(null); }}
                          className="btn-primary !py-2">
                    Book {d.available_seats} instead
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <QueryTrace trace={dep.trace} label="SQL behind this departure" />
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className={strong ? 'text-base font-bold text-ocean-800' : 'font-medium text-ink-900'}>{value}</dd>
    </div>
  );
}

function Detail({ label, value, strong }) {
  return (
    <div>
      <p className="label mb-0.5">{label}</p>
      <p className={strong ? 'text-lg font-bold text-ocean-800' : 'text-sm font-medium text-ink-900'}>{value}</p>
    </div>
  );
}
