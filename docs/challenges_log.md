# Challenges Faced and Solutions Attempted

**Feeds report section 14.** Maintained as the project proceeds, so that section 14 is a record
rather than a recollection. Entries are added when a problem is hit, and closed when it is
resolved — including the attempts that did not work, which are usually the more informative
half.

---

## C-01 · Two courses, one codebase, different rubrics

**When:** 2026-09-26 · **Status:** Resolved

**Challenge.** The same system must satisfy a DBMS project, graded on database depth, and a
Software Engineering mid-semester evaluation, graded on process evidence. The obvious risk was
producing two half-projects, or documentation that describes a system different from the one
built.

**Attempted and rejected.** Maintaining separate documentation for each course. This
duplicates effort and guarantees drift between the two descriptions.

**Solution.** One set of documents, written so that each serves both: the SRS carries the
database constraints as first-class requirements; the architecture document justifies the
database-centric design in software-engineering terms; the traceability matrix links
requirements to SQL artifacts as well as to modules. The two rubrics reward different things
but do not conflict, so the deliverables are additive rather than divergent.

---

## C-02 · Business logic in the database versus a layered, testable design

**When:** 2026-09-26 · **Status:** Resolved — recorded as ADR-02

**Challenge.** The DBMS course requires triggers and stored procedures. Software-engineering
practice puts business logic in a service layer where it can be unit-tested and kept
framework-agnostic. These pull in opposite directions on the single most important rule in the
system — seat allocation.

**Attempted and rejected.**
1. *Logic in the service layer with optimistic locking.* Testable, conventional, and wrong for
   this system: it protects only callers that go through the service, so direct SQL or a future
   client could still oversell.
2. *Splitting the difference* — validation in the service, decrement in a trigger. This is the
   worst option: the invariant is then enforced in neither place completely, and a reader has
   to check both to know what is guaranteed.

**Solution.** Keep the logic in the database and treat it as a deliberate architectural
decision with a written rationale (ADR-02), including its costs: the logic cannot be
unit-tested in isolation, it is split across two languages, and migrations become coupled to
logic changes. The compensating measure is integration tests against a real PostgreSQL
instance, plus an explicit note in the coverage report explaining why JavaScript line coverage
understates what is tested.

---

## C-03 · Seven days to the mid-semester deadline with no implementation started

**When:** 2026-09-26 · **Status:** Open — tracked as risk R-01

**Challenge.** Version control for the project began on 2026-09-26; the deadline is
2026-10-03. Eight implementation phases are outstanding and the plan has no slack.

**Attempted and rejected.** Building breadth first — several screens partially working — in
the hope that the evaluation credits visible surface area. The handout is explicit that it
wants *at least one working end-to-end feature*, so breadth without depth scores worse than
one complete path.

**Solution so far.** Fix the end-to-end path (register → search → book → view booking) as
non-negotiable, and decide the scope-reduction order in advance (`project_plan.md` §5) so that
a slip is absorbed by dropping known items rather than by improvising on the final evening.
Daily exit conditions make a slip visible on the day it occurs. *To be updated with the actual
outcome.*

---

## C-04 · Design artifacts that must precede the code they describe

**When:** 2026-09-26 · **Status:** Resolved

**Challenge.** The git history is submitted as process evidence. Wireframes and an SRS
committed *after* the implementation they describe are visibly retrofitted, and the compressed
schedule creates pressure to write code first and document later.

**Solution.** Phase 1 is done and committed before any schema or client file exists. The
wireframes are dated 2026-09-26 and precede every client commit; the SRS precedes the DDL. This
cost a day of the seven, which is accepted.

---

## C-05 · The seeded cancellation data had almost no learnable signal

**When:** 2026-09-26 · **Status:** Resolved

**Challenge.** The seed generator biases cancellations on plausible drivers so the Phase 12
model has something real to learn. After the first working run, the bias looked present — the
cancellation rate fell cleanly from 33% to 9% across paid-ratio buckets — but a held-out
logistic regression scored **ROC-AUC 0.54** and a random forest 0.59. Barely better than
guessing, against a target band of 0.75-0.85.

Had this not been measured, it would have surfaced in Phase 12 as a model that could not be
trained, with a week less time to fix it.

**Attempted and rejected.**
1. *Assuming the models were at fault.* Scaling the features and raising the iteration limit
   lifted the logistic regression a little, but the random forest needs no scaling and was also
   weak, so the problem was in the data.
2. *Simply turning up the coefficients.* This would have masked the real defect and produced
   data whose drivers were implausibly strong.

**Solution.** Reading the generator, `prior_cancel_rate` — the strongest intended driver — was
read during the planning loop but only updated during the writing loop, which runs afterwards.
It was therefore zero for every booking, and the customer-history term contributed nothing at
all.

A customer's history can only be known in booking order, so the fix was structural rather than
a one-line correction: bookings are now sorted by date and cancellations are simulated forward
through time, each decision updating the history the next one reads. Because the intercept is
calibrated by bisection over that simulation, the per-booking uniform draws are made once up
front so the simulation is deterministic in the intercept and the bisection converges.

With the history term live, the noise term was reduced from 0.9 to 0.45 and the coefficients
raised modestly. Re-measured: **logistic regression ROC-AUC 0.800, random forest 0.779,
accuracy 0.79-0.80** — inside the target band.

**Cost.** Roughly an hour, and the restructuring of the booking-planning loop. Worth it: the
lesson is that "the bias is in the code" is not evidence the bias reached the data. The
per-bucket rates looked convincing while the model saw almost nothing.

---

## C-06 · Six tests failed on their own assumptions, not on a defect in the code

**When:** 2026-09-26 · **Status:** Resolved

**Challenge.** The first complete run of the Phase 8 suite gave 89 passing and 6 failing. The
temptation with a red suite is to reach for the production code.

**Diagnosis.** None of the six was a bug in the system. Five shared one root cause: `setup.js`
truncates every table and reloads the fixture before **each** test, but those API tests had been
written assuming the account registered in an earlier test still existed. The isolation was
correct; the tests were written against the wrong model of it. The symptoms were misleading —
a duplicate-email check returning 201, a valid login returning 401, `/api/auth/me` returning
404 — each of which reads like a real authentication defect.

The sixth was a genuine JavaScript subtlety. The test asserted that three hostile filter keys
were ignored, and only two were. In an object literal, `{'__proto__': 'z'}` sets the
prototype rather than creating an own property, so `Object.entries` never sees it and the key
was never in the input at all. Notably the equivalent HTTP test passed, because Express's query
parser does create it as an own property — so the same assertion was meaningful over HTTP and
meaningless in the unit test.

**Attempted and rejected.** Relaxing the per-test reset to per-file, which would have turned all
five green immediately. Rejected: order-dependent tests pass as a suite and fail when one is run
alone, and the isolation is what makes the table trustworthy.

**Solution.** Each API test now creates the account it needs, so no test depends on another
having run. The unit test builds its input with `JSON.parse`, which creates a real own
`__proto__` property and also matches how a request body actually arrives. Result: 95 passing.

**Worth keeping.** A failing test is a claim about the system, and the claim needs verifying
like any other. Five of these looked exactly like authentication bugs and were not. Reading the
failure before reaching for the code is what separated "the tests are wrong" from "the login is
broken".

---

## C-07 · The database-transparency feature was shipping more than SQL text

**When:** 2026-10-02 · **Status:** Resolved

**Challenge.** FR-24 was built exactly as specified: every traced response carried `sql`,
`params`, `columns`, `rows`, `rowCount`, `executionMs` and `plan`, shown on every data screen to
every role, including an anonymous visitor browsing the catalogue. Building the rest of the
system on top of it surfaced what that actually meant in practice — `params` is the bound
*values*, not just placeholder names, and `rows` is the full result set. A customer's own screen
was shipping other customers' row data and the live schema's shape to whichever role, or
whichever unauthenticated request, happened to be looking.

**Attempted and rejected.** Redacting `rows`/`params` specifically while keeping `sql` visible
everywhere. Rejected: the SQL text alone, plus column names, already discloses schema structure
to an anonymous caller, and a transparency feature that silently withholds half its own evidence
is a worse answer than an honest scope change.

**Solution.** Gate the whole trace behind role rather than redact pieces of it.
`server/utils/runTraced.js` gained `traceFor(req, trace)`, returning the trace only when
`req.user.role === 'DB_ADMIN'`, `undefined` otherwise — and `undefined` drops the JSON key
entirely rather than sending an empty placeholder. Thirteen response sites across six route
files were updated to call it. The client needed no changes: `QueryTrace.jsx` already no-ops on
a missing trace. Verified live against all four roles before committing, and later covered by
TC-A-18 … TC-A-20 (present for DB_ADMIN) and TC-A-24 (absent for everyone else).

**Consequence for the mid-semester evidence.** FR-24's acceptance condition — "the executed SQL
is visible" — now has to be demonstrated from a DB_ADMIN login, not from the customer flow the
mid-semester walkthrough otherwise follows. `SRS.md` §3.6 and §5.2 both carry this note; the
demonstration video script must account for it.

---

## C-08 · The documented demo password never actually worked

**When:** 2026-10-02 · **Status:** Resolved

**Challenge.** `db/seed.py`'s `DEMO_PASSWORD_HASH` was commented as "bcrypt of `voyagex-demo`",
used for every seeded demo account (`manager@example.test`, `dbadmin@example.test`, and 400+
generated customers). It was reported directly by a user trying to log in as `manager` after
following the README: 401 on the documented credentials.

**Diagnosis.** `bcrypt.compare('voyagex-demo', DEMO_PASSWORD_HASH)` returns `false`. The hash is
a generic example value that circulates in bcrypt tutorials — apparently copied in rather than
actually generated from the stated password — so **no seeded account's documented password had
ever worked**, for any role, since the seed script was written.

**Attempted and rejected.** Nothing — this is the rare case where the first hypothesis (the
comment is simply wrong) was also the right one, confirmed in one line with `bcrypt.compare`
before touching anything.

**Solution.** Generated the real hash of `voyagex-demo` at the project's own cost factor (12)
and replaced `DEMO_PASSWORD_HASH` in `seed.py`. The already-seeded development database was
fixed in place with a single `UPDATE … WHERE password_hash = '<old value>'`, so existing
non-demo (real customer-registered) accounts were untouched — 414 rows updated. The identical
bug, with the identical comment, existed independently in `tests/fixtures/sample_data.sql`
(different file, same copy-pasted hash) and was fixed the same way, which is also how it was
noticed that the fixture seeded no DB_ADMIN account at all — see C-09.

**Worth keeping.** A comment asserting what a hash decodes to is a claim, not a fact, and
nothing had ever checked it. The same class of bug existed in two unrelated files, independently
written, because both copied the same wrong source.

---

## C-09 · The automated test suite could not run on Windows at all

**When:** 2026-10-02 · **Status:** Resolved

**Challenge.** Re-running the Phase 8 suite to verify a code change (C-07) on a Windows
development machine failed before a single test ran: `tests/globalSetup.js` threw
`db/reset.sh --test failed`, with no further detail — looking exactly like a database
connectivity problem, especially since this machine *also* had a real, unrelated connectivity
issue at the time (Windows Application Control blocking `pg_isready.exe`, and earlier,
`plpgsql.dll`).

**Attempted and rejected.** Chasing the Application Control angle first, since it was the known,
already-diagnosed problem on this machine. A local shim for `pg_isready` fixed that half, but
the suite still failed identically — same empty error, no stdout, no stderr.

**Diagnosis.** `execFileSync('./db/reset.sh', …)` asks Windows' `CreateProcess` to resolve and
run a file whose only indication of how to execute it is a `#!/usr/bin/env bash` shebang line.
Windows has no concept of a shebang; `CreateProcess` fails with `EFTYPE` before the script's own
logic ever runs — which also explains the empty stdout/stderr, since nothing was ever spawned.
This is unrelated to the Application Control issue, and would have failed on this machine even
with that fully resolved. `SRS.md` §2.4 states the host as "Linux or macOS" — the suite had
never actually been exercised against `npm test` on the OS a Windows-based grader might use.

**Solution.** Invoke `bash ./db/reset.sh --test --quiet` explicitly rather than relying on
direct shebang execution. This is not a Windows-only branch: it runs identically on Linux and
macOS, where `bash` is already on `PATH` as a prerequisite of running the script at all. One line
changed in `tests/globalSetup.js`.

**Also found while fixing this.** `tests/fixtures/sample_data.sql` had never seeded a DB_ADMIN
account (see C-08), and the suite's `authLimiter` (30 requests/15min, meant to slow
brute-forcing against a real deployment) was throttling the suite itself once enough tests
needed a fresh login — both fixed alongside this, since none of the new DB_ADMIN-gating tests
(C-07) could otherwise run to completion. `tests/setup.js` now raises `AUTH_RATE_LIMIT` for the
test environment the same way it already lowers `BCRYPT_ROUNDS`.

**Worth keeping.** "The tests can't even start" and "the database is unreachable" produce an
identical, nearly empty error from this harness. The fix for one is not evidence the other isn't
also real — this session had both at once, from unrelated causes, on the same machine.

---

## Template for new entries

```
## C-nn · <short title>

**When:** YYYY-MM-DD · **Status:** Open | Resolved

**Challenge.** What went wrong or was hard, specifically.

**Attempted and rejected.** What was tried first and why it did not work.

**Solution.** What was done instead, and what it cost.
```
