/**
 * packages.js — catalogue search and package detail.
 * Phase 6 · SRS FR-06, FR-07, FR-08, FR-24 · NFR-01, NFR-04 · UC-03, UC-06
 */

import { Router } from 'express';
import { poolFor } from '../db/pools.js';
import { runTraced, buildWhere, traceFor } from '../utils/runTraced.js';

const router = Router();

/**
 * THE WHITELIST.
 *
 * A submitted filter key is looked up here. Anything absent is discarded, so no
 * user-supplied string can ever reach the SQL as an identifier; only values
 * become $n parameters (NFR-04).
 *
 * This map is also the complete, readable definition of what the catalogue can
 * be filtered by — which a chain of string concatenation would not be.
 */
export const PACKAGE_FILTERS = {
  category:    { column: 'p.category',        op: '=' },
  destination: { column: 'd.name',            op: 'ILIKE' },
  state:       { column: 'd.state',           op: 'ILIKE' },
  minDays:     { column: 'p.duration_days',   op: '>=', cast: Number },
  maxDays:     { column: 'p.duration_days',   op: '<=', cast: Number },
  minPrice:    { column: 'dep.price',         op: '>=', cast: Number },
  maxPrice:    { column: 'dep.price',         op: '<=', cast: Number },
  month:       { column: 'EXTRACT(MONTH FROM dep.start_date)', op: '=', cast: Number },
};

/**
 * GET /api/packages  (FR-06)
 *
 * Only packages with a future, still-sellable departure are listed: a catalogue
 * entry nobody can book is noise.
 */
router.get('/', async (req, res, next) => {
  try {
    const { clause, values, applied, ignored } = buildWhere(req.query, PACKAGE_FILTERS, 1);

    // The filter clause is composed into a WHERE that always has a base
    // predicate, so an empty filter set is still valid SQL.
    const where = clause
      ? clause.replace(/^WHERE/, 'AND')
      : '';

    const sql = `
      SELECT p.package_id,
             p.title,
             p.category,
             p.duration_days,
             p.duration_nights,
             p.max_group_size,
             MIN(dep.price)                        AS from_price,
             MIN(dep.start_date)                   AS next_departure,
             SUM(dep.available_seats)              AS seats_available,
             COUNT(DISTINCT dep.departure_id)      AS departures_open,
             STRING_AGG(DISTINCT d.name, ', ' ORDER BY d.name) AS destinations
        FROM package p
        JOIN departure dep          ON dep.package_id = p.package_id
        LEFT JOIN package_destination pd ON pd.package_id = p.package_id
        LEFT JOIN destination d          ON d.destination_id = pd.destination_id
       WHERE p.is_active
         AND dep.start_date > CURRENT_DATE
         AND dep.status = 'SCHEDULED'
         ${where}
       GROUP BY p.package_id, p.title, p.category, p.duration_days,
                p.duration_nights, p.max_group_size
       HAVING SUM(dep.available_seats) > 0
       ORDER BY MIN(dep.start_date)`;

    const result = await runTraced(sql, values, poolFor(req));

    return res.json({
      packages: result.rows,
      filters: { applied, ignored },
      trace: traceFor(req, result),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/packages/:id  (FR-07)
 *
 * Four separate traced queries rather than one wide join. A single query
 * joining itinerary, destinations and hotels would multiply rows across three
 * independent one-to-many relationships and need de-duplicating in JavaScript.
 * Four queries also give the UI four QueryTrace panels, each showing the SQL
 * behind the section it belongs to.
 */
router.get('/:id', async (req, res, next) => {
  const packageId = Number(req.params.id);
  if (!Number.isInteger(packageId) || packageId < 1) {
    return res.status(400).json({ error: 'package id must be a positive integer' });
  }

  try {
    const pool = poolFor(req);

    const pkg = await runTraced(
      `SELECT p.package_id, p.title, p.description, p.duration_days,
              p.duration_nights, p.category, p.base_price, p.max_group_size,
              p.is_active
         FROM package p
        WHERE p.package_id = $1`,
      [packageId],
      pool,
    );

    if (pkg.rowCount === 0) {
      return res.status(404).json({ error: 'package not found' });
    }

    const itinerary = await runTraced(
      `SELECT ia.day_number, ia.time_slot, ia.title, ia.description
         FROM itinerary_activity ia
        WHERE ia.package_id = $1
        ORDER BY ia.day_number,
                 CASE ia.time_slot
                   WHEN 'Morning'   THEN 1
                   WHEN 'Afternoon' THEN 2
                   WHEN 'Evening'   THEN 3
                   ELSE 4
                 END`,
      [packageId],
      pool,
    );

    const destinations = await runTraced(
      `SELECT d.destination_id, d.name, d.state, d.category, d.best_season,
              pd.day_number, pd.nights_stay
         FROM package_destination pd
         JOIN destination d ON d.destination_id = pd.destination_id
        WHERE pd.package_id = $1
        ORDER BY pd.day_number`,
      [packageId],
      pool,
    );

    const hotels = await runTraced(
      `SELECT DISTINCT h.hotel_id, h.name, h.star_rating, h.price_per_night,
                       d.name AS destination
         FROM hotel h
         JOIN destination d          ON d.destination_id = h.destination_id
         JOIN package_destination pd ON pd.destination_id = d.destination_id
        WHERE pd.package_id = $1
        ORDER BY h.star_rating DESC, h.name`,
      [packageId],
      pool,
    );

    return res.json({
      package: pkg.rows[0],
      itinerary: itinerary.rows,
      destinations: destinations.rows,
      hotels: hotels.rows,
      trace: traceFor(req, [pkg, itinerary, destinations, hotels]),
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
