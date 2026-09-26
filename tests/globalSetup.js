/**
 * globalSetup — build the test database once, before any test file runs.
 *
 * Phase 8 · SRS NFR-10
 *
 * Runs db/reset.sh --test, so the suite exercises the same build script a
 * developer and a grader run. If the schema, triggers, procedures or grants are
 * broken, the tests fail at setup with the build's own error rather than
 * producing a confusing cascade of assertion failures.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export default function setup() {
  const db = process.env.PGDATABASE_TEST ?? 'travel_test';
  process.stdout.write(`\n  building test database "${db}" via db/reset.sh --test\n`);
  try {
    execFileSync('./db/reset.sh', ['--test', '--quiet'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    throw new Error(`db/reset.sh --test failed — the tests cannot run:\n${out}`);
  }
  process.stdout.write('  test database ready\n');
}
