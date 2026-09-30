/**
 * bookings.js — create, list, view and cancel bookings.
 * Phase 6 · SRS FR-10 … FR-16, FR-18, FR-24 · UC-07, UC-08, UC-10, UC-11
 */

import { Router } from 'express';
import { z } from 'zod';
import { poolFor } from '../db/pools.js';
import { runTraced, traceFor } from '../utils/runTraced.js';
import { requireAuth } from '../middleware/auth.js';
import { createBooking, cancelBooking, refundPercentFor } from '../services/booking.service.js';

const router = Router();

const createSchema = z.object({
  departureId: z.number().int().positive(),
  travellerIds: z.array(z.number().int().positive()).min(1).max(20),
  // Present only when an agent books on someone's behalf (FR-15).
  customerId: z.number().int().positive().optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(500),
});

/** The customer_id belonging to the signed-in user, or null for staff. */
async function ownCustomerId(req) {
  const result = await runTraced(
    'SELECT customer_id FROM customer WHERE user_id = $1',
    [req.user.userId],
    poolFor(req),
  );
  return result.rows[0]?.customer_id ?? null;
}

/** The employee_id belonging to the signed-in user, or null. */
async function ownEmployeeId(req) {
  const result = await runTraced(
    'SELECT employee_id FROM employee WHERE user_id = $1',
    [req.user.userId],
    poolFor(req),
  );
  return result.rows[0]?.employee_id ?? null;
}

/**
 * POST /api/bookings  (FR-10, FR-15)
 */
router.post('/', requireAuth, async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid booking request', issues: parsed.error.issues });
  }
  const { departureId, travellerIds, customerId: requestedCustomerId } = parsed.data;

  try {
    const isStaff = req.user.role === 'AGENT' || req.user.role === 'MANAGER';

    // A customer books for themselves and nobody else. The identity comes from
    // the token, never from the request body — otherwise anyone could book
    // against another customer's account by changing a number.
    //
    // book_package checks traveller ownership again in the database, so this is
    // the outer of two independent guards rather than the only one.
    let customerId;
    let employeeId = null;

    if (isStaff) {
      if (!requestedCustomerId) {
        return res.status(400).json({ error: 'customerId is required when booking on behalf of a customer' });
      }
      customerId = requestedCustomerId;
      employeeId = await ownEmployeeId(req);
    } else {
      customerId = await ownCustomerId(req);
      if (!customerId) {
        return res.status(403).json({ error: 'this account has no customer record' });
      }
      if (requestedCustomerId && requestedCustomerId !== customerId) {
        return res.status(403).json({ error: 'you may only book for your own account' });
      }
    }

    const result = await createBooking(poolFor(req), {
      customerId,
      departureId,
      travellerIds,
      employeeId,
      actorUserId: req.user.userId,
    });

    return res.status(201).json({
      bookingId: result.bookingId,
      booking: result.booking,
      trace: traceFor(req, result.trace),
    });
  } catch (err) {
    // INSUFFICIENT_SEATS and the rest are translated to HTTP by errorHandler.
    return next(err);
  }
});

/**
 * GET /api/bookings  (FR-14, FR-16)
 *
 * A customer sees their own bookings; staff see all of them. The filter is
 * applied as a bound parameter, not by string assembly.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const isStaff = req.user.role === 'AGENT' || req.user.role === 'MANAGER' || req.user.role === 'DB_ADMIN';
    const pool = poolFor(req);

    let sql;
    let params;

    // Balance due is DERIVED here, never stored on booking (ADR-05 reasoning
    // applied to money): a stored total could disagree with the payment rows
    // that are supposed to justify it. v_booking_summary in Phase 10 moves this
    // expression into a view; the arithmetic stays identical.
    const select = `
      SELECT b.booking_id,
             b.customer_id,
             c.first_name || ' ' || COALESCE(c.last_name, '') AS customer_name,
             b.departure_id,
             p.title            AS package_title,
             dep.start_date,
             dep.end_date,
             b.booking_date,
             b.num_travellers,
             b.total_amount,
             b.discount,
             b.status,
             b.booked_by_employee_id IS NULL AS booked_online,
             COALESCE(paid.amount_paid, 0)                     AS amount_paid,
             b.total_amount - COALESCE(paid.amount_paid, 0)    AS balance_due
        FROM booking b
        JOIN customer  c   ON c.customer_id   = b.customer_id
        JOIN departure dep ON dep.departure_id = b.departure_id
        JOIN package   p   ON p.package_id     = dep.package_id
        LEFT JOIN (
               SELECT booking_id, SUM(amount) AS amount_paid
                 FROM payment
                WHERE status = 'SUCCESS'
                GROUP BY booking_id
             ) paid ON paid.booking_id = b.booking_id`;

    if (isStaff) {
      const statusFilter = req.query.status;
      // Compared against the known set rather than passed through: an unknown
      // status must not reach the statement even as a parameter.
      const validStatuses = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'];
      if (statusFilter && validStatuses.includes(statusFilter)) {
        sql = `${select} WHERE b.status = $1 ORDER BY b.booking_date DESC LIMIT 200`;
        params = [statusFilter];
      } else {
        sql = `${select} ORDER BY b.booking_date DESC LIMIT 200`;
        params = [];
      }
    } else {
      sql = `${select} WHERE c.user_id = $1 ORDER BY b.booking_date DESC`;
      params = [req.user.userId];
    }

    const result = await runTraced(sql, params, pool);
    return res.json({ bookings: result.rows, trace: traceFor(req, result) });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/bookings/:id  (FR-14)
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ error: 'booking id must be a positive integer' });
  }

  try {
    const pool = poolFor(req);
    const isStaff = req.user.role !== 'CUSTOMER';

    const booking = await runTraced(
      `SELECT b.booking_id, b.customer_id, b.departure_id, b.booking_date,
              b.num_travellers, b.total_amount, b.discount, b.status,
              b.special_requests, b.booked_by_employee_id,
              c.user_id, c.first_name, c.last_name,
              dep.start_date, dep.end_date, dep.price, dep.status AS departure_status,
              p.title AS package_title, p.duration_days,
              COALESCE(paid.amount_paid, 0)                  AS amount_paid,
              b.total_amount - COALESCE(paid.amount_paid, 0) AS balance_due,
              (dep.start_date - CURRENT_DATE)                AS days_until_departure
         FROM booking b
         JOIN customer  c   ON c.customer_id   = b.customer_id
         JOIN departure dep ON dep.departure_id = b.departure_id
         JOIN package   p   ON p.package_id     = dep.package_id
         LEFT JOIN (
                SELECT booking_id, SUM(amount) AS amount_paid
                  FROM payment WHERE status = 'SUCCESS' GROUP BY booking_id
              ) paid ON paid.booking_id = b.booking_id
        WHERE b.booking_id = $1`,
      [bookingId],
      pool,
    );

    if (booking.rowCount === 0) {
      return res.status(404).json({ error: 'booking not found' });
    }

    // Ownership is checked after the read rather than folded into the WHERE, so
    // "not yours" and "does not exist" can be told apart in the logs while
    // both return 404 to the caller — revealing which bookings exist would leak
    // information about other customers.
    const row = booking.rows[0];
    if (!isStaff && row.user_id !== req.user.userId) {
      return res.status(404).json({ error: 'booking not found' });
    }

    const travellers = await runTraced(
      `SELECT t.traveller_id, t.full_name, t.gender, t.date_of_birth,
              t.relation_to_customer, bt.seat_no
         FROM booking_traveller bt
         JOIN traveller t ON t.traveller_id = bt.traveller_id
        WHERE bt.booking_id = $1
        ORDER BY t.traveller_id`,
      [bookingId],
      pool,
    );

    const payments = await runTraced(
      `SELECT payment_id, amount, payment_date, mode, transaction_ref,
              status, installment_no
         FROM payment
        WHERE booking_id = $1
        ORDER BY payment_date, payment_id`,
      [bookingId],
      pool,
    );

    const cancellation = await runTraced(
      `SELECT cancellation_id, cancelled_on, reason, refund_amount, penalty_amount
         FROM cancellation
        WHERE booking_id = $1`,
      [bookingId],
      pool,
    );

    return res.json({
      booking: row,
      travellers: travellers.rows,
      payments: payments.rows,
      cancellation: cancellation.rows[0] ?? null,
      // What the customer would get back if they cancelled right now. Shown
      // before they confirm (wireframe 05); the database remains the authority
      // on what is actually recorded.
      refundIfCancelledNow:
        row.status === 'CONFIRMED'
          ? Number((row.amount_paid * refundPercentFor(row.days_until_departure)).toFixed(2))
          : null,
      trace: traceFor(req, [booking, travellers, payments, cancellation]),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * PATCH /api/bookings/:id/cancel  (FR-18, FR-19)
 */
router.patch('/:id/cancel', requireAuth, async (req, res, next) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ error: 'booking id must be a positive integer' });
  }

  const parsed = cancelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'a cancellation reason is required' });
  }

  try {
    const pool = poolFor(req);

    if (req.user.role === 'CUSTOMER') {
      const owner = await runTraced(
        `SELECT c.user_id
           FROM booking b JOIN customer c ON c.customer_id = b.customer_id
          WHERE b.booking_id = $1`,
        [bookingId],
        pool,
      );
      if (owner.rowCount === 0 || owner.rows[0].user_id !== req.user.userId) {
        return res.status(404).json({ error: 'booking not found' });
      }
    }

    const employeeId = req.user.role === 'AGENT' ? await ownEmployeeId(req) : null;

    const result = await cancelBooking(pool, {
      bookingId,
      reason: parsed.data.reason,
      employeeId,
      actorUserId: req.user.userId,
    });

    return res.json({ cancellation: result.cancellation, trace: traceFor(req, result.trace) });
  } catch (err) {
    // A second cancellation fails on uq_cancellation_booking_id, which
    // errorHandler turns into 409. The check is the database's, not ours
    // (UC-10 E1).
    return next(err);
  }
});

export default router;
