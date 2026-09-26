/**
 * MyBookings — list, detail, payments, balance due and cancellation.
 * Phase 7 · SRS FR-14, FR-18, FR-24 · UC-08, UC-10 · wireframes/05_my_bookings.svg
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, inr, shortDate } from '../api/client.js';
import QueryTrace from '../components/QueryTrace.jsx';
import { Spinner, ErrorNote, EmptyState, StatusBadge } from '../components/ui.jsx';

function CancelDialog({ booking, detail, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const days = detail?.booking?.days_until_departure;
  const refund = detail?.refundIfCancelledNow;
  const paid = detail?.booking?.amount_paid ?? 0;
  const tier = days > 30 ? '100%' : days >= 15 ? '50%' : days >= 7 ? '25%' : '0%';

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const d = await api.patch(`/bookings/${booking.booking_id}/cancel`, { reason });
      onDone(d);
    } catch (err) {
      setError(err);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/40 p-4" role="dialog" aria-modal="true">
      <div className="card w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-ink-900">Cancel booking #{booking.booking_id}?</h2>
        <p className="text-sm text-ink-500 mt-1">{booking.package_title}</p>

        <div className="mt-4 rounded-lg bg-ink-50 ring-1 ring-ink-200 p-3 text-sm space-y-1.5">
          <div className="flex justify-between"><span className="text-ink-500">Days before departure</span><span className="font-medium">{days}</span></div>
          <div className="flex justify-between"><span className="text-ink-500">Refund tier</span><span className="font-medium">{tier}</span></div>
          <div className="flex justify-between"><span className="text-ink-500">Paid so far</span><span className="font-medium">{inr(paid)}</span></div>
          <div className="flex justify-between border-t border-ink-200 pt-1.5">
            <span className="text-ink-700 font-medium">You would receive</span>
            <span className="font-bold text-ocean-800">{inr(refund)}</span>
          </div>
        </div>
        <p className="mt-2 text-[0.7rem] text-ink-400">
          The seats return to the departure immediately, released by a database trigger.
        </p>

        <form onSubmit={submit} className="mt-4">
          <label className="label" htmlFor="reason">Reason (required)</label>
          <input id="reason" required className="field" value={reason} onChange={(e) => setReason(e.target.value)}
                 placeholder="Change of plans" />
          {error && <div className="mt-3"><ErrorNote error={error} /></div>}
          <div className="mt-4 flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-ghost">Keep it</button>
            <button type="submit" className="btn-danger" disabled={busy || !reason.trim()}>
              {busy ? 'Cancelling…' : 'Cancel booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BookingRow({ booking, expanded, onToggle }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [cancelTrace, setCancelTrace] = useState(null);

  useEffect(() => {
    if (!expanded || detail) return;
    setLoading(true);
    api.get(`/bookings/${booking.booking_id}`)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [expanded, booking.booking_id, detail]);

  const refresh = () =>
    api.get(`/bookings/${booking.booking_id}`).then(setDetail).catch(() => {});

  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} className="w-full text-left p-4 hover:bg-ink-50/60 transition-colors">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-ink-400">#{booking.booking_id}</span>
          <span className="font-semibold text-ink-900">{booking.package_title}</span>
          <StatusBadge status={booking.status} />
          <span className="ml-auto text-xs text-ocean-700 font-semibold">
            {expanded ? 'Collapse' : 'Expand'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500">
          <span>{shortDate(booking.start_date)} → {shortDate(booking.end_date)}</span>
          <span>{booking.num_travellers} traveller{booking.num_travellers > 1 ? 's' : ''}</span>
          <span>booked {shortDate(booking.booking_date)} {booking.booked_online ? '(online)' : '(by agent)'}</span>
          <span className="font-medium text-ink-700">Total {inr(booking.total_amount)}</span>
          {Number(booking.balance_due) > 0 && (
            <span className="font-medium text-sand-700">Balance {inr(booking.balance_due)}</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-ink-100 p-4">
          {loading && <Spinner label="Loading booking" />}
          {detail && (
            <>
              <div className="grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="label">Travellers</p>
                  <ul className="space-y-1">
                    {detail.travellers.map((t) => (
                      <li key={t.traveller_id} className="text-sm text-ink-800">
                        {t.full_name}
                        {t.seat_no && <span className="ml-2 chip bg-ink-100 text-ink-600">seat {t.seat_no}</span>}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="label">Payments</p>
                  {detail.payments.length === 0 ? (
                    <p className="text-sm text-ink-400 italic">none recorded</p>
                  ) : (
                    <ul className="space-y-1">
                      {detail.payments.map((p) => (
                        <li key={p.payment_id} className="text-sm flex items-center gap-2">
                          <span className="text-ink-800">{inr(p.amount)}</span>
                          <span className="text-xs text-ink-400">{p.mode ?? '—'}</span>
                          <span className={`chip ${
                            p.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700'
                            : p.status === 'REFUNDED' ? 'bg-ocean-50 text-ocean-700'
                            : 'bg-sand-100 text-sand-800'}`}>{p.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-lg bg-ink-50 ring-1 ring-ink-200 p-3 text-sm space-y-1.5">
                  <div className="flex justify-between"><span className="text-ink-500">Total</span><span className="font-medium">{inr(detail.booking.total_amount)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">Paid</span><span className="font-medium">{inr(detail.booking.amount_paid)}</span></div>
                  <div className="flex justify-between border-t border-ink-200 pt-1.5">
                    <span className="text-ink-700 font-medium">Balance due</span>
                    <span className="font-bold text-ocean-800">{inr(detail.booking.balance_due)}</span>
                  </div>
                  <p className="text-[0.68rem] text-ink-400 pt-1">
                    Derived from the payment rows — never stored on the booking.
                  </p>
                </div>
              </div>

              {detail.cancellation && (
                <div className="mt-4 rounded-lg bg-red-50 ring-1 ring-red-200 p-3 text-sm">
                  <p className="font-semibold text-red-900">
                    Cancelled {shortDate(detail.cancellation.cancelled_on)} — {detail.cancellation.reason}
                  </p>
                  <p className="text-red-800/80 mt-0.5">
                    Refund {inr(detail.cancellation.refund_amount)} · penalty {inr(detail.cancellation.penalty_amount)}
                  </p>
                </div>
              )}

              {detail.booking.status === 'CONFIRMED' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => setDialog(true)} className="btn-danger">Cancel booking</button>
                  <span className="self-center text-xs text-ink-400">
                    {detail.booking.days_until_departure} days before departure ·
                    refund would be {inr(detail.refundIfCancelledNow)}
                  </span>
                </div>
              )}

              <QueryTrace trace={[...(detail.trace ?? []), ...(cancelTrace ?? [])]}
                          label={`SQL behind booking #${booking.booking_id}`} />
            </>
          )}
        </div>
      )}

      {dialog && detail && (
        <CancelDialog
          booking={booking} detail={detail}
          onClose={() => setDialog(false)}
          onDone={(d) => { setDialog(false); setCancelTrace(d.trace); refresh(); }}
        />
      )}
    </div>
  );
}

export default function MyBookings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/bookings').then(setData).catch(setError).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const bookings = data?.bookings ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold text-ink-900">My bookings</h1>
      <p className="text-sm text-ink-500 mt-1">
        Expand a booking to see travellers, payments and the balance still owed.
      </p>

      <div className="mt-6 space-y-3">
        <ErrorNote error={error} onRetry={load} />
        {loading ? (
          <Spinner label="Loading your bookings" />
        ) : bookings.length === 0 ? (
          <EmptyState title="No bookings yet"
            action={<Link to="/" className="btn-primary">Browse packages</Link>}>
            When you book a departure it will appear here, with its payments and balance.
          </EmptyState>
        ) : (
          bookings.map((b) => (
            <BookingRow key={b.booking_id} booking={b}
              expanded={open === b.booking_id}
              onToggle={() => setOpen(open === b.booking_id ? null : b.booking_id)} />
          ))
        )}
      </div>

      <QueryTrace trace={data?.trace} label="SQL behind this list" />
    </div>
  );
}
