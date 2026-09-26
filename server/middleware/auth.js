/**
 * auth.js — JWT verification, role attachment, and error translation.
 *
 * Phase 6 · SRS FR-02, FR-03 · NFR-03, NFR-05
 *
 * The token carries the application role, which selects the database pool
 * (db/pools.js). The requireRole guard below is defence in depth: if it were
 * deleted, an agent would still be refused a DELETE by PostgreSQL. It exists to
 * return a clean 403 rather than letting a privilege error surface as a 500.
 */

import jwt from 'jsonwebtoken';

/** Application role -> the PostgreSQL role it maps to. Mirrors SRS §2.3. */
export const ROLE_TO_DB_ROLE = {
  CUSTOMER: 'app_customer',
  AGENT: 'app_agent',
  MANAGER: 'app_manager',
  DB_ADMIN: 'app_dbadmin',
};

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'replace_me_with_a_long_random_string') {
    // Refusing to start with the example value is deliberate. A default secret
    // that "works" is how a placeholder reaches a submission, and every token
    // signed with a known secret is forgeable.
    throw new Error('JWT_SECRET is unset or still the .env.example placeholder');
  }
  return secret;
}

export function signToken({ userId, role, email }) {
  return jwt.sign(
    { userId, role, email, dbRole: ROLE_TO_DB_ROLE[role] ?? 'app_customer' },
    jwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' },
  );
}

/**
 * Attaches req.user when a valid token is present, and otherwise does nothing.
 *
 * It does NOT reject an anonymous request: the catalogue is browsable without
 * signing in (UC-03), and such a request falls through to the most restricted
 * pool. Rejection is requireAuth's job.
 */
export function attachUser(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme === 'Bearer' && token) {
    try {
      const payload = jwt.verify(token, jwtSecret());
      req.user = {
        userId: payload.userId,
        role: payload.role,
        email: payload.email,
        dbRole: payload.dbRole,
      };
    } catch {
      // An invalid or expired token is treated as no token at all. The request
      // continues anonymously and will be refused by requireAuth if the route
      // needs a session — never served with elevated access.
      req.user = undefined;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'authentication required' });
  }
  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'insufficient privilege for this operation' });
    }
    return next();
  };
}

/**
 * Domain exceptions raised by the stored procedures, mapped to HTTP.
 *
 * The procedures raise named exceptions (INSUFFICIENT_SEATS, and so on) rather
 * than returning status codes, because they are called by things that are not
 * HTTP. Translation belongs here, at the boundary.
 */
const DOMAIN_ERRORS = [
  ['INSUFFICIENT_SEATS', 409, 'Not enough seats remain on this departure.'],
  ['DEPARTURE_NOT_AVAILABLE', 409, 'This departure is no longer open for booking.'],
  ['DEPARTURE_NOT_FOUND', 404, 'That departure does not exist.'],
  ['DEPARTURE_COMPLETED', 409, 'This departure has already taken place.'],
  ['BOOKING_NOT_FOUND', 404, 'That booking does not exist.'],
  ['TRAVELLER_NOT_OWNED', 403, 'One or more travellers do not belong to this customer.'],
  ['DUPLICATE_TRAVELLER', 400, 'The same traveller appears more than once.'],
  ['NO_TRAVELLERS', 400, 'A booking needs at least one traveller.'],
  ['GUIDE_DOUBLE_BOOKED', 409, 'That guide is already assigned to an overlapping departure.'],
  ['REVIEWER_NOT_BOOKING_OWNER', 403, 'A booking may only be reviewed by the customer who made it.'],
  ['BOOKING_NOT_COMPLETED', 409, 'A booking can only be reviewed once the trip is complete.'],
];

/** SQLSTATE codes that are the user's fault rather than the server's. */
const SQLSTATE_MAP = {
  23505: [409, 'That record already exists.'],          // unique_violation
  23503: [409, 'That referenced record does not exist.'], // foreign_key_violation
  23514: [400, 'That value is not allowed.'],           // check_violation
  23502: [400, 'A required field was missing.'],        // not_null_violation
  42501: [403, 'The database refused this operation for your role.'], // insufficient_privilege
  '57014': [503, 'The database cancelled the statement (timeout).'],
};

export function errorHandler(err, req, res, _next) {
  const message = err?.message ?? '';

  for (const [token, status, friendly] of DOMAIN_ERRORS) {
    if (message.includes(token)) {
      return res.status(status).json({
        error: friendly,
        code: token,
        // The raw message carries the numbers a user needs ("2 requested but 1
        // remain"), so it is passed through rather than discarded.
        detail: message.split('\n')[0],
      });
    }
  }

  if (err?.code && Object.prototype.hasOwnProperty.call(SQLSTATE_MAP, err.code)) {
    const [status, friendly] = SQLSTATE_MAP[err.code];
    return res.status(status).json({
      error: friendly,
      code: err.code,
      constraint: err.constraint,
      detail: err.detail,
    });
  }

  // Anything unrecognised is ours. Log it in full, return nothing internal:
  // a stack trace or a raw SQL error in a response body tells an attacker about
  // the schema (NFR-12).
  console.error('[error]', req.method, req.originalUrl, err);
  return res.status(500).json({ error: 'internal server error' });
}
