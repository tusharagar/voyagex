/**
 * departures.js — live availability for a package's departures.
 * Phase 6 · SRS FR-08, FR-24 · UC-06
 */

import { Router } from 'express';
import { poolFor } from '../db/pools.js';
import { runTraced, buildWhere, traceFor } from '../utils/runTraced.js';

const router = Router();

export const DEPARTURE_FILTERS = {
  packageId: { column: 'dep.package_id', op: '=',  cast: Number },
  from:      { column: 'dep.start_date', op: '>=' },
  to:        { column: 'dep.start_date', op: '<=' },
  status:    { column: 'dep.status',     op: '=' },
};

/**
 * GET /api/departures?packageId=&from=&to=
 *
 * available_seats is read straight from the row the seat trigger maintains
 * (ADR-05), so what a customer sees is what book_package will lock against —
 * not a count aggregated a moment earlier from somewhere else.
 */
router.get('/', async (req, res, next) => {
  try {
    const { clause, values, applied, ignored } = buildWhere(req.query, DEPARTURE_FILTERS, 1);
    const where = clause ? clause.replace(/^WHERE/, 'AND') : '';

    const sql = `
      SELECT dep.departure_id,
             dep.package_id,
             p.title            AS package_title,
             p.duration_days,
             dep.start_date,
             dep.end_date,
             dep.total_seats,
             dep.available_seats,
             dep.price,
             dep.status,
             (dep.total_seats - dep.available_seats) AS seats_taken,
             ROUND(100.0 * (dep.total_seats - dep.available_seats) / dep.total_seats, 1)
                                AS occupancy_pct
        FROM departure dep
        JOIN package p ON p.package_id = dep.package_id
       WHERE dep.start_date >= CURRENT_DATE
         ${where}
       ORDER BY dep.start_date
       LIMIT 200`;

    const result = await runTraced(sql, values, poolFor(req));
    return res.json({ departures: result.rows, filters: { applied, ignored }, trace: traceFor(req, result) });
  } catch (err) {
    return next(err);
  }
});

/** GET /api/departures/:id */
router.get('/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'departure id must be a positive integer' });
  }
  try {
    const result = await runTraced(
      `SELECT dep.*, p.title AS package_title, p.duration_days, p.category
         FROM departure dep
         JOIN package p ON p.package_id = dep.package_id
        WHERE dep.departure_id = $1`,
      [id],
      poolFor(req),
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'departure not found' });
    return res.json({ departure: result.rows[0], trace: traceFor(req, result) });
  } catch (err) {
    return next(err);
  }
});

export default router;
