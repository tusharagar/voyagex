/**
 * booking.service.js — transaction orchestration for booking and cancellation.
 *
 * Phase 6 · SRS FR-10 … FR-14, FR-18 · ADR-02 · architecture.md §3.1
 *
 * THIS LAYER IS THIN ON PURPOSE.
 *
 * It does not decide whether a booking may happen, does not check seat
 * availability, and does not touch available_seats. All of that lives in
 * book_package and the seat trigger, because an invariant a caller can bypass
 * is not an invariant (ADR-02). What this file owns is the boundary: one
 * connection, one transaction, the actor published for the audit trigger, and
 * the traced result handed back for display.
 *
 * If this file were deleted and the API called the procedure directly, the
 * system would still be correct. That is the point.
 */

import { withTransaction } from '../db/pools.js';
import { runTraced } from '../utils/runTraced.js';

/**
 * Create a booking.
 *
 * The whole call is one statement — SELECT book_package(...) — inside one
 * transaction on one checked-out client. The row lock the procedure takes is
 * held until this transaction commits, which is what makes the seat check and
 * the seat decrement indivisible (UC-07 E2, TC-C-01).
 */
export async function createBooking(pool, { customerId, departureId, travellerIds, employeeId, actorUserId }) {
  return withTransaction(pool, actorUserId, async (client) => {
    const booking = await runTraced(
      'SELECT book_package($1, $2, $3, $4) AS booking_id',
      [customerId, departureId, travellerIds, employeeId ?? null],
      client,
    );

    const bookingId = booking.rows[0].booking_id;

    // Read the booking back inside the same transaction, so what is returned
    // is the committed state rather than a hopeful reconstruction of it.
    const detail = await runTraced(
      `SELECT b.booking_id, b.customer_id, b.departure_id, b.booked_by_employee_id,
              b.booking_date, b.num_travellers, b.total_amount, b.discount, b.status,
              dep.start_date, dep.end_date, dep.price, dep.available_seats,
              p.title AS package_title
         FROM booking b
         JOIN departure dep ON dep.departure_id = b.departure_id
         JOIN package   p   ON p.package_id     = dep.package_id
        WHERE b.booking_id = $1`,
      [bookingId],
      client,
    );

    return { bookingId, booking: detail.rows[0], trace: [booking, detail] };
  });
}

/**
 * Cancel a booking.
 *
 * cancel_booking writes the cancellation row, moves the status, and lets the
 * triggers restore the seats and append the audit row. Nothing here duplicates
 * any of that; the refund is read back from the row the procedure wrote rather
 * than recomputed, so the figure shown to the user is the figure recorded.
 */
export async function cancelBooking(pool, { bookingId, reason, employeeId, actorUserId }) {
  return withTransaction(pool, actorUserId, async (client) => {
    const call = await runTraced(
      'SELECT cancel_booking($1, $2, $3)',
      [bookingId, reason, employeeId ?? null],
      client,
    );

    const detail = await runTraced(
      `SELECT c.cancellation_id, c.booking_id, c.cancelled_on, c.reason,
              c.refund_amount, c.penalty_amount, c.processed_by,
              b.status, b.total_amount,
              dep.start_date,
              (dep.start_date - CURRENT_DATE) AS days_before_departure,
              dep.available_seats
         FROM cancellation c
         JOIN booking   b   ON b.booking_id     = c.booking_id
         JOIN departure dep ON dep.departure_id = b.departure_id
        WHERE c.booking_id = $1`,
      [bookingId],
      client,
    );

    return { cancellation: detail.rows[0], trace: [call, detail] };
  });
}

/**
 * The refund scale, duplicated from cancel_booking so the UI can show a
 * customer what they will get back BEFORE they confirm (wireframe 05).
 *
 * Duplication is a risk worth naming: if the tiers change in the procedure and
 * not here, the dialog promises one number and the database records another.
 * The database stays authoritative — this value is never written anywhere, only
 * displayed — and TC-U-02 asserts both implementations agree at the boundaries
 * of 30, 15 and 7 days.
 */
export function refundPercentFor(daysUntilDeparture) {
  if (daysUntilDeparture > 30) return 1.0;
  if (daysUntilDeparture >= 15) return 0.5;
  if (daysUntilDeparture >= 7) return 0.25;
  return 0.0;
}
