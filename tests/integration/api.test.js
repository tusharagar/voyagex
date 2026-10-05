/**
 * TC-A — the HTTP surface, driven with supertest against the real Express app.
 * Phase 8 · SRS FR-01, FR-02, FR-06, FR-24 · NFR-04 · brief §12.2
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server/server.js';
import { closeAllPools } from '../../server/db/pools.js';
import { admin, countRows } from '../setup.js';

/** The seven keys every traced result must carry (FR-24). */
const TRACE_KEYS = ['sql', 'params', 'columns', 'rows', 'rowCount', 'executionMs', 'plan'];

function expectTracedShape(trace) {
  const list = Array.isArray(trace) ? trace : [trace];
  expect(list.length).toBeGreaterThan(0);
  for (const t of list) {
    expect(t, 'each trace must be an object').toBeTypeOf('object');
    for (const key of TRACE_KEYS) {
      expect(Object.keys(t), `trace is missing "${key}"`).toContain(key);
    }
  }
  return list;
}

let token;
let uniqueEmail;
let customerId;

/**
 * Every test starts from a truncated database reloaded from the fixture
 * (tests/setup.js), so an account created by one test does not exist for the
 * next. Each test that needs a session therefore makes its own here.
 *
 * An earlier version of this file registered once in beforeAll and let later
 * tests reuse it, which failed as soon as the per-test reset was working
 * correctly — the isolation was right and the assumption was wrong.
 */
let counter = 0;
async function registerFresh(password = 'a-good-enough-password') {
  uniqueEmail = `apitest${Date.now()}-${counter += 1}@example.test`;
  const res = await request(app).post('/api/auth/register').send({
    email: uniqueEmail, password, firstName: 'Api', lastName: 'Test',
  });
  token = res.body.token;
  customerId = res.body.customer?.customer_id;
  return res;
}

/** dbadmin@example.test, seeded fresh by tests/fixtures/sample_data.sql before every test. */
async function loginAsAdmin() {
  const res = await request(app).post('/api/auth/login')
    .send({ email: 'dbadmin@example.test', password: 'voyagex-demo' });
  return res.body.token;
}

beforeEach(async () => {
  await registerFresh();
});

afterAll(async () => {
  await closeAllPools();
});

describe('authentication', () => {
  it('TC-A-01 registers an account and returns a token', async () => {
    const res = await registerFresh();
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.customer.customer_id).toBeGreaterThan(0);
    // No session exists yet at registration, so traceFor (server/utils/runTraced.js)
    // has nothing to gate against DB_ADMIN — the trace is always absent here,
    // for every caller. See TC-A-24 for the general rule this is an instance of.
    expect(res.body.trace).toBeUndefined();
  });

  it('TC-A-02 refuses a duplicate email with 409', async () => {
    // Registering the SAME address twice, within one test, so the result does
    // not depend on another test having run first.
    const again = await request(app).post('/api/auth/register').send({
      email: uniqueEmail, password: 'another-password-here', firstName: 'Dup',
    });
    expect(again.status).toBe(409);
    expect(again.body.token).toBeUndefined();
  });

  it('TC-A-04 bad credentials return 401 and NO token', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'alice@example.test', password: 'definitely-wrong' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('TC-A-05 an unknown email is indistinguishable from a wrong password', async () => {
    // Same status and same message, so the form cannot be used to discover
    // which addresses hold accounts.
    const unknown = await request(app).post('/api/auth/login')
      .send({ email: 'nobody-at-all@example.test', password: 'whatever' });
    const wrongPw = await request(app).post('/api/auth/login')
      .send({ email: 'alice@example.test', password: 'whatever' });
    expect(unknown.status).toBe(wrongPw.status);
    expect(unknown.body.error).toBe(wrongPw.body.error);
  });

  it('TC-A-06 a valid login returns a token and the role', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: uniqueEmail, password: 'a-good-enough-password' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('CUSTOMER');
    expect(res.body.user.customerId).toBe(customerId);
    expect(res.body.token).toBeTruthy();
  });
});

describe('authorisation', () => {
  it('TC-R-03 an unauthenticated write is refused with 401', async () => {
    const res = await request(app).post('/api/bookings')
      .send({ departureId: 1, travellerIds: [1] });
    expect(res.status).toBe(401);
  });

  it('TC-R-03b a protected read is refused without a token', async () => {
    expect((await request(app).get('/api/bookings')).status).toBe(401);
    expect((await request(app).get('/api/travellers')).status).toBe(401);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('TC-R-03c a malformed token is treated as no token, never as valid', async () => {
    const res = await request(app).get('/api/bookings').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('TC-A-07 a customer may not record a payment', async () => {
    const res = await request(app).post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingId: 1, amount: 100, mode: 'CASH' });
    expect(res.status).toBe(403);
  });
});

describe('the SQL trace is visible to DB_ADMIN only (FR-24)', () => {
  // The trace carries raw SQL text, bound parameter VALUES, column names and
  // full row data — real data exposure if shipped to every role. traceFor()
  // (server/utils/runTraced.js) gates it to DB_ADMIN; these tests exercise that
  // gate from both sides rather than assuming it holds.

  it('TC-A-18 catalogue, detail, departures, bookings, travellers, payments, me all trace for DB_ADMIN', async () => {
    const auth = { Authorization: `Bearer ${await loginAsAdmin()}` };
    const checks = [
      ['GET /api/packages',        await request(app).get('/api/packages').set(auth)],
      ['GET /api/packages/1',      await request(app).get('/api/packages/1').set(auth)],
      ['GET /api/departures',      await request(app).get('/api/departures').set(auth)],
      ['GET /api/departures/1',    await request(app).get('/api/departures/1').set(auth)],
      ['GET /api/bookings',        await request(app).get('/api/bookings').set(auth)],
      ['GET /api/travellers',      await request(app).get('/api/travellers').set(auth)],
      ['GET /api/payments',        await request(app).get('/api/payments?bookingId=1').set(auth)],
      ['GET /api/auth/me',         await request(app).get('/api/auth/me').set(auth)],
    ];
    for (const [name, res] of checks) {
      expect(res.status, `${name} returned ${res.status}`).toBe(200);
      expect(res.body.trace, `${name} returned no trace`).toBeTruthy();
      expectTracedShape(res.body.trace);
    }
  });

  it('TC-A-19 placeholders are never interpolated into the returned SQL', async () => {
    const auth = { Authorization: `Bearer ${await loginAsAdmin()}` };
    const res = await request(app).get('/api/packages?category=Hill').set(auth);
    const [t] = expectTracedShape(res.body.trace);
    expect(t.sql).toContain('$1');
    expect(t.sql).not.toContain("'Hill'");
    expect(t.params).toContain('Hill');
  });

  it('TC-A-20 an empty result still reports its column names', async () => {
    const auth = { Authorization: `Bearer ${await loginAsAdmin()}` };
    const res = await request(app).get('/api/packages?category=Hill&maxPrice=1').set(auth);
    expect(res.status).toBe(200);
    const [t] = expectTracedShape(res.body.trace);
    expect(t.rowCount).toBe(0);
    expect(t.columns.length).toBeGreaterThan(0);
  });

  it('TC-A-24 the same endpoints carry no trace at all for a customer, or anonymously', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const checks = [
      ['anonymous GET /api/packages',   await request(app).get('/api/packages')],
      ['anonymous GET /api/packages/1', await request(app).get('/api/packages/1')],
      ['customer GET /api/bookings',    await request(app).get('/api/bookings').set(auth)],
      ['customer GET /api/travellers',  await request(app).get('/api/travellers').set(auth)],
      ['customer GET /api/auth/me',     await request(app).get('/api/auth/me').set(auth)],
    ];
    for (const [name, res] of checks) {
      expect(res.status, `${name} returned ${res.status}`).toBe(200);
      // undefined, not null or {} — traceFor returns undefined so JSON.stringify
      // drops the key entirely rather than shipping an empty placeholder.
      expect(res.body.trace, `${name} unexpectedly returned a trace`).toBeUndefined();
    }
  });
});

describe('injection resistance (NFR-04)', () => {
  it('TC-A-03 a malicious filter KEY does not alter the generated SQL', async () => {
    const auth = { Authorization: `Bearer ${await loginAsAdmin()}` };
    const clean = await request(app).get('/api/packages?category=Hill').set(auth);
    const evil = await request(app).get(
      '/api/packages?category=Hill' +
      '&city%3B%20DROP%20TABLE%20booking%20--=x' +
      "&minPrice%27%20OR%20%271%27%3D%271=5" +
      '&__proto__=y',
    ).set(auth);

    expect(evil.status).toBe(200);
    // Byte-identical statement and identical bound values.
    expect(evil.body.trace.sql).toBe(clean.body.trace.sql);
    expect(evil.body.trace.params).toEqual(clean.body.trace.params);
    expect(evil.body.filters.ignored).toHaveLength(3);
  });

  it('TC-A-03b the booking table still exists afterwards', async () => {
    const res = await request(app).get('/api/bookings').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('TC-A-03c a malicious filter VALUE is bound, not executed', async () => {
    const auth = { Authorization: `Bearer ${await loginAsAdmin()}` };
    const res = await request(app).get(
      "/api/packages?category=Hill%27%3B%20DROP%20TABLE%20booking%3B%20--").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.trace.params[0]).toContain('DROP TABLE');
    expect(res.body.packages).toEqual([]);   // no category matches that string
  });
});

describe('booking over HTTP', () => {
  it('TC-A-21 insufficient seats surfaces as 409 with the domain code', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const t = await request(app).post('/api/travellers').set(auth).send({ fullName: 'Api Traveller' });
    const travellerId = t.body.traveller.traveller_id;

    // Departure 3 has exactly one seat; ask for it twice over.
    const first = await request(app).post('/api/bookings').set(auth)
      .send({ departureId: 3, travellerIds: [travellerId] });
    expect(first.status).toBe(201);

    const t2 = await request(app).post('/api/travellers').set(auth).send({ fullName: 'Api Traveller 2' });
    const second = await request(app).post('/api/bookings').set(auth)
      .send({ departureId: 3, travellerIds: [t2.body.traveller.traveller_id] });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('INSUFFICIENT_SEATS');
  });

  it('TC-A-22 a customer cannot book another customer\'s travellers', async () => {
    const res = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ departureId: 1, travellerIds: [1] });   // traveller 1 belongs to customer 1
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TRAVELLER_NOT_OWNED');
  });

  it('TC-A-23 an unknown route returns 404 as JSON', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});

describe('the DB_ADMIN custom query console (FR-26, FR-27)', () => {
  it('TC-A-25 DB_ADMIN runs a SELECT and gets columns and rows back', async () => {
    const auth = { Authorization: `Bearer ${await loginAsAdmin()}` };
    const res = await request(app).post('/api/admin/query').set(auth)
      .send({ statement: 'SELECT package_id, title FROM package ORDER BY package_id LIMIT 3' });
    expect(res.status).toBe(200);
    expect(res.body.columns).toEqual(['package_id', 'title']);
    expect(res.body.rows.length).toBeGreaterThan(0);
    expect(res.body.rowCount).toBe(res.body.rows.length);
  });

  it('TC-A-26 a write is refused by the sql_console_ro grant, not by this route', async () => {
    const auth = { Authorization: `Bearer ${await loginAsAdmin()}` };
    const res = await request(app).post('/api/admin/query').set(auth)
      .send({ statement: "DELETE FROM package WHERE package_id = 1" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('QUERY_FAILED');
    expect(res.body.error).toMatch(/read-only/i);
  });

  it('TC-A-27 a customer is refused the console with 403, an anonymous caller with 401', async () => {
    const authed = await request(app).post('/api/admin/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ statement: 'SELECT 1' });
    expect(authed.status).toBe(403);

    const anon = await request(app).post('/api/admin/query').send({ statement: 'SELECT 1' });
    expect(anon.status).toBe(401);
  });

  it('TC-A-28 the schema browser lists public tables and columns for DB_ADMIN only', async () => {
    const auth = { Authorization: `Bearer ${await loginAsAdmin()}` };
    const admin = await request(app).get('/api/admin/schema').set(auth);
    expect(admin.status).toBe(200);
    expect(admin.body.tables.package).toEqual(
      expect.arrayContaining([expect.objectContaining({ column: 'title' })]),
    );

    const customer = await request(app).get('/api/admin/schema')
      .set('Authorization', `Bearer ${token}`);
    expect(customer.status).toBe(403);
  });

  it('TC-A-29 logs both a successful and a refused statement to admin_query_log (FR-27)', async () => {
    const auth = { Authorization: `Bearer ${await loginAsAdmin()}` };
    const before = await countRows('admin_query_log');

    await request(app).post('/api/admin/query').set(auth).send({ statement: 'SELECT 1' });
    await request(app).post('/api/admin/query').set(auth)
      .send({ statement: 'DELETE FROM package WHERE package_id = 1' });

    expect(await countRows('admin_query_log')).toBe(before + 2);
    const { rows } = await admin.query(
      'SELECT status FROM admin_query_log ORDER BY log_id DESC LIMIT 2');
    // Most recent first: the refused DELETE, then the SELECT before it.
    expect(rows[0].status).toBe('ERROR');
    expect(rows[1].status).toBe('OK');
  });
});
