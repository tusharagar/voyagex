/**
 * setup.js — per-file test environment and shared helpers.
 *
 * Phase 8 · docs/test_cases.md is generated from runs of this suite.
 *
 * ISOLATION
 *   Every test starts from the same known state: all tables truncated (except
 *   `role`, which is reference data created by the schema itself), then
 *   tests/fixtures/sample_data.sql reloaded. The fixture has fixed ids, so a
 *   test can assert "departure 3 has exactly one seat" without querying for it
 *   first.
 *
 *   Resetting per test rather than per file costs about 30 ms and removes an
 *   entire class of order-dependent failures, where a suite passes when run
 *   whole and fails when one test is run alone.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);

// The test suite talks to the test database, never the development one.
process.env.PGDATABASE = process.env.PGDATABASE_TEST ?? 'travel_test';
// Signed tokens are needed by the API tests; this value never leaves the suite.
process.env.JWT_SECRET ??= 'test-only-secret-not-used-anywhere-else-0123456789';
process.env.BCRYPT_ROUNDS ??= '4'; // fast on purpose: NFR-05's cost is asserted separately
// The suite registers and logs in far more than 30 times per run (one register
// per test via beforeEach, plus logins inside individual tests); the limiter
// exists to slow brute-forcing against a real deployment, not to throttle a
// test run against a disposable database.
process.env.AUTH_RATE_LIMIT ??= '100000';

const FIXTURE = readFileSync(path.join(here, 'fixtures', 'sample_data.sql'), 'utf8');

const admin = new pg.Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGADMIN_USER ?? process.env.PGUSER ?? 'postgres',
  password: process.env.PGADMIN_PASSWORD ?? process.env.PGPASSWORD,
  max: 3,
});
admin.on('error', () => {});

/** A superuser pool, for arranging state and reading it back past the grants. */
export { admin };

/** Every table except `role`, which 01_schema.sql seeds as reference data. */
async function tableNames() {
  const { rows } = await admin.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name <> 'role'`);
  return rows.map((r) => `public.${r.table_name}`);
}

let TABLES = null;

export async function resetData() {
  TABLES ??= await tableNames();
  // One TRUNCATE for all of them: CASCADE handles the foreign keys and
  // RESTART IDENTITY puts the sequences back, so ids are reproducible.
  await admin.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  await admin.query(FIXTURE);
}

/** Connect as one of the five database roles, to test what it may actually do. */
export function roleClient(role) {
  const passwords = {
    app_customer: process.env.PG_CUSTOMER_PASSWORD,
    app_agent: process.env.PG_AGENT_PASSWORD,
    app_manager: process.env.PG_MANAGER_PASSWORD,
    app_dbadmin: process.env.PG_DBADMIN_PASSWORD,
    sql_console_ro: process.env.PG_CONSOLE_RO_PASSWORD,
  };
  return new pg.Client({
    host: process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE,
    user: role,
    password: passwords[role],
  });
}

/** Seats currently free on a departure, read past the application entirely. */
export async function getSeats(departureId) {
  const { rows } = await admin.query(
    'SELECT available_seats, status FROM departure WHERE departure_id = $1',
    [departureId],
  );
  return rows[0];
}

export async function countRows(table, where = '', params = []) {
  const { rows } = await admin.query(
    `SELECT count(*)::int AS n FROM ${table} ${where ? `WHERE ${where}` : ''}`,
    params,
  );
  return rows[0].n;
}

beforeAll(async () => {
  // Fail loudly and early if the database is not reachable, rather than letting
  // every test fail with its own confusing message.
  try {
    await admin.query('SELECT 1');
  } catch (err) {
    throw new Error(
      `cannot reach the test database "${process.env.PGDATABASE}": ${err.message}\n` +
      'Start PostgreSQL and run ./db/reset.sh --test',
    );
  }
});

beforeEach(async () => {
  await resetData();
});

afterAll(async () => {
  await admin.end().catch(() => {});
});

export { root };
