/**
 * server.js — the VoyageX API.
 *
 * Phase 6 · SRS §8.5 security hygiene · NFR-03, NFR-12 · architecture.md §2.2
 *
 *   npm run dev     node --watch
 *   npm start
 *
 * Bound to 127.0.0.1 and never deployed (SRS constraint C-06).
 */

import { pathToFileURL } from 'node:url';

import './loadEnv.js';   // must be the first import — see the file for why
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { attachUser, errorHandler } from './middleware/auth.js';
import { closeAllPools, pools } from './db/pools.js';
import { runTraced } from './utils/runTraced.js';

import authRoutes from './routes/auth.js';
import packageRoutes from './routes/packages.js';
import departureRoutes from './routes/departures.js';
import bookingRoutes from './routes/bookings.js';
import paymentRoutes from './routes/payments.js';
import travellerRoutes from './routes/travellers.js';
import adminRoutes from './routes/admin.js';

export const app = express();

// Behind no proxy, but express-rate-limit needs to know that to key limits by
// the real address rather than trusting a forwarded header it should ignore.
app.set('trust proxy', false);
app.disable('x-powered-by');

app.use(helmet());

// Only the Vite dev origin. A permissive CORS policy on an API that carries a
// bearer token is how a page on another origin gets to act as the user.
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? 'http://127.0.0.1:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(express.json({ limit: '256kb' }));

// Authentication is the expensive endpoint to brute-force, so it is limited
// separately and much more tightly than ordinary reads.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT ?? 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'too many authentication attempts, try again shortly' },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT ?? 300),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

app.use('/api', generalLimiter);

// Runs on every request: attaches req.user when a valid token is present and
// otherwise leaves it undefined, so anonymous requests fall through to the
// most restricted pool rather than being rejected outright.
app.use(attachUser);

app.get('/api/health', async (_req, res) => {
  try {
    const result = await runTraced('SELECT now() AS server_time, current_user AS db_role', [], pools.CUSTOMER);
    res.json({ status: 'ok', database: 'reachable', ...result.rows[0] });
  } catch (err) {
    res.status(503).json({ status: 'degraded', database: 'unreachable', error: err.message });
  }
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/departures', departureRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/travellers', travellerRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `no route for ${req.method} ${req.originalUrl}` });
});

// Last, and with four parameters, or Express will not recognise it as the error
// handler. Express 5 forwards rejected promises here automatically, which is
// why no route wraps its body in a try/catch solely to call next(err).
app.use(errorHandler);

const PORT = Number(process.env.API_PORT ?? 4000);
const HOST = process.env.API_HOST ?? '127.0.0.1';

// Started only when run directly. Importing this module from the test suite
// must not bind a port.
//
// pathToFileURL, not a template string: a raw `file://${argv[1]}` never
// matches import.meta.url on Windows, where argv[1] is a backslash path
// (e.g. "C:\foo\server.js") and import.meta.url is a proper, forward-slash,
// percent-encoded file:// URL. The mismatch made isMain always false, so
// the server silently never bound to a port — the process just exited.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const server = app.listen(PORT, HOST, () => {
    console.log(`VoyageX API listening on http://${HOST}:${PORT}`);
    console.log(`  database  ${process.env.PGDATABASE ?? 'travel_tourism'}`);
    console.log(`  client    ${process.env.CLIENT_ORIGIN ?? 'http://127.0.0.1:5173'}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} — closing server and pools`);
    server.close(async () => {
      await closeAllPools();
      process.exit(0);
    });
    // Do not wait indefinitely for connections that will not close.
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

export default app;
