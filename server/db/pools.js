/**
 * pools.js — one connection pool per database role.
 *
 * Phase 6 · SRS FR-03, NFR-03 · ADR-03 · architecture.md §2.2
 *
 * THIS FILE *IS* THE ACCESS CONTROL.
 *
 * There is no permissions table and no middleware that decides what a request
 * may do. Each pool connects as a different PostgreSQL role whose privileges
 * were granted in db/07_roles_grants.sql, and poolFor() picks the pool from the
 * authenticated user's role. A request served by the agent pool physically
 * cannot DELETE a booking, because PostgreSQL refuses it — not because a
 * handler remembered to check.
 *
 * The middleware role checks in middleware/auth.js are defence in depth. If one
 * were removed tomorrow, the database would still refuse the operation.
 */

import pg from 'pg';

const { Pool } = pg;

// Return NUMERIC as a JS number rather than a string. pg does this by default
// because NUMERIC can exceed IEEE-754 precision; the amounts here are
// NUMERIC(10,2) — at most ten digits — so this is safe, and it keeps the API
// from emitting "24500.00" as a string where the client expects a number.
// If this schema ever grows a genuinely large NUMERIC, this must be revisited.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number.parseFloat(v)));
// int8 (count(*)) likewise: row counts here are far below 2^53.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10)));

const shared = {
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? 'travel_tourism',
  // Small maxima: five pools against one local cluster, and the system is
  // single-user in demonstration. Five pools each defaulting to 10 would open
  // 50 connections against a server whose default limit is 100.
  max: Number(process.env.PG_POOL_MAX ?? 4),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Statements are already bounded at the database; this stops a wedged
  // connection from holding a request open indefinitely.
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 15_000),
};

function makePool(user, password) {
  const pool = new Pool({ ...shared, user, ...(password ? { password } : {}) });
  // An idle client erroring (server restart, network drop) emits on the pool.
  // Without a listener this is an unhandled 'error' event and takes the process
  // down — a connection blip should not kill the API.
  pool.on('error', (err) => {
    console.error(`[pool:${user}] idle client error:`, err.message);
  });
  return pool;
}

/** Application role name (from the JWT) -> pool. */
export const pools = {
  CUSTOMER: makePool(process.env.PG_CUSTOMER_USER ?? 'app_customer', process.env.PG_CUSTOMER_PASSWORD),
  AGENT: makePool(process.env.PG_AGENT_USER ?? 'app_agent', process.env.PG_AGENT_PASSWORD),
  MANAGER: makePool(process.env.PG_MANAGER_USER ?? 'app_manager', process.env.PG_MANAGER_PASSWORD),
  DB_ADMIN: makePool(process.env.PG_DBADMIN_USER ?? 'app_dbadmin', process.env.PG_DBADMIN_PASSWORD),
  CONSOLE_RO: makePool(process.env.PG_CONSOLE_RO_USER ?? 'sql_console_ro', process.env.PG_CONSOLE_RO_PASSWORD),
};

/**
 * The pool for this request.
 *
 * Defaults to CUSTOMER — the most restricted role — whenever there is no
 * session, an unrecognised role, or anything unexpected. The default has to be
 * the least privilege available: a bug that loses the session must downgrade
 * access, never widen it.
 */
export function poolFor(req) {
  const role = req?.user?.role;
  if (role && Object.prototype.hasOwnProperty.call(pools, role)) {
    return pools[role];
  }
  return pools.CUSTOMER;
}

/** The read-only pool used by the SQL console (FR-26, Phase 11). */
export function consolePool() {
  return pools.CONSOLE_RO;
}

/**
 * Check out one client and run `fn` inside a transaction.
 *
 * The reason this exists rather than calling BEGIN on the pool: a Pool hands
 * out a different physical connection per query(), so `pool.query('BEGIN')`
 * followed by `pool.query('INSERT ...')` sends the two statements down
 * different connections. The BEGIN opens and closes a transaction containing
 * nothing, the INSERT autocommits, and the code looks transactional while
 * providing no atomicity at all. It fails silently, which is the dangerous kind.
 *
 * `actorUserId` is published to the transaction as a GUC so trg_booking_audit
 * can attribute the change. SET LOCAL scopes it to this transaction, so it
 * cannot leak to the next request that borrows the same pooled connection —
 * a plain SET would, and would misattribute audit rows.
 */
export async function withTransaction(pool, actorUserId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (actorUserId != null) {
      await client.query("SELECT set_config('voyagex.actor_user_id', $1, true)", [String(actorUserId)]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Report, but let the original error propagate: it is the one that
      // explains what went wrong.
      console.error('[tx] rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    // In `finally`, so a connection is returned even when both the body and the
    // rollback threw. Leaking clients exhausts a pool of 4 almost immediately.
    client.release();
  }
}

/** Close every pool. Used by the test suite and on shutdown. */
export async function closeAllPools() {
  await Promise.allSettled(Object.values(pools).map((p) => p.end()));
}
