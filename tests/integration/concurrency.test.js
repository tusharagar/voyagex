/**
 * TC-C-01 — two clients, one seat.
 *
 * Phase 8 · SRS FR-12, NFR-02 · use_cases.md UC-07 exception flow E2
 *            ADR-02, ADR-05 · docs/concurrency_demo.md
 *
 * THIS IS THE MOST IMPORTANT TEST IN THE PROJECT.
 *
 * Everything else verifies that the system does what it says. This one verifies
 * the single property the whole architecture was arranged to guarantee: that
 * two customers reaching for the last seat at the same moment produce exactly
 * one booking, and that available_seats lands on 0 rather than -1.
 *
 * The mechanism under test is `SELECT ... FOR UPDATE` inside book_package. The
 * loser does not fail because it was "slower" in wall-clock terms — it blocks
 * on the winner's row lock, and on waking re-reads the row under READ
 * COMMITTED, finding the seat gone.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { admin, roleClient, getSeats, countRows } from '../setup.js';

const DEP_ONE = 3;   // the fixture guarantees this departure has exactly ONE seat
const CUST_A = 1, TRAV_A = 1;
const CUST_B = 2, TRAV_B = 4;

/** Two independent connections, so the contention is genuine and not simulated. */
async function twoClients() {
  const a = roleClient('app_dbadmin');
  const b = roleClient('app_dbadmin');
  await a.connect();
  await b.connect();
  return [a, b];
}

let open = [];
afterEach(async () => {
  await Promise.allSettled(open.map((c) => c.end()));
  open = [];
});

describe('concurrent booking of the last seat', () => {
  it('TC-C-01 exactly one of two simultaneous bookings succeeds', async () => {
    expect((await getSeats(DEP_ONE)).available_seats).toBe(1);

    const [ca, cb] = await twoClients();
    open = [ca, cb];

    // Both statements are issued before either is awaited, so the two
    // transactions are genuinely in flight together.
    const results = await Promise.allSettled([
      ca.query('SELECT book_package($1,$2,$3) AS id', [CUST_A, DEP_ONE, [TRAV_A]]),
      cb.query('SELECT book_package($1,$2,$3) AS id', [CUST_B, DEP_ONE, [TRAV_B]]),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason.message).toMatch(/INSUFFICIENT_SEATS/);

    // Zero, never minus one.
    expect((await getSeats(DEP_ONE)).available_seats).toBe(0);
    expect(await countRows('booking', 'departure_id = $1', [DEP_ONE])).toBe(1);
  });

  it('TC-C-02 the loser BLOCKS on the row lock rather than racing', async () => {
    // The outcome above would also hold if the two calls merely happened to be
    // ordered. This test proves the lock is what decides it: the winner holds
    // an open transaction for a set time, and the loser's own duration has to
    // reflect the wait.
    const HOLD_MS = 1200;

    const [ca, cb] = await twoClients();
    open = [ca, cb];

    await ca.query('BEGIN');
    await ca.query('SELECT book_package($1,$2,$3) AS id', [CUST_A, DEP_ONE, [TRAV_A]]);
    // ca now holds the lock on departure 3 and has not committed.

    const startedAt = Date.now();
    const loser = cb.query('SELECT book_package($1,$2,$3) AS id', [CUST_B, DEP_ONE, [TRAV_B]])
      .then(() => ({ blockedFor: Date.now() - startedAt, error: null }))
      .catch((e) => ({ blockedFor: Date.now() - startedAt, error: e }));

    // Give the loser time to arrive at the lock and stop there.
    await new Promise((r) => setTimeout(r, HOLD_MS));
    await ca.query('COMMIT');

    const outcome = await loser;

    expect(outcome.error).toBeTruthy();
    expect(outcome.error.message).toMatch(/INSUFFICIENT_SEATS/);
    // It waited for the winner's commit. Without FOR UPDATE it would have read
    // a stale seat count immediately and returned in single-digit milliseconds.
    expect(outcome.blockedFor).toBeGreaterThanOrEqual(HOLD_MS * 0.8);

    expect((await getSeats(DEP_ONE)).available_seats).toBe(0);
    expect(await countRows('booking', 'departure_id = $1', [DEP_ONE])).toBe(1);
  });

  it('TC-C-03 five clients contending for one seat still yield exactly one booking', async () => {
    // Two is the demonstration; five is the check that nothing about the design
    // depends on there being only one competitor.
    const clients = await Promise.all(
      Array.from({ length: 5 }, async () => { const c = roleClient('app_dbadmin'); await c.connect(); return c; }),
    );
    open = clients;

    // Every caller uses customer 1's own traveller, so ownership is not what
    // decides the outcome — seat availability is.
    const results = await Promise.allSettled(
      clients.map((c) => c.query('SELECT book_package($1,$2,$3) AS id', [CUST_A, DEP_ONE, [TRAV_A]])),
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(4);
    expect((await getSeats(DEP_ONE)).available_seats).toBe(0);
    expect(await countRows('booking', 'departure_id = $1', [DEP_ONE])).toBe(1);
  });

  it('TC-C-04 the CHECK constraint stops a writer that bypasses the procedure', async () => {
    // book_package is where the decision is made, but it is not the only
    // protection. A direct INSERT skips it entirely; the seat trigger's UPDATE
    // still has to satisfy chk_departure_seats_non_negative.
    await admin.query('SELECT book_package($1,$2,$3)', [CUST_A, DEP_ONE, [TRAV_A]]);
    expect((await getSeats(DEP_ONE)).available_seats).toBe(0);

    await expect(admin.query(
      "INSERT INTO booking (customer_id, departure_id, num_travellers, total_amount, status) " +
      "VALUES ($1, $2, 1, 15000, 'CONFIRMED')", [CUST_B, DEP_ONE],
    )).rejects.toMatchObject({
      code: '23514',
      constraint: 'chk_departure_seats_non_negative',
    });

    // Aborted, so the count is untouched rather than corrupted.
    expect((await getSeats(DEP_ONE)).available_seats).toBe(0);
  });
});
