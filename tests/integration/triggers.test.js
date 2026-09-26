/**
 * TC-T — the four triggers, verified by their effects on the database.
 * Phase 8 · SRS FR-13, FR-18, FR-20, FR-21, FR-28 · brief §12.2
 */
import { describe, it, expect } from 'vitest';
import { admin, getSeats, countRows } from '../setup.js';

const DEP_ROOMY = 1, DEP_PAST = 5;
const CUST_A = 1, TRAV_A1 = 1;

describe('trg_booking_audit', () => {
  it('TC-T-01 writes an audit row on a status change, with no application insert', async () => {
    const { rows } = await admin.query(
      'SELECT book_package($1,$2,$3) AS id', [CUST_A, DEP_ROOMY, [TRAV_A1]]);
    const id = rows[0].id;

    const before = await countRows('booking_audit', 'booking_id = $1', [id]);
    await admin.query("UPDATE booking SET status = 'COMPLETED' WHERE booking_id = $1", [id]);

    const { rows: audit } = await admin.query(
      'SELECT old_status, new_status FROM booking_audit WHERE booking_id = $1 ORDER BY audit_id DESC LIMIT 1',
      [id]);
    expect(await countRows('booking_audit', 'booking_id = $1', [id])).toBe(before + 1);
    expect(audit[0]).toMatchObject({ old_status: 'CONFIRMED', new_status: 'COMPLETED' });
  });

  it('TC-T-01b writes NOTHING when a non-status column changes', async () => {
    const { rows } = await admin.query(
      'SELECT book_package($1,$2,$3) AS id', [CUST_A, DEP_ROOMY, [TRAV_A1]]);
    const before = await countRows('booking_audit');
    await admin.query(
      "UPDATE booking SET special_requests = 'window seat' WHERE booking_id = $1", [rows[0].id]);
    expect(await countRows('booking_audit')).toBe(before);
  });

  it('TC-T-01c attributes the change to the actor published by the API', async () => {
    const c = await admin.connect();
    try {
      const { rows } = await c.query('SELECT book_package($1,$2,$3) AS id', [CUST_A, DEP_ROOMY, [TRAV_A1]]);
      await c.query('BEGIN');
      // SET LOCAL, exactly as withTransaction() does it.
      await c.query("SELECT set_config('voyagex.actor_user_id', '3', true)");
      await c.query("UPDATE booking SET status = 'COMPLETED' WHERE booking_id = $1", [rows[0].id]);
      await c.query('COMMIT');

      const { rows: a } = await c.query(
        'SELECT changed_by FROM booking_audit WHERE booking_id = $1 ORDER BY audit_id DESC LIMIT 1',
        [rows[0].id]);
      expect(a[0].changed_by).toBe(3);
    } finally { c.release(); }
  });

  it('TC-T-01d records an unattributed change rather than refusing it', async () => {
    // A direct psql write has no actor. An audit trail that logs nothing it
    // cannot fully attribute logs nothing at all.
    const { rows } = await admin.query('SELECT book_package($1,$2,$3) AS id', [CUST_A, DEP_ROOMY, [TRAV_A1]]);
    await admin.query("UPDATE booking SET status = 'CANCELLED' WHERE booking_id = $1", [rows[0].id]);
    const { rows: a } = await admin.query(
      'SELECT changed_by FROM booking_audit WHERE booking_id = $1 ORDER BY audit_id DESC LIMIT 1', [rows[0].id]);
    expect(a[0].changed_by).toBeNull();
  });
});

describe('trg_guide_no_overlap', () => {
  it('TC-T-02 refuses a guide assignment overlapping another for the same guide', async () => {
    // Guide 1 already holds departure 1 (CURRENT_DATE+60 → +65) from the fixture.
    // Departure 2 is +40 → +45, so create an overlapping one to collide with.
    const { rows } = await admin.query(
      `INSERT INTO departure (package_id, start_date, end_date, total_seats, available_seats, price)
       VALUES (1, CURRENT_DATE + 62, CURRENT_DATE + 67, 10, 10, 20000) RETURNING departure_id`);
    await expect(
      admin.query('INSERT INTO guide_assignment (guide_id, departure_id) VALUES (1, $1)', [rows[0].departure_id]),
    ).rejects.toThrow(/GUIDE_DOUBLE_BOOKED/);
  });

  it('TC-T-02b accepts a non-overlapping assignment for the same guide', async () => {
    const { rows } = await admin.query(
      `INSERT INTO departure (package_id, start_date, end_date, total_seats, available_seats, price)
       VALUES (1, CURRENT_DATE + 200, CURRENT_DATE + 205, 10, 10, 20000) RETURNING departure_id`);
    await expect(
      admin.query('INSERT INTO guide_assignment (guide_id, departure_id) VALUES (1, $1)', [rows[0].departure_id]),
    ).resolves.toBeTruthy();
  });

  it('TC-T-02c treats touching date ranges as overlapping', async () => {
    // Departure 1 ends CURRENT_DATE+65. A tour starting that same day would put
    // the guide in two places at once, so the inclusive range must reject it.
    const { rows } = await admin.query(
      `INSERT INTO departure (package_id, start_date, end_date, total_seats, available_seats, price)
       VALUES (1, CURRENT_DATE + 65, CURRENT_DATE + 70, 10, 10, 20000) RETURNING departure_id`);
    await expect(
      admin.query('INSERT INTO guide_assignment (guide_id, departure_id) VALUES (1, $1)', [rows[0].departure_id]),
    ).rejects.toThrow(/GUIDE_DOUBLE_BOOKED/);
  });
});

describe('seat constraints', () => {
  it('TC-T-03 a negative seat count is blocked by the CHECK constraint', async () => {
    await expect(
      admin.query('UPDATE departure SET available_seats = -1 WHERE departure_id = $1', [DEP_ROOMY]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'chk_departure_seats_non_negative' });
  });

  it('TC-T-03b seats above the total are blocked too', async () => {
    await expect(
      admin.query('UPDATE departure SET available_seats = 999 WHERE departure_id = $1', [DEP_ROOMY]),
    ).rejects.toMatchObject({ constraint: 'chk_departure_seats_within_total' });
  });
});

describe('trg_review_valid', () => {
  it('TC-T-04 refuses a review of a booking that is not COMPLETED', async () => {
    const { rows } = await admin.query('SELECT book_package($1,$2,$3) AS id', [CUST_A, DEP_ROOMY, [TRAV_A1]]);
    await expect(
      admin.query('INSERT INTO review (booking_id, rating) VALUES ($1, 5)', [rows[0].id]),
    ).rejects.toThrow(/BOOKING_NOT_COMPLETED/);
  });

  it('TC-T-04b refuses a review by someone other than the booking customer', async () => {
    const { rows } = await admin.query(
      'SELECT booking_id FROM booking WHERE departure_id = $1 LIMIT 1', [DEP_PAST]);
    await expect(
      admin.query('INSERT INTO review (booking_id, customer_id, rating) VALUES ($1, 2, 1)', [rows[0].booking_id]),
    ).rejects.toThrow(/REVIEWER_NOT_BOOKING_OWNER/);
  });

  it('TC-T-04c fills customer_id in from the booking when omitted', async () => {
    const { rows } = await admin.query(
      'SELECT booking_id, customer_id FROM booking WHERE departure_id = $1 LIMIT 1', [DEP_PAST]);
    await admin.query('INSERT INTO review (booking_id, rating) VALUES ($1, 5)', [rows[0].booking_id]);
    const { rows: r } = await admin.query(
      'SELECT customer_id FROM review WHERE booking_id = $1', [rows[0].booking_id]);
    expect(r[0].customer_id).toBe(rows[0].customer_id);
  });

  it('TC-T-04d still allows only one review per booking', async () => {
    const { rows } = await admin.query(
      'SELECT booking_id FROM booking WHERE departure_id = $1 LIMIT 1', [DEP_PAST]);
    await admin.query('INSERT INTO review (booking_id, rating) VALUES ($1, 5)', [rows[0].booking_id]);
    await expect(
      admin.query('INSERT INTO review (booking_id, rating) VALUES ($1, 3)', [rows[0].booking_id]),
    ).rejects.toMatchObject({ code: '23505', constraint: 'uq_review_booking_id' });
  });
});
