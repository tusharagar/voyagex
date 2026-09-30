/**
 * admin.js — the DB_ADMIN custom SQL console.
 * Phase 11 · SRS FR-26, FR-27 · db/07_roles_grants.sql §6
 */

import { performance } from 'node:perf_hooks';
import { Router } from 'express';
import { z } from 'zod';
import { pools, consolePool } from '../db/pools.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const querySchema = z.object({
  statement: z.string().min(1).max(10_000),
});

/**
 * GET /api/admin/schema
 *
 * The table/column browser the console's UI is built on. This is a fixed
 * query the page itself issues to draw the sidebar, not a statement the admin
 * authored — unlike /query, it is not written to admin_query_log, which
 * exists to hold what an admin typed and ran, not every read the console's own
 * chrome makes to render itself.
 *
 * information_schema.columns is filtered to what sql_console_ro can see, so
 * this reflects the same public-schema tables and views /query can reach.
 */
router.get('/schema', requireAuth, requireRole('DB_ADMIN'), async (req, res, next) => {
  try {
    const result = await consolePool().query(
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position`,
    );

    const tables = {};
    for (const row of result.rows) {
      (tables[row.table_name] ??= []).push({
        column: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
      });
    }

    return res.json({ tables });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/admin/query  (FR-26, FR-27)
 *
 * Runs on sql_console_ro, not app_dbadmin — a role with SELECT and nothing
 * else, anywhere (07_roles_grants.sql §6) — so a statement that writes is
 * refused by PostgreSQL itself even though the signed-in user is DB_ADMIN.
 * The BEGIN READ ONLY / always-ROLLBACK wrapper is the same belt-and-braces
 * pattern that section of the grants file describes; the grant is what
 * actually makes a write impossible.
 *
 * Every statement is logged to admin_query_log on a SEPARATE connection
 * (app_dbadmin), successful or not: this statement's own transaction is
 * always rolled back, so a log row written inside it would vanish too
 * (01_schema.sql's comment on admin_query_log).
 */
router.post('/query', requireAuth, requireRole('DB_ADMIN'), async (req, res, next) => {
  const parsed = querySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'a SQL statement is required' });
  }
  const { statement } = parsed.data;

  const client = await consolePool().connect();
  const t0 = performance.now();
  let result = null;
  let status = 'OK';
  let errorMsg = null;

  try {
    await client.query('BEGIN READ ONLY');
    result = await client.query(statement);
  } catch (err) {
    status = 'ERROR';
    errorMsg = err.message;
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection may already be unusable after the error above; the
      // pool discards it on release in that case.
    }
    client.release();
  }

  const durationMs = +(performance.now() - t0).toFixed(2);

  try {
    await pools.DB_ADMIN.query(
      `INSERT INTO admin_query_log
         (user_id, db_role, statement, status, error_msg, rows_affected, duration_ms)
       VALUES ($1, 'sql_console_ro', $2, $3, $4, $5, $6)`,
      [req.user.userId, statement, status, errorMsg, result?.rowCount ?? null, durationMs],
    );
  } catch (logErr) {
    // A failure to log must not hide the query result from the admin who ran
    // it — but it belongs in the server's own log, not silently swallowed.
    console.error('[admin_query_log] failed to record statement:', logErr.message);
  }

  if (status === 'ERROR') {
    return res.status(400).json({ error: errorMsg, code: 'QUERY_FAILED' });
  }

  return res.json({
    columns: result.fields ? result.fields.map((f) => f.name) : [],
    rows: result.rows,
    rowCount: result.rowCount,
    durationMs,
  });
});

export default router;
