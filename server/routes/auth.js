/**
 * auth.js — registration, login, session.
 * Phase 6 · SRS FR-01, FR-02 · NFR-05 · UC-01, UC-02
 */

import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { pools, poolFor, withTransaction } from '../db/pools.js';
import { runTraced, traceFor } from '../utils/runTraced.js';
import { signToken, requireAuth } from '../middleware/auth.js';

const router = Router();

// Cost 12: comfortably above the NFR-05 floor of 10, and roughly 250 ms on this
// hardware — slow enough to matter against offline cracking, fast enough that a
// login is not noticeable.
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

const registerSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(8).max(200),
  firstName: z.string().min(1).max(60),
  lastName: z.string().max(60).optional(),
  phone: z.string().max(15).optional(),
  city: z.string().max(60).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(1).max(200),
});

/**
 * POST /api/auth/register  (FR-01)
 *
 * Creates the account and its customer record in ONE transaction. Half a
 * registration — an account with no customer row — would be a user who can log
 * in and then fail on every screen.
 */
router.post('/register', async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid registration details', issues: parsed.error.issues });
  }
  const { email, password, firstName, lastName, phone, city } = parsed.data;

  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Registration happens before any session exists, so it runs on the most
    // restricted pool — which is exactly why app_customer holds INSERT on
    // user_account and customer (07_roles_grants.sql §3).
    const result = await withTransaction(pools.CUSTOMER, null, async (client) => {
      const user = await runTraced(
        `INSERT INTO user_account (email, password_hash, role_id)
         VALUES ($1, $2, (SELECT role_id FROM role WHERE role_name = 'CUSTOMER'))
         RETURNING user_id, email, created_at`,
        [email.toLowerCase(), hash],
        client,
      );

      const customer = await runTraced(
        `INSERT INTO customer (user_id, first_name, last_name, phone, city)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING customer_id, first_name, last_name`,
        [user.rows[0].user_id, firstName, lastName ?? null, phone ?? null, city ?? null],
        client,
      );

      return { user, customer };
    });

    const userRow = result.user.rows[0];
    const token = signToken({ userId: userRow.user_id, role: 'CUSTOMER', email: userRow.email });

    return res.status(201).json({
      token,
      user: { userId: userRow.user_id, email: userRow.email, role: 'CUSTOMER' },
      customer: result.customer.rows[0],
      // Both statements are returned, so the UI can show the whole
      // registration, not just its last step.
      trace: traceFor(req, [result.user, result.customer]),
    });
  } catch (err) {
    // uq_user_account_email. Caught as a constraint violation rather than by a
    // prior SELECT: a check-then-insert has a window between the two steps in
    // which a second registration can slip through. The unique index has none.
    if (err?.code === '23505' && err?.constraint === 'uq_user_account_email') {
      return res.status(409).json({ error: 'an account with that email already exists' });
    }
    return next(err);
  }
});

/**
 * POST /api/auth/login  (FR-02)
 */
router.post('/login', async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const { email, password } = parsed.data;

  try {
    const found = await runTraced(
      `SELECT u.user_id, u.email, u.password_hash, u.is_active, r.role_name,
              c.customer_id
         FROM user_account u
         JOIN role r ON r.role_id = u.role_id
         LEFT JOIN customer c ON c.user_id = u.user_id
        WHERE u.email = $1`,
      [email.toLowerCase()],
      pools.CUSTOMER,
    );

    const user = found.rows[0];

    // One message and one status for "no such email" and "wrong password"
    // alike. Distinguishing them turns the login form into an oracle for which
    // email addresses hold accounts (TC-A-04).
    const ok = user && user.is_active && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      // Compare against a dummy hash when the user does not exist, so the
      // response time does not reveal which case it was.
      if (!user) {
        await bcrypt.compare(password, '$2b$12$' + 'x'.repeat(53));
      }
      return res.status(401).json({ error: 'invalid email or password' });
    }

    await runTraced(
      'UPDATE user_account SET last_login = now() WHERE user_id = $1',
      [user.user_id],
      pools.CUSTOMER,
    );

    const token = signToken({ userId: user.user_id, role: user.role_name, email: user.email });

    return res.json({
      token,
      user: {
        userId: user.user_id,
        email: user.email,
        role: user.role_name,
        customerId: user.customer_id,
      },
      // The password hash must never leave the server, so the trace for this
      // route is reported without its rows — and, beyond that, only at all to
      // a DB_ADMIN, which login itself cannot yet be (no session exists until
      // this response returns a token), so this is effectively always empty.
      trace: traceFor(req, { ...found, rows: [], columns: found.columns }),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await runTraced(
      `SELECT u.user_id, u.email, r.role_name, u.created_at, u.last_login,
              c.customer_id, c.first_name, c.last_name, c.phone, c.city
         FROM user_account u
         JOIN role r ON r.role_id = u.role_id
         LEFT JOIN customer c ON c.user_id = u.user_id
        WHERE u.user_id = $1`,
      [req.user.userId],
      poolFor(req),
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'user not found' });
    }
    return res.json({ user: result.rows[0], trace: traceFor(req, result) });
  } catch (err) {
    return next(err);
  }
});

export default router;
