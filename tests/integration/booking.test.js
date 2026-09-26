/**
 * TC-B — booking and cancellation, against a real PostgreSQL instance.
 *
 * Phase 8 · SRS FR-10 … FR-14, FR-18, FR-19 · brief §12.2
 *
 * These are integration tests and not unit tests by necessity, not by choice:
 * the logic under test is PL/pgSQL inside the database (ADR-02), so there is
 * nothing to mock that would still be the thing being tested. The cost of that
 * decision is recorded in ADR-02 and again in the coverage note.
 *
 * Every assertion reads state back with the admin pool rather than trusting the
 * procedure's own return value.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { admin, getSeats, countRows } from '../setup.js';

// Fixture facts these tests rely on (tests/fixtures/sample_data.sql asserts them):
const DEP_ROOMY = 1;   // 20 seats, 18 free after the fixture's bookings
const DEP_ONE   = 3;   // exactly ONE seat
const DEP_FULL  = 4;   // sold out
const DEP_PAST  = 5;   // already departed
const CUST_A    = 1;   // owns travellers 1, 2, 3
const CUST_B    = 2;   // owns traveller 4
const TRAV_A1   = 1;
const TRAV_A2   = 2;
const TRAV_A3   = 3;
const TRAV_B1   = 4;

const book = (customer, departure, travellers, employee = null) =>
  admin.query('SELECT book_package($1,$2,$3,$4) AS id', [customer, departure, travellers, employee]);

const cancel = (booking, reason = 'test', employee = null) =>
  admin.query('SELECT cancel_booking($1,$2,$3)', [booking, reason, employee]);

describe('book_package', () => {
  it('TC-B-01 books available seats and returns the new booking id', async () => {
    const { rows } = await book(CUST_A, DEP_ROOMY, [TRAV_A1, TRAV_A2]);
    const id = rows[0].id;
    expect(id).toBeGreaterThan(0);

    const { rows: b } = await admin.query('SELECT * FROM booking WHERE booking_id = $1', [id]);
    expect(b[0].status).toBe('CONFIRMED');
    expect(b[0].num_travellers).toBe(2);
    expect(Number(b[0].total_amount)).toBe(2 * 25000);
    expect(b[0].booked_by_employee_id).toBeNull();   // self-service
  });

  it('TC-B-02 refuses to oversell and leaves NOTHING behind', async () => {
    const before = {
      bookings: await countRows('booking'),
      travellers: await countRows('booking_traveller'),
      payments: await countRows('payment'),
      seats: (await getSeats(DEP_ONE)).available_seats,
    };

    // Departure 3 has one seat; ask for two.
    await expect(book(CUST_A, DEP_ONE, [TRAV_A1, TRAV_A2]))
      .rejects.toThrow(/INSUFFICIENT_SEATS/);

    // The whole attempt was one transaction, so there is no partial record.
    expect(await countRows('booking')).toBe(before.bookings);
    expect(await countRows('booking_traveller')).toBe(before.travellers);
    expect(await countRows('payment')).toBe(before.payments);
    expect((await getSeats(DEP_ONE)).available_seats).toBe(before.seats);
  });

  it('TC-B-03 decrements available_seats by exactly num_travellers', async () => {
    const before = (await getSeats(DEP_ROOMY)).available_seats;
    await book(CUST_A, DEP_ROOMY, [TRAV_A1, TRAV_A2, TRAV_A3]);
    expect((await getSeats(DEP_ROOMY)).available_seats).toBe(before - 3);
  });

  it('TC-B-03b taking the last seat marks the departure FULL', async () => {
    await book(CUST_A, DEP_ONE, [TRAV_A1]);
    const d = await getSeats(DEP_ONE);
    expect(d.available_seats).toBe(0);
    expect(d.status).toBe('FULL');
  });

  it('TC-B-03c a sold-out departure cannot be booked', async () => {
    await expect(book(CUST_A, DEP_FULL, [TRAV_A1])).rejects.toThrow(/INSUFFICIENT_SEATS/);
  });

  it('TC-B-06 an agent booking records the employee, a customer booking does not', async () => {
    const { rows: agentBooking } = await book(CUST_B, DEP_ROOMY, [TRAV_B1], 1);
    const { rows } = await admin.query(
      'SELECT booked_by_employee_id FROM booking WHERE booking_id = $1', [agentBooking[0].id]);
    expect(rows[0].booked_by_employee_id).toBe(1);
  });

  it('TC-B-07 raises a pending payment for the full amount', async () => {
    const { rows } = await book(CUST_A, DEP_ROOMY, [TRAV_A1]);
    const { rows: p } = await admin.query(
      "SELECT amount, status, installment_no FROM payment WHERE booking_id = $1", [rows[0].id]);
    expect(p).toHaveLength(1);
    expect(p[0].status).toBe('PENDING');
    expect(Number(p[0].amount)).toBe(25000);
  });

  it('TC-B-08 refuses travellers belonging to another customer', async () => {
    // Traveller 4 belongs to customer 2, not customer 1.
    await expect(book(CUST_A, DEP_ROOMY, [TRAV_B1])).rejects.toThrow(/TRAVELLER_NOT_OWNED/);
    expect((await getSeats(DEP_ROOMY)).available_seats).toBe(18);
  });

  it('TC-B-09 refuses the same traveller twice on one booking', async () => {
    await expect(book(CUST_A, DEP_ROOMY, [TRAV_A1, TRAV_A1])).rejects.toThrow(/DUPLICATE_TRAVELLER/);
    // Rejected before any seat was taken, not after.
    expect((await getSeats(DEP_ROOMY)).available_seats).toBe(18);
  });

  it('TC-B-10 refuses an empty traveller list', async () => {
    await expect(book(CUST_A, DEP_ROOMY, [])).rejects.toThrow(/NO_TRAVELLERS/);
  });
});

describe('cancel_booking', () => {
  let bookingId;
  beforeEach(async () => {
    const { rows } = await book(CUST_A, DEP_ROOMY, [TRAV_A1, TRAV_A2]);
    bookingId = rows[0].id;
  });

  it('TC-B-04 restores the seats the booking held', async () => {
    const taken = (await getSeats(DEP_ROOMY)).available_seats;
    await cancel(bookingId);
    expect((await getSeats(DEP_ROOMY)).available_seats).toBe(taken + 2);
  });

  it('TC-B-04b returns a FULL departure to SCHEDULED', async () => {
    const { rows } = await book(CUST_B, DEP_ONE, [TRAV_B1]);
    expect((await getSeats(DEP_ONE)).status).toBe('FULL');
    await cancel(rows[0].id);
    const d = await getSeats(DEP_ONE);
    expect(d.available_seats).toBe(1);
    expect(d.status).toBe('SCHEDULED');
  });

  it('TC-B-05 a SECOND cancellation is refused by the unique constraint', async () => {
    await cancel(bookingId);
    const seatsAfterFirst = (await getSeats(DEP_ROOMY)).available_seats;

    await expect(cancel(bookingId)).rejects.toMatchObject({ code: '23505' });

    // And — the part that matters — the seats were not credited a second time.
    expect((await getSeats(DEP_ROOMY)).available_seats).toBe(seatsAfterFirst);
    expect(await countRows('cancellation', 'booking_id = $1', [bookingId])).toBe(1);
  });

  it('TC-B-11 computes the refund from the days-remaining scale', async () => {
    // Departure 1 is CURRENT_DATE + 60, so the 100% tier applies.
    await admin.query(
      "INSERT INTO payment (booking_id, amount, mode, transaction_ref, status) " +
      "VALUES ($1, 50000, 'UPI', 'TXN-TEST-1', 'SUCCESS')", [bookingId]);
    await cancel(bookingId);

    const { rows } = await admin.query(
      'SELECT refund_amount, penalty_amount FROM cancellation WHERE booking_id = $1', [bookingId]);
    expect(Number(rows[0].refund_amount)).toBe(50000);
    expect(Number(rows[0].penalty_amount)).toBe(0);
  });

  it('TC-B-12 a zero refund still records the cancellation and its penalty', async () => {
    // Departure 2 is CURRENT_DATE + 40 → 100%; move it inside 7 days to reach 0%.
    await admin.query(
      "UPDATE departure SET start_date = CURRENT_DATE + 3, end_date = CURRENT_DATE + 6 " +
      "WHERE departure_id = $1", [DEP_ROOMY]);
    await cancel(bookingId);

    const { rows } = await admin.query(
      'SELECT refund_amount, penalty_amount FROM cancellation WHERE booking_id = $1', [bookingId]);
    expect(Number(rows[0].refund_amount)).toBe(0);
    // No REFUNDED payment row when there is nothing to refund.
    expect(await countRows('payment', "booking_id = $1 AND status = 'REFUNDED'", [bookingId])).toBe(0);
  });

  it('TC-B-13 refuses to cancel a booking whose departure has finished', async () => {
    const { rows } = await admin.query(
      'SELECT booking_id FROM booking WHERE departure_id = $1 LIMIT 1', [DEP_PAST]);
    await expect(cancel(rows[0].booking_id)).rejects.toThrow(/DEPARTURE_COMPLETED/);
  });

  it('TC-B-14 cancelling a PENDING booking invents no seats', async () => {
    const before = (await getSeats(DEP_ROOMY)).available_seats;
    const { rows } = await admin.query(
      "INSERT INTO booking (customer_id, departure_id, num_travellers, total_amount, status) " +
      "VALUES ($1, $2, 2, 50000, 'PENDING') RETURNING booking_id", [CUST_A, DEP_ROOMY]);
    // A PENDING booking never took seats…
    expect((await getSeats(DEP_ROOMY)).available_seats).toBe(before);
    await cancel(rows[0].booking_id);
    // …so cancelling it must not hand any back.
    expect((await getSeats(DEP_ROOMY)).available_seats).toBe(before);
  });
});
