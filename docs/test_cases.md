# Test Cases

**Generated from a real test run — do not edit by hand.**
Regenerate with `npm run test:report`.

Run on 2026-09-26 15:09:02 UTC ·
**95 passed, 0 failed** of 95 ·
9.6s total

> This table is produced by `scripts/generate_test_table.js` from vitest's JSON
> reporter output. The status column reflects what the runner actually reported on
> the date above, not what was intended. A hand-written version of this table would
> record beliefs; this one records results.

---

## Summary by module

| Module | Tests | Passed | Failed | Requirements covered |
|---|---:|---:|---:|---|
| Integration — HTTP API | 18 | 18 | 0 | FR-01, FR-02, FR-24, NFR-04 |
| Integration — booking | 17 | 17 | 0 | FR-10 … FR-14, FR-18, FR-19 |
| Integration — concurrency | 4 | 4 | 0 | FR-12, NFR-02 |
| Integration — RBAC | 13 | 13 | 0 | FR-03, NFR-03 |
| Integration — triggers | 13 | 13 | 0 | FR-13, FR-20, FR-21, FR-28 |
| Unit — filter builder | 8 | 8 | 0 | FR-06, NFR-04 |
| Unit — refund tiers | 14 | 14 | 0 | FR-18 |
| Unit — traced result | 8 | 8 | 0 | FR-24 |
| **Total** | **95** | **95** | **0** | |

---

## Test cases

| ID | Module | Test (the expected result) | Context / input | Actual | Status | ms |
|---|---|---|---|---|---|---:|
| TC-A-01 | Integration — HTTP API | registers an account and returns a token | authentication | As expected | PASS | 261 |
| TC-A-02 | Integration — HTTP API | refuses a duplicate email with 409 | authentication | As expected | PASS | 211 |
| TC-A-04 | Integration — HTTP API | bad credentials return 401 and NO token | authentication | As expected | PASS | 380 |
| TC-A-05 | Integration — HTTP API | an unknown email is indistinguishable from a wrong password | authentication | As expected | PASS | 646 |
| TC-A-06 | Integration — HTTP API | a valid login returns a token and the role | authentication | As expected | PASS | 208 |
| TC-R-03 | Integration — HTTP API | an unauthenticated write is refused with 401 | authorisation | As expected | PASS | 164 |
| TC-R-03b | Integration — HTTP API | a protected read is refused without a token | authorisation | As expected | PASS | 139 |
| TC-R-03c | Integration — HTTP API | a malformed token is treated as no token, never as valid | authorisation | As expected | PASS | 150 |
| TC-A-07 | Integration — HTTP API | a customer may not record a payment | authorisation | As expected | PASS | 152 |
| TC-A-18 | Integration — HTTP API | catalogue, detail, departures, bookings, travellers, payments, me | every data endpoint returns the traced shape (FR-24) | As expected | PASS | 189 |
| TC-A-19 | Integration — HTTP API | placeholders are never interpolated into the returned SQL | every data endpoint returns the traced shape (FR-24) | As expected | PASS | 138 |
| TC-A-20 | Integration — HTTP API | an empty result still reports its column names | every data endpoint returns the traced shape (FR-24) | As expected | PASS | 136 |
| TC-A-03 | Integration — HTTP API | a malicious filter KEY does not alter the generated SQL | injection resistance (NFR-04) | As expected | PASS | 139 |
| TC-A-03b | Integration — HTTP API | the booking table still exists afterwards | injection resistance (NFR-04) | As expected | PASS | 135 |
| TC-A-03c | Integration — HTTP API | a malicious filter VALUE is bound, not executed | injection resistance (NFR-04) | As expected | PASS | 151 |
| TC-A-21 | Integration — HTTP API | insufficient seats surfaces as 409 with the domain code | booking over HTTP | As expected | PASS | 168 |
| TC-A-22 | Integration — HTTP API | a customer cannot book another customer's travellers | booking over HTTP | As expected | PASS | 140 |
| TC-A-23 | Integration — HTTP API | an unknown route returns 404 as JSON | booking over HTTP | As expected | PASS | 136 |
| TC-B-01 | Integration — booking | books available seats and returns the new booking id | book_package | As expected | PASS | 70 |
| TC-B-02 | Integration — booking | refuses to oversell and leaves NOTHING behind | book_package | As expected | PASS | 80 |
| TC-B-03 | Integration — booking | decrements available_seats by exactly num_travellers | book_package | As expected | PASS | 72 |
| TC-B-03b | Integration — booking | taking the last seat marks the departure FULL | book_package | As expected | PASS | 70 |
| TC-B-03c | Integration — booking | a sold-out departure cannot be booked | book_package | As expected | PASS | 64 |
| TC-B-06 | Integration — booking | an agent booking records the employee, a customer booking does not | book_package | As expected | PASS | 77 |
| TC-B-07 | Integration — booking | raises a pending payment for the full amount | book_package | As expected | PASS | 71 |
| TC-B-08 | Integration — booking | refuses travellers belonging to another customer | book_package | As expected | PASS | 73 |
| TC-B-09 | Integration — booking | refuses the same traveller twice on one booking | book_package | As expected | PASS | 89 |
| TC-B-10 | Integration — booking | refuses an empty traveller list | book_package | As expected | PASS | 75 |
| TC-B-04 | Integration — booking | restores the seats the booking held | cancel_booking | As expected | PASS | 84 |
| TC-B-04b | Integration — booking | returns a FULL departure to SCHEDULED | cancel_booking | As expected | PASS | 73 |
| TC-B-05 | Integration — booking | a SECOND cancellation is refused by the unique constraint | cancel_booking | As expected | PASS | 86 |
| TC-B-11 | Integration — booking | computes the refund from the days-remaining scale | cancel_booking | As expected | PASS | 88 |
| TC-B-12 | Integration — booking | a zero refund still records the cancellation and its penalty | cancel_booking | As expected | PASS | 82 |
| TC-B-13 | Integration — booking | refuses to cancel a booking whose departure has finished | cancel_booking | As expected | PASS | 55 |
| TC-B-14 | Integration — booking | cancelling a PENDING booking invents no seats | cancel_booking | As expected | PASS | 73 |
| TC-C-01 | Integration — concurrency | exactly one of two simultaneous bookings succeeds | concurrent booking of the last seat | As expected | PASS | 92 |
| TC-C-02 | Integration — concurrency | the loser BLOCKS on the row lock rather than racing | concurrent booking of the last seat | As expected | PASS | 1282 |
| TC-C-03 | Integration — concurrency | five clients contending for one seat still yield exactly one booking | concurrent booking of the last seat | As expected | PASS | 71 |
| TC-C-04 | Integration — concurrency | the CHECK constraint stops a writer that bypasses the procedure | concurrent booking of the last seat | As expected | PASS | 60 |
| TC-R-01 | Integration — RBAC | DELETE on booking is refused by PostgreSQL with SQLSTATE 42501 | app_agent | As expected | PASS | 63 |
| TC-R-01b | Integration — RBAC | holds no DELETE on ANY table | app_agent | As expected | PASS | 60 |
| TC-R-01c | Integration — RBAC | can still read and write bookings, which is its job | app_agent | As expected | PASS | 60 |
| TC-R-01d | Integration — RBAC | cannot read the audit trail | app_agent | As expected | PASS | 63 |
| TC-R-02 | Integration — RBAC | INSERT is refused | sql_console_ro | As expected | PASS | 57 |
| TC-R-02b | Integration — RBAC | UPDATE and DELETE are refused | sql_console_ro | As expected | PASS | 57 |
| TC-R-02c | Integration — RBAC | cannot EXECUTE the booking procedure either | sql_console_ro | As expected | PASS | 52 |
| TC-R-02d | Integration — RBAC | can SELECT, which is what it is for | sql_console_ro | As expected | PASS | 54 |
| TC-R-04 | Integration — RBAC | cannot INSERT a booking directly | app_customer | As expected | PASS | 71 |
| TC-R-04b | Integration — RBAC | CAN book through the procedure — the point of SECURITY DEFINER | app_customer | As expected | PASS | 79 |
| TC-R-04c | Integration — RBAC | cannot read the audit trail | app_customer | As expected | PASS | 61 |
| TC-R-04d | Integration — RBAC | CAN delete its own travellers — the FR-05 delete interface | app_customer | As expected | PASS | 54 |
| TC-R-05 | Integration — RBAC | is NOT a PostgreSQL superuser | app_dbadmin | As expected | PASS | 63 |
| TC-T-01 | Integration — triggers | writes an audit row on a status change, with no application insert | trg_booking_audit | As expected | PASS | 88 |
| TC-T-01b | Integration — triggers | writes NOTHING when a non-status column changes | trg_booking_audit | As expected | PASS | 78 |
| TC-T-01c | Integration — triggers | attributes the change to the actor published by the API | trg_booking_audit | As expected | PASS | 84 |
| TC-T-01d | Integration — triggers | records an unattributed change rather than refusing it | trg_booking_audit | As expected | PASS | 63 |
| TC-T-02 | Integration — triggers | refuses a guide assignment overlapping another for the same guide | trg_guide_no_overlap | As expected | PASS | 63 |
| TC-T-02b | Integration — triggers | accepts a non-overlapping assignment for the same guide | trg_guide_no_overlap | As expected | PASS | 68 |
| TC-T-02c | Integration — triggers | treats touching date ranges as overlapping | trg_guide_no_overlap | As expected | PASS | 83 |
| TC-T-03 | Integration — triggers | a negative seat count is blocked by the CHECK constraint | seat constraints | As expected | PASS | 95 |
| TC-T-03b | Integration — triggers | seats above the total are blocked too | seat constraints | As expected | PASS | 104 |
| TC-T-04 | Integration — triggers | refuses a review of a booking that is not COMPLETED | trg_review_valid | As expected | PASS | 67 |
| TC-T-04b | Integration — triggers | refuses a review by someone other than the booking customer | trg_review_valid | As expected | PASS | 89 |
| TC-T-04c | Integration — triggers | fills customer_id in from the booking when omitted | trg_review_valid | As expected | PASS | 78 |
| TC-T-04d | Integration — triggers | still allows only one review per booking | trg_review_valid | As expected | PASS | 48 |
| TC-U-01a | Unit — filter builder | emits sequential $n placeholders in order | buildWhere — whitelisted filter construction | As expected | PASS | 60 |
| TC-U-01b | Unit — filter builder | continues numbering from startAt, for composing clauses | buildWhere — whitelisted filter construction | As expected | PASS | 47 |
| TC-U-01c | Unit — filter builder | discards unknown keys and reports them | buildWhere — whitelisted filter construction | As expected | PASS | 46 |
| TC-U-01d | Unit — filter builder | a SQL-injection attempt in a KEY changes nothing | buildWhere — whitelisted filter construction | As expected | PASS | 55 |
| TC-U-01e | Unit — filter builder | a SQL-injection attempt in a VALUE stays a bound parameter | buildWhere — whitelisted filter construction | As expected | PASS | 60 |
| TC-U-01f | Unit — filter builder | skips empty, null and undefined values | buildWhere — whitelisted filter construction | As expected | PASS | 48 |
| TC-U-01g | Unit — filter builder | no filters produces no WHERE clause at all | buildWhere — whitelisted filter construction | As expected | PASS | 46 |
| TC-U-01h | Unit — filter builder | ILIKE filters are wrapped for partial matching | buildWhere — whitelisted filter construction | As expected | PASS | 47 |
| TC-U-02 | Unit — refund tiers | 400 days before departure refunds 1 (far future) | refundPercentFor — the published penalty scale | As expected | PASS | 46 |
| TC-U-02 | Unit — refund tiers | 32 days before departure refunds 1 (comfortably over 30 days) | refundPercentFor — the published penalty scale | As expected | PASS | 40 |
| TC-U-02 | Unit — refund tiers | 31 days before departure refunds 1 (one day over the boundary) | refundPercentFor — the published penalty scale | As expected | PASS | 40 |
| TC-U-02 | Unit — refund tiers | 30 days before departure refunds 0.5 (EXACTLY 30 — the 50% tier, not 100%) | refundPercentFor — the published penalty scale | As expected | PASS | 44 |
| TC-U-02 | Unit — refund tiers | 29 days before departure refunds 0.5 (just inside 15-30) | refundPercentFor — the published penalty scale | As expected | PASS | 43 |
| TC-U-02 | Unit — refund tiers | 16 days before departure refunds 0.5 (upper-middle of 15-30) | refundPercentFor — the published penalty scale | As expected | PASS | 40 |
| TC-U-02 | Unit — refund tiers | 15 days before departure refunds 0.5 (EXACTLY 15 — still 50%) | refundPercentFor — the published penalty scale | As expected | PASS | 41 |
| TC-U-02 | Unit — refund tiers | 14 days before departure refunds 0.25 (EXACTLY 14 — drops to 25%) | refundPercentFor — the published penalty scale | As expected | PASS | 40 |
| TC-U-02 | Unit — refund tiers | 10 days before departure refunds 0.25 (middle of 7-14) | refundPercentFor — the published penalty scale | As expected | PASS | 39 |
| TC-U-02 | Unit — refund tiers | 7 days before departure refunds 0.25 (EXACTLY 7 — still 25%) | refundPercentFor — the published penalty scale | As expected | PASS | 49 |
| TC-U-02 | Unit — refund tiers | 6 days before departure refunds 0 (EXACTLY 6 — nothing back) | refundPercentFor — the published penalty scale | As expected | PASS | 43 |
| TC-U-02 | Unit — refund tiers | 1 days before departure refunds 0 (day before) | refundPercentFor — the published penalty scale | As expected | PASS | 43 |
| TC-U-02 | Unit — refund tiers | 0 days before departure refunds 0 (day of departure) | refundPercentFor — the published penalty scale | As expected | PASS | 44 |
| TC-U-02n | Unit — refund tiers | a departure already past refunds nothing | refundPercentFor — the published penalty scale | As expected | PASS | 43 |
| TC-U-03a | Unit — traced result | returns all seven keys of the traced shape | runTraced | As expected | PASS | 55 |
| TC-U-03b | Unit — traced result | keeps column names for an EMPTY result set | runTraced | As expected | PASS | 41 |
| TC-U-03c | Unit — traced result | never interpolates the bound values into the SQL text | runTraced | As expected | PASS | 43 |
| TC-U-03d | Unit — traced result | measures execution time as a number | runTraced | As expected | PASS | 57 |
| TC-U-03e | Unit — traced result | survives a driver that reports no fields | runTraced | As expected | PASS | 63 |
| TC-U-03f | Unit — traced result | a non-explainable statement does not fail the request | runTraced | As expected | PASS | 48 |
| TC-U-03g | Unit — traced result | refuses to run without a client rather than failing obscurely | runTraced | As expected | PASS | 44 |
| TC-U-03h | Unit — traced result | emptyTrace matches the same shape | runTraced | As expected | PASS | 44 |

---

## Coverage

| Metric | Covered |
|---|---|
| Statements | 75.2% (1094/1454) |
| Branches | 65.1% (97/149) |
| Functions | 80.0% (16/20) |
| Lines | 75.2% (1094/1454) |

### What this number does and does not mean

Coverage here is measured over `server/**`, which is the JavaScript layer only.
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
  database, so mocking it would leave nothing worth testing. `tests/globalSetup.js`
  builds the test database with `./db/reset.sh --test`, the same script a
  developer and a grader run.
- **Every test starts from the same state.** `tests/setup.js` truncates and
  reloads `tests/fixtures/sample_data.sql` before each test, so no test can pass
  only because another ran first.
- **Assertions read the database back.** Where a procedure reports success, the
  test checks the resulting rows with a separate connection rather than trusting
  the return value.
- **Access control is tested as the role.** The RBAC tests connect as
  `app_agent`, `sql_console_ro` and the rest, and assert on SQLSTATE `42501`
  rather than on message text, so they test PostgreSQL's refusal and not a
  middleware check.
