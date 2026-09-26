/**
 * TC-A — the HTTP surface, driven with supertest against the real Express app.
 * Phase 8 · SRS FR-01, FR-02, FR-06, FR-24 · NFR-04 · brief §12.2
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../server/server.js';
import { closeAllPools } from '../../server/db/pools.js';

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
    expectTracedShape(res.body.trace);
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

describe('every data endpoint returns the traced shape (FR-24)', () => {
  it('TC-A-18 catalogue, detail, departures, bookings, travellers, payments, me', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const checks = [
      ['GET /api/packages',        await request(app).get('/api/packages')],
      ['GET /api/packages/1',      await request(app).get('/api/packages/1')],
      ['GET /api/departures',      await request(app).get('/api/departures')],
      ['GET /api/departures/1',    await request(app).get('/api/departures/1')],
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
    const res = await request(app).get('/api/packages?category=Hill');
    const [t] = expectTracedShape(res.body.trace);
    expect(t.sql).toContain('$1');
    expect(t.sql).not.toContain("'Hill'");
    expect(t.params).toContain('Hill');
  });

  it('TC-A-20 an empty result still reports its column names', async () => {
    const res = await request(app).get('/api/packages?category=Hill&maxPrice=1');
    expect(res.status).toBe(200);
    const [t] = expectTracedShape(res.body.trace);
    expect(t.rowCount).toBe(0);
    expect(t.columns.length).toBeGreaterThan(0);
  });
});

describe('injection resistance (NFR-04)', () => {
  it('TC-A-03 a malicious filter KEY does not alter the generated SQL', async () => {
    const clean = await request(app).get('/api/packages?category=Hill');
    const evil = await request(app).get(
      '/api/packages?category=Hill' +
      '&city%3B%20DROP%20TABLE%20booking%20--=x' +
      "&minPrice%27%20OR%20%271%27%3D%271=5" +
      '&__proto__=y',
    );

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
    const res = await request(app).get(
      "/api/packages?category=Hill%27%3B%20DROP%20TABLE%20booking%3B%20--");
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
