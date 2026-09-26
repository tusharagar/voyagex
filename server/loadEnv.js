/**
 * loadEnv.js — load the single repository-root .env, before anything reads it.
 *
 * This is imported FIRST by server.js, deliberately. ES module imports are
 * evaluated in declaration order before the importing module's own body runs,
 * and db/pools.js reads process.env while it is being evaluated. Calling
 * dotenv.config() in server.js's body instead would therefore run too late —
 * the pools would already have been built from an empty environment.
 *
 * One .env at the repository root serves the database script, the API and the
 * test suite. An earlier arrangement needed a second copy inside server/, which
 * is exactly the kind of setup step people get wrong once and debug for an hour.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

// dotenv never overwrites a variable that is already set, so anything exported
// in the shell (or injected by Docker Compose) still wins over the file.
dotenv.config({ path: path.join(here, '..', '.env') });
