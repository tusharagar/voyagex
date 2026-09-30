/**
 * travellers.js — the customer's own traveller records.
 *
 * Phase 6 · SRS FR-05 · UC-05
 *
 * This route carries the DELETE interface the DBMS brief requires, and it is
 * the only DELETE granted to any application role (07_roles_grants.sql §3).
 */

import { Router } from 'express';
import { z } from 'zod';
import { poolFor } from '../db/pools.js';
import { runTraced, traceFor } from '../utils/runTraced.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const travellerSchema = z.object({
  fullName: z.string().min(1).max(120),
  gender: z.enum(['M', 'F', 'O']).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passportNo: z.string().max(20).optional(),
  relation: z.string().max(30).optional(),
});

async function ownCustomerId(req) {
  const r = await runTraced(
    'SELECT customer_id FROM customer WHERE user_id = $1',
    [req.user.userId],
    poolFor(req),
  );
  return r.rows[0]?.customer_id ?? null;
}

/** GET /api/travellers */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await runTraced(
      `SELECT t.traveller_id, t.full_name, t.gender, t.date_of_birth,
              t.passport_no, t.relation_to_customer,
              (SELECT count(*) FROM booking_traveller bt
                WHERE bt.traveller_id = t.traveller_id) AS bookings_count
         FROM traveller t
         JOIN customer c ON c.customer_id = t.customer_id
        WHERE c.user_id = $1
        ORDER BY t.traveller_id`,
      [req.user.userId],
      poolFor(req),
    );
    return res.json({ travellers: result.rows, trace: traceFor(req, result) });
  } catch (err) { return next(err); }
});

/** POST /api/travellers */
router.post('/', requireAuth, async (req, res, next) => {
  const parsed = travellerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid traveller', issues: parsed.error.issues });
  }
  try {
    const customerId = await ownCustomerId(req);
    if (!customerId) return res.status(403).json({ error: 'this account has no customer record' });

    const { fullName, gender, dateOfBirth, passportNo, relation } = parsed.data;
    const result = await runTraced(
      `INSERT INTO traveller (customer_id, full_name, gender, date_of_birth,
                              passport_no, relation_to_customer)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING traveller_id, full_name, gender, date_of_birth,
                 passport_no, relation_to_customer`,
      [customerId, fullName, gender ?? null, dateOfBirth ?? null, passportNo ?? null, relation ?? null],
      poolFor(req),
    );
    return res.status(201).json({ traveller: result.rows[0], trace: traceFor(req, result) });
  } catch (err) { return next(err); }
});

/** PUT /api/travellers/:id */
router.put('/:id', requireAuth, async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'traveller id must be a positive integer' });
  }
  const parsed = travellerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid traveller', issues: parsed.error.issues });
  }
  try {
    const { fullName, gender, dateOfBirth, passportNo, relation } = parsed.data;
    // The ownership test is part of the UPDATE's own WHERE clause, so a
    // traveller belonging to someone else simply matches no row. There is no
    // window between checking and writing in which ownership could change.
    const result = await runTraced(
      `UPDATE traveller t
          SET full_name = $2, gender = $3, date_of_birth = $4,
              passport_no = $5, relation_to_customer = $6
         FROM customer c
        WHERE t.traveller_id = $1
          AND c.customer_id = t.customer_id
          AND c.user_id = $7
        RETURNING t.traveller_id, t.full_name, t.gender, t.date_of_birth,
                  t.passport_no, t.relation_to_customer`,
      [id, fullName, gender ?? null, dateOfBirth ?? null, passportNo ?? null, relation ?? null, req.user.userId],
      poolFor(req),
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'traveller not found' });
    return res.json({ traveller: result.rows[0], trace: traceFor(req, result) });
  } catch (err) { return next(err); }
});

/**
 * DELETE /api/travellers/:id  (FR-05)
 *
 * A traveller already on a booking is refused rather than deleted. The
 * booking_traveller foreign key would refuse it anyway — this check exists to
 * say WHY, since "violates foreign key constraint" is not an explanation a
 * customer can act on.
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'traveller id must be a positive integer' });
  }
  try {
    const pool = poolFor(req);

    const used = await runTraced(
      `SELECT count(*) AS bookings
         FROM booking_traveller bt
         JOIN traveller t ON t.traveller_id = bt.traveller_id
         JOIN customer  c ON c.customer_id  = t.customer_id
        WHERE bt.traveller_id = $1 AND c.user_id = $2`,
      [id, req.user.userId],
      pool,
    );
    if (Number(used.rows[0].bookings) > 0) {
      return res.status(409).json({
        error: 'this traveller is on an existing booking and cannot be removed',
        bookings: Number(used.rows[0].bookings),
        trace: traceFor(req, used),
      });
    }

    const result = await runTraced(
      `DELETE FROM traveller t
        USING customer c
        WHERE t.traveller_id = $1
          AND c.customer_id = t.customer_id
          AND c.user_id = $2
        RETURNING t.traveller_id, t.full_name`,
      [id, req.user.userId],
      pool,
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'traveller not found' });
    return res.json({ deleted: result.rows[0], trace: traceFor(req, result) });
  } catch (err) { return next(err); }
});

export default router;
