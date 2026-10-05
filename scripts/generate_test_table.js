#!/usr/bin/env node
/**
 * generate_test_table.js — turn a real vitest run into docs/test_cases.md.
 *
 * Phase 8 · brief §12.4 · SEPM report section 11
 *
 *   npx vitest run --reporter=json --outputFile=tests/results.json
 *   node scripts/generate_test_table.js
 *
 * or simply:  npm run test:report
 *
 * WHY THIS SCRIPT EXISTS
 *   The evaluation asks for a test-case table with inputs, expected results,
 *   actual results and pass/fail status. Such a table is trivial to write by
 *   hand and worth nothing when it is: it records what someone believed, not
 *   what happened. Generating it from the runner's own JSON means the
 *   expected/actual/status columns cannot drift from reality — if a test
 *   regresses, the table says so the next time it is generated.
 *
 *   The "expected result" column is read from the test's own name, which is why
 *   the tests are named as assertions ("refuses to oversell and leaves NOTHING
 *   behind") rather than as labels ("oversell test").
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RESULTS = path.join(root, 'tests', 'results.json');
const OUT = path.join(root, 'docs', 'test_cases.md');
const COVERAGE = path.join(root, 'coverage', 'coverage-summary.json');

if (!existsSync(RESULTS)) {
  console.error(`No test results at ${RESULTS}\n  run: npx vitest run --reporter=json --outputFile=tests/results.json`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(RESULTS, 'utf8'));

/** Which requirement area a test file covers, for grouping the table. */
const MODULES = [
  [/unit\/buildWhere/,        'Unit — filter builder',     'FR-06, NFR-04'],
  [/unit\/refundTiers/,       'Unit — refund tiers',       'FR-18'],
  [/unit\/runTraced/,         'Unit — traced result',      'FR-24'],
  [/integration\/booking/,    'Integration — booking',     'FR-10 … FR-14, FR-18, FR-19'],
  [/integration\/concurrency/, 'Integration — concurrency', 'FR-12, NFR-02'],
  [/integration\/triggers/,   'Integration — triggers',    'FR-13, FR-20, FR-21, FR-28'],
  [/integration\/rbac/,       'Integration — RBAC',        'FR-03, NFR-03'],
  [/integration\/api/,        'Integration — HTTP API',    'FR-01, FR-02, FR-24, FR-26, FR-27, NFR-04'],
];

function moduleFor(file) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const hit = MODULES.find(([re]) => re.test(rel));
  return hit ? { name: hit[1], reqs: hit[2], file: rel } : { name: 'Other', reqs: '—', file: rel };
}

/** Pull a TC-xx-nn identifier out of the test name, if it declares one. */
function idFrom(title, fallback) {
  const m = title.match(/\b(TC-[A-Z]-\d+[a-z]?)\b/);
  return m ? m[1] : fallback;
}

/** The test name minus its identifier, used as the expected result. */
function expectationFrom(title) {
  return title.replace(/\b TC-[A-Z]-\d+[a-z]?\b\s*/i, ' ').replace(/^TC-[A-Z]-\d+[a-z]?\s*/i, '').trim();
}

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();

const rows = [];
let passed = 0, failed = 0, skipped = 0;

for (const suite of report.testResults ?? []) {
  const mod = moduleFor(suite.name);
  for (const t of suite.assertionResults ?? []) {
    const status = t.status === 'passed' ? 'PASS' : t.status === 'failed' ? 'FAIL' : 'SKIP';
    if (status === 'PASS') passed += 1;
    else if (status === 'FAIL') failed += 1;
    else skipped += 1;

    const full = [...(t.ancestorTitles ?? []), t.title].join(' › ');
    rows.push({
      id: idFrom(t.title, `TC-${rows.length + 1}`),
      module: mod.name,
      reqs: mod.reqs,
      file: mod.file,
      context: (t.ancestorTitles ?? []).join(' › ') || '—',
      expectation: expectationFrom(t.title),
      status,
      durationMs: t.duration == null ? null : Math.round(t.duration),
      failure: (t.failureMessages ?? [])[0]?.split('\n')[0] ?? null,
      full,
    });
  }
}

const started = report.startTime ? new Date(report.startTime) : new Date();
const totalMs = rows.reduce((s, r) => s + (r.durationMs ?? 0), 0);

// ---- coverage, when a coverage run produced it -----------------------------
let coverageBlock = `_No coverage summary found. Generate one with \`npm run test:coverage\`._`;
if (existsSync(COVERAGE)) {
  const c = JSON.parse(readFileSync(COVERAGE, 'utf8')).total;
  const pct = (m) => `${m.pct.toFixed(1)}% (${m.covered}/${m.total})`;
  coverageBlock = [
    '| Metric | Covered |',
    '|---|---|',
    `| Statements | ${pct(c.statements)} |`,
    `| Branches | ${pct(c.branches)} |`,
    `| Functions | ${pct(c.functions)} |`,
    `| Lines | ${pct(c.lines)} |`,
  ].join('\n');
}

// ---- assemble --------------------------------------------------------------
const byModule = new Map();
for (const r of rows) {
  if (!byModule.has(r.module)) byModule.set(r.module, []);
  byModule.get(r.module).push(r);
}

let md = `# Test Cases

**Generated from a real test run — do not edit by hand.**
Regenerate with \`npm run test:report\`.

Run on ${started.toISOString().replace('T', ' ').slice(0, 19)} UTC ·
**${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}** of ${rows.length} ·
${(totalMs / 1000).toFixed(1)}s total

> This table is produced by \`scripts/generate_test_table.js\` from vitest's JSON
> reporter output. The status column reflects what the runner actually reported on
> the date above, not what was intended. A hand-written version of this table would
> record beliefs; this one records results.

---

## Summary by module

| Module | Tests | Passed | Failed | Requirements covered |
|---|---:|---:|---:|---|
`;

for (const [mod, list] of byModule) {
  const p = list.filter((r) => r.status === 'PASS').length;
  const f = list.filter((r) => r.status === 'FAIL').length;
  md += `| ${mod} | ${list.length} | ${p} | ${f} | ${list[0].reqs} |\n`;
}

md += `| **Total** | **${rows.length}** | **${passed}** | **${failed}** | |\n`;

md += `
---

## Test cases

| ID | Module | Test (the expected result) | Context / input | Actual | Status | ms |
|---|---|---|---|---|---|---:|
`;

for (const r of rows) {
  const actual = r.status === 'PASS' ? 'As expected'
    : r.status === 'FAIL' ? `**${esc(r.failure ?? 'assertion failed')}**`
    : 'Skipped';
  md += `| ${r.id} | ${esc(r.module)} | ${esc(r.expectation)} | ${esc(r.context)} | ${actual} | ${r.status} | ${r.durationMs ?? '—'} |\n`;
}

md += `
---

## Coverage

${coverageBlock}

### What this number does and does not mean

Coverage here is measured over \`server/**\`, which is the JavaScript layer only.
It **understates what is tested**, and the reason is architectural rather than an
oversight.

The most important logic in this system is not JavaScript. Seat allocation, the
refund scale, the audit trail, guide-overlap prevention and review validity are
PL/pgSQL inside PostgreSQL (ADR-02), and a V8 coverage tool cannot see a line of
it. That logic is covered by the integration tests above — which exercise it
against a real database and assert on the database's own state — but it
contributes nothing to the percentage.

Read the module table above as the measure of what is tested. The percentage is
reported because the evaluation asks for it, with this caveat attached rather
than omitted.

---

## Notes on how these tests run

- **A real PostgreSQL instance, not a mock.** The logic under test lives in the
  database, so mocking it would leave nothing worth testing. \`tests/globalSetup.js\`
  builds the test database with \`./db/reset.sh --test\`, the same script a
  developer and a grader run.
- **Every test starts from the same state.** \`tests/setup.js\` truncates and
  reloads \`tests/fixtures/sample_data.sql\` before each test, so no test can pass
  only because another ran first.
- **Assertions read the database back.** Where a procedure reports success, the
  test checks the resulting rows with a separate connection rather than trusting
  the return value.
- **Access control is tested as the role.** The RBAC tests connect as
  \`app_agent\`, \`sql_console_ro\` and the rest, and assert on SQLSTATE \`42501\`
  rather than on message text, so they test PostgreSQL's refusal and not a
  middleware check.
`;

writeFileSync(OUT, md);

console.log(`docs/test_cases.md written`);
console.log(`  ${rows.length} tests · ${passed} passed · ${failed} failed${skipped ? ` · ${skipped} skipped` : ''}`);
if (failed > 0) {
  console.log('\n  failing tests are recorded in the table as FAIL:');
  rows.filter((r) => r.status === 'FAIL').forEach((r) => console.log(`   - ${r.id} ${r.full}`));
}
