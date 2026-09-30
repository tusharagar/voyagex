/**
 * payments.js — record a payment, list a booking's payments.
 * Phase 6 · SRS FR-17 · UC-09
 */

import { Router } from 'express';
import { z } from 'zod';
import { poolFor } from '../db/pools.js';
import { runTraced, traceFor } from '../utils/runTraced.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const paymentSchema = z.object({
  bookingId: z.number().int().positive(),
  amount: z.number().positive(),
  mode: z.enum(['CARD', 'UPI', 'NETBANKING', 'CASH']),
  transactionRef: z.string().max(60).optional(),
});

/** GET /api/payments?bookingId= */
router.get('/', requireAuth, async (req, res, next) => {
  const bookingId = Number(req.query.bookingId);
  if (!Number.isInteger(bookingId) || bookingId < 1) {
    return res.status(400).json({ error: 'bookingId query parameter is required' });
  }
  try {
    const isStaff = req.user.role !== 'CUSTOMER';
    const sql = isStaff
      ? `SELECT p.payment_id, p.booking_id, p.amount, p.payment_date, p.mode,
                p.transaction_ref, p.status, p.installment_no
           FROM payment p WHERE p.booking_id = $1 ORDER BY p.payment_date, p.payment_id`
      : `SELECT p.payment_id, p.booking_id, p.amount, p.payment_date, p.mode,
                p.transaction_ref, p.status, p.installment_no
           FROM payment p
           JOIN booking  b ON b.booking_id  = p.booking_id
           JOIN customer c ON c.customer_id = b.customer_id
          WHERE p.booking_id = $1 AND c.user_id = $2
          ORDER BY p.payment_date, p.payment_id`;
    const params = isStaff ? [bookingId] : [bookingId, req.user.userId];
    const result = await runTraced(sql, params, poolFor(req));
    return res.json({ payments: result.rows, trace: traceFor(req, result) });
  } catch (err) { return next(err); }
});

/**
 * POST /api/payments  (FR-17)
 *
 * Agents and managers only: a customer recording their own payment would be
 * asserting money arrived. app_customer holds no INSERT on payment either, so
 * the database refuses it independently of this check.
 */
router.post('/', requireAuth, async (req, res, next) => {
  if (req.user.role === 'CUSTOMER') {
    return res.status(403).json({ error: 'payments are recorded by agency staff' });
  }
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid payment', issues: parsed.error.issues });
  }
  const { bookingId, amount, mode, transactionRef } = parsed.data;
  try {
    const pool = poolFor(req);

    // installment_no is derived from what already exists rather than supplied
    // by the caller, so two payments cannot both claim to be the first.
    const result = await runTraced(
      `INSERT INTO payment (booking_id, amount, mode, transaction_ref, status, installment_no)
       SELECT $1, $2, $3, $4, 'SUCCESS',
              COALESCE(MAX(p.installment_no), 0) + 1
         FROM payment p
        WHERE p.booking_id = $1
       RETURNING payment_id, booking_id, amount, payment_date, mode,
                 transaction_ref, status, installment_no`,
      [bookingId, amount, mode, transactionRef ?? `TXN-${bookingId}-${Date.now()}`],
      pool,
    );

    const balance = await runTraced(
      `SELECT b.total_amount,
              COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'SUCCESS'), 0) AS amount_paid,
              b.total_amount - COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'SUCCESS'), 0)
                AS balance_due
         FROM booking b LEFT JOIN payment p ON p.booking_id = b.booking_id
        WHERE b.booking_id = $1
        GROUP BY b.total_amount`,
      [bookingId],
      pool,
    );

    return res.status(201).json({
      payment: result.rows[0],
      balance: balance.rows[0],
      trace: traceFor(req, [result, balance]),
    });
  } catch (err) { return next(err); }
});

export default router;
