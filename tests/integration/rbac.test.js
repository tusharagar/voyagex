/**
 * TC-R — access control, asserted on SQLSTATE rather than on message text.
 * Phase 8 · SRS FR-03, NFR-03 · ADR-03 · brief §12.2
 *
 * Every assertion here connects AS the role in question, so what is tested is
 * PostgreSQL's own refusal — not a middleware check that could be bypassed.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { roleClient } from '../setup.js';

const INSUFFICIENT_PRIVILEGE = '42501';

let clients = [];
afterEach(async () => {
  await Promise.allSettled(clients.map((c) => c.end()));
  clients = [];
});

async function as(role) {
  const c = roleClient(role);
  await c.connect();
  clients.push(c);
  return c;
}

describe('app_agent', () => {
  it('TC-R-01 DELETE on booking is refused by PostgreSQL with SQLSTATE 42501', async () => {
    const agent = await as('app_agent');
    await expect(agent.query('DELETE FROM booking WHERE booking_id = 1'))
      .rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });

  it('TC-R-01b holds no DELETE on ANY table', async () => {
    const agent = await as('app_agent');
    for (const table of ['booking', 'payment', 'cancellation', 'traveller', 'customer', 'package']) {
      await expect(
        agent.query(`DELETE FROM ${table} WHERE 1 = 0`),
        `app_agent should not be able to DELETE from ${table}`,
      ).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    }
  });

  it('TC-R-01c can still read and write bookings, which is its job', async () => {
    const agent = await as('app_agent');
    await expect(agent.query('SELECT count(*) FROM booking')).resolves.toBeTruthy();
    await expect(agent.query(
      "INSERT INTO booking (customer_id, departure_id, num_travellers, total_amount, status) " +
      "VALUES (1, 1, 1, 100, 'PENDING')")).resolves.toBeTruthy();
  });

  it('TC-R-01d cannot read the audit trail', async () => {
    const agent = await as('app_agent');
    await expect(agent.query('SELECT count(*) FROM booking_audit'))
      .rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    await expect(agent.query('SELECT count(*) FROM admin_query_log'))
      .rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });
});

describe('sql_console_ro', () => {
  it('TC-R-02 INSERT is refused', async () => {
    const ro = await as('sql_console_ro');
    await expect(ro.query("INSERT INTO destination (name, category) VALUES ('X', 'Hill')"))
      .rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });

  it('TC-R-02b UPDATE and DELETE are refused', async () => {
    const ro = await as('sql_console_ro');
    await expect(ro.query('UPDATE departure SET price = 1 WHERE departure_id = 1'))
      .rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    await expect(ro.query('DELETE FROM departure WHERE departure_id = 1'))
      .rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });

  it('TC-R-02c cannot EXECUTE the booking procedure either', async () => {
    // A read-only console that can call a procedure which writes is not
    // read-only, so EXECUTE is withheld as well as INSERT.
    const ro = await as('sql_console_ro');
    await expect(ro.query('SELECT book_package(1, 1, ARRAY[1])'))
      .rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });

  it('TC-R-02d can SELECT, which is what it is for', async () => {
    const ro = await as('sql_console_ro');
    await expect(ro.query('SELECT count(*) FROM departure')).resolves.toBeTruthy();
  });
});

describe('app_customer', () => {
  it('TC-R-04 cannot INSERT a booking directly', async () => {
    const cust = await as('app_customer');
    await expect(cust.query(
      "INSERT INTO booking (customer_id, departure_id, num_travellers, total_amount, status) " +
      "VALUES (1, 1, 1, 100, 'CONFIRMED')")).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });

  it('TC-R-04b CAN book through the procedure — the point of SECURITY DEFINER', async () => {
    // Holding no INSERT on booking and still being able to book is the whole
    // design: booking goes through book_package or not at all.
    const cust = await as('app_customer');
    const { rows } = await cust.query('SELECT book_package(1, 1, ARRAY[1]) AS id');
    expect(rows[0].id).toBeGreaterThan(0);
  });

  it('TC-R-04c cannot read the audit trail', async () => {
    const cust = await as('app_customer');
    await expect(cust.query('SELECT count(*) FROM booking_audit'))
      .rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
  });

  it('TC-R-04d CAN delete its own travellers — the FR-05 delete interface', async () => {
    const cust = await as('app_customer');
    await expect(cust.query('DELETE FROM traveller WHERE traveller_id = -1')).resolves.toBeTruthy();
  });
});

describe('app_dbadmin', () => {
  it('TC-R-05 is NOT a PostgreSQL superuser', async () => {
    // A superuser reaches the host shell via COPY ... TO PROGRAM, which would
    // make every other control in this design advisory.
    const dba = await as('app_dbadmin');
    const { rows } = await dba.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_dbadmin'");
    expect(rows[0].rolsuper).toBe(false);
    expect(rows[0].rolbypassrls).toBe(false);
  });
});
