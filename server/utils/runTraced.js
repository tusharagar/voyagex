/**
 * runTraced — the single choke point for SQL execution.
 *
 * Phase 6 · SRS FR-24, NFR-04, NFR-08 · architecture.md §2.2
 *
 * Every statement the API runs goes through here, and every route that touches
 * SQL returns the shape it produces. That is not a convention for tidiness: the
 * DBMS submission is graded on the SQL being visible, so the SQL the UI displays
 * has to be the SQL that actually ran, captured at the point it ran.
 *
 * The returned shape, in full:
 *
 *   {
 *     sql          the statement text, exactly as authored, $n placeholders
 *                  NOT interpolated
 *     params       the bound values, listed separately
 *     columns      column names, from res.fields
 *     rows         the result rows
 *     rowCount     rows affected or returned
 *     executionMs  wall time for the query alone
 *     plan         EXPLAIN (ANALYZE, BUFFERS) output, only when asked for
 *   }
 *
 * Why placeholders stay uninterpolated: `WHERE category = $1` beside
 * `params: ['Hill']` is the evidence that the value never became part of the
 * statement. Splicing it in for display would throw away the one artifact that
 * answers the SQL-injection question (NFR-04).
 */

import { performance } from 'node:perf_hooks';

/**
 * @param {string} sql          statement with $1, $2 … placeholders
 * @param {Array}  params       values bound to those placeholders
 * @param {object} client       a pg Pool or a checked-out PoolClient
 * @param {{explain?: boolean}} [opts]
 */
export async function runTraced(sql, params = [], client, { explain = false } = {}) {
  if (!client) {
    throw new Error('runTraced: no client or pool given — pass poolFor(req)');
  }

  const t0 = performance.now();
  const res = await client.query(sql, params);
  const executionMs = +(performance.now() - t0).toFixed(2);

  let plan = null;
  if (explain) {
    // Gated, because this runs the statement a second time. Never enabled for
    // a statement that writes.
    try {
      const ex = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`, params);
      plan = ex.rows.map((r) => r['QUERY PLAN']).join('\n');
    } catch {
      // Not every statement is explainable. A missing plan must never fail the
      // request that asked for it.
      plan = null;
    }
  }

  return {
    sql: sql.trim(),
    params,
    // res.fields, not Object.keys(rows[0]). The latter looks equivalent and
    // breaks on an empty result set: zero rows would yield zero column headers,
    // so a search that matched nothing would render a table with no columns
    // rather than an empty one. Covered by TC-U-03.
    columns: res.fields ? res.fields.map((f) => f.name) : [],
    rows: res.rows,
    rowCount: res.rowCount,
    executionMs,
    plan,
  };
}

/**
 * The same shape for a result produced without a query — an empty list, say —
 * so a route never has to hand the client something differently shaped.
 */
export function emptyTrace(sql = '', params = []) {
  return { sql, params, columns: [], rows: [], rowCount: 0, executionMs: 0, plan: null };
}

/**
 * Build a parameterised WHERE clause from a whitelist.
 *
 * SRS NFR-04: no user input is ever concatenated into a statement. Values become
 * $n parameters, and column names come from `allowed` — a map the route owns —
 * so a submitted key that is not in that map is discarded rather than trusted.
 *
 * A filter key of `city; DROP TABLE booking --` is simply not in the map, so it
 * contributes nothing and the generated SQL is byte-for-byte what it would have
 * been without it. Asserted by TC-A-03.
 *
 * @param {object} filters  raw query parameters, straight off the request
 * @param {object} allowed  { filterKey: { column, op } } — the whitelist
 * @param {number} startAt  first placeholder number, for composing with other clauses
 * @returns {{ clause: string, values: Array, applied: string[], ignored: string[] }}
 */
export function buildWhere(filters = {}, allowed = {}, startAt = 1) {
  const parts = [];
  const values = [];
  const applied = [];
  const ignored = [];
  let n = startAt;

  for (const [key, raw] of Object.entries(filters)) {
    if (raw === undefined || raw === null || raw === '') continue;

    const spec = Object.prototype.hasOwnProperty.call(allowed, key) ? allowed[key] : undefined;
    if (!spec) {
      // Recorded rather than silently dropped, so a typo in a filter name is
      // visible to the caller instead of quietly returning unfiltered results.
      ignored.push(key);
      continue;
    }

    const op = spec.op ?? '=';
    if (op === 'ILIKE') {
      parts.push(`${spec.column} ILIKE $${n}`);
      values.push(`%${raw}%`);
    } else {
      parts.push(`${spec.column} ${op} $${n}`);
      values.push(spec.cast ? spec.cast(raw) : raw);
    }
    applied.push(key);
    n += 1;
  }

  return {
    clause: parts.length ? `WHERE ${parts.join('\n              AND ')}` : '',
    values,
    applied,
    ignored,
  };
}
