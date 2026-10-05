# Test Cases

**Generated from a real test run — do not edit by hand.**
Regenerate with `npm run test:report`.

Run on 2026-10-02 15:34:56 UTC ·
**101 passed, 0 failed** of 101 ·
38.8s total

> This table is produced by `scripts/generate_test_table.js` from vitest's JSON
> reporter output. The status column reflects what the runner actually reported on
> the date above, not what was intended. A hand-written version of this table would
> record beliefs; this one records results.

---

## Summary by module

| Module | Tests | Passed | Failed | Requirements covered |
|---|---:|---:|---:|---|
| Integration — HTTP API | 24 | 24 | 0 | FR-01, FR-02, FR-24, FR-26, FR-27, NFR-04 |
| Integration — booking | 17 | 17 | 0 | FR-10 … FR-14, FR-18, FR-19 |
| Integration — concurrency | 4 | 4 | 0 | FR-12, NFR-02 |
| Integration — RBAC | 13 | 13 | 0 | FR-03, NFR-03 |
| Integration — triggers | 13 | 13 | 0 | FR-13, FR-20, FR-21, FR-28 |
| Unit — filter builder | 8 | 8 | 0 | FR-06, NFR-04 |
| Unit — refund tiers | 14 | 14 | 0 | FR-18 |
| Unit — traced result | 8 | 8 | 0 | FR-24 |
| **Total** | **101** | **101** | **0** | |

---

## Test cases

| ID | Module | Test (the expected result) | Context / input | Actual | Status | ms |
|---|---|---|---|---|---|---:|
| TC-A-01 | Integration — HTTP API | registers an account and returns a token | authentication | As expected | PASS | 1222 |
| TC-A-02 | Integration — HTTP API | refuses a duplicate email with 409 | authentication | As expected | PASS | 999 |
| TC-A-04 | Integration — HTTP API | bad credentials return 401 and NO token | authentication | As expected | PASS | 1077 |
| TC-A-05 | Integration — HTTP API | an unknown email is indistinguishable from a wrong password | authentication | As expected | PASS | 1428 |
| TC-A-06 | Integration — HTTP API | a valid login returns a token and the role | authentication | As expected | PASS | 1022 |
| TC-R-03 | Integration — HTTP API | an unauthenticated write is refused with 401 | authorisation | As expected | PASS | 600 |
| TC-R-03b | Integration — HTTP API | a protected read is refused without a token | authorisation | As expected | PASS | 666 |
| TC-R-03c | Integration — HTTP API | a malformed token is treated as no token, never as valid | authorisation | As expected | PASS | 629 |
| TC-A-07 | Integration — HTTP API | a customer may not record a payment | authorisation | As expected | PASS | 739 |
| TC-A-18 | Integration — HTTP API | catalogue, detail, departures, bookings, travellers, payments, me all trace for DB_ADMIN | the SQL trace is visible to DB_ADMIN only (FR-24) | As expected | PASS | 1164 |
| TC-A-19 | Integration — HTTP API | placeholders are never interpolated into the returned SQL | the SQL trace is visible to DB_ADMIN only (FR-24) | As expected | PASS | 1133 |
| TC-A-20 | Integration — HTTP API | an empty result still reports its column names | the SQL trace is visible to DB_ADMIN only (FR-24) | As expected | PASS | 1203 |
| TC-A-24 | Integration — HTTP API | the same endpoints carry no trace at all for a customer, or anonymously | the SQL trace is visible to DB_ADMIN only (FR-24) | As expected | PASS | 645 |
| TC-A-03 | Integration — HTTP API | a malicious filter KEY does not alter the generated SQL | injection resistance (NFR-04) | As expected | PASS | 1203 |
| TC-A-03b | Integration — HTTP API | the booking table still exists afterwards | injection resistance (NFR-04) | As expected | PASS | 703 |
| TC-A-03c | Integration — HTTP API | a malicious filter VALUE is bound, not executed | injection resistance (NFR-04) | As expected | PASS | 1125 |
| TC-A-21 | Integration — HTTP API | insufficient seats surfaces as 409 with the domain code | booking over HTTP | As expected | PASS | 736 |
| TC-A-22 | Integration — HTTP API | a customer cannot book another customer's travellers | booking over HTTP | As expected | PASS | 921 |
| TC-A-23 | Integration — HTTP API | an unknown route returns 404 as JSON | booking over HTTP | As expected | PASS | 1093 |
| TC-A-25 | Integration — HTTP API | DB_ADMIN runs a SELECT and gets columns and rows back | the DB_ADMIN custom query console (FR-26, FR-27) | As expected | PASS | 1592 |
| TC-A-26 | Integration — HTTP API | a write is refused by the sql_console_ro grant, not by this route | the DB_ADMIN custom query console (FR-26, FR-27) | As expected | PASS | 1220 |
| TC-A-27 | Integration — HTTP API | a customer is refused the console with 403, an anonymous caller with 401 | the DB_ADMIN custom query console (FR-26, FR-27) | As expected | PASS | 854 |
| TC-A-28 | Integration — HTTP API | the schema browser lists public tables and columns for DB_ADMIN only | the DB_ADMIN custom query console (FR-26, FR-27) | As expected | PASS | 1231 |
| TC-A-29 | Integration — HTTP API | logs both a successful and a refused statement to admin_query_log (FR-27) | the DB_ADMIN custom query console (FR-26, FR-27) | As expected | PASS | 1156 |
| TC-B-01 | Integration — booking | books available seats and returns the new booking id | book_package | As expected | PASS | 149 |
| TC-B-02 | Integration — booking | refuses to oversell and leaves NOTHING behind | book_package | As expected | PASS | 226 |
| TC-B-03 | Integration — booking | decrements available_seats by exactly num_travellers | book_package | As expected | PASS | 160 |
| TC-B-03b | Integration — booking | taking the last seat marks the departure FULL | book_package | As expected | PASS | 127 |
| TC-B-03c | Integration — booking | a sold-out departure cannot be booked | book_package | As expected | PASS | 134 |
| TC-B-06 | Integration — booking | an agent booking records the employee, a customer booking does not | book_package | As expected | PASS | 188 |
| TC-B-07 | Integration — booking | raises a pending payment for the full amount | book_package | As expected | PASS | 136 |
| TC-B-08 | Integration — booking | refuses travellers belonging to another customer | book_package | As expected | PASS | 380 |
| TC-B-09 | Integration — booking | refuses the same traveller twice on one booking | book_package | As expected | PASS | 194 |
| TC-B-10 | Integration — booking | refuses an empty traveller list | book_package | As expected | PASS | 200 |
| TC-B-04 | Integration — booking | restores the seats the booking held | cancel_booking | As expected | PASS | 198 |
| TC-B-04b | Integration — booking | returns a FULL departure to SCHEDULED | cancel_booking | As expected | PASS | 156 |
| TC-B-05 | Integration — booking | a SECOND cancellation is refused by the unique constraint | cancel_booking | As expected | PASS | 243 |
| TC-B-11 | Integration — booking | computes the refund from the days-remaining scale | cancel_booking | As expected | PASS | 151 |
| TC-B-12 | Integration — booking | a zero refund still records the cancellation and its penalty | cancel_booking | As expected | PASS | 147 |
| TC-B-13 | Integration — booking | refuses to cancel a booking whose departure has finished | cancel_booking | As expected | PASS | 128 |
| TC-B-14 | Integration — booking | cancelling a PENDING booking invents no seats | cancel_booking | As expected | PASS | 206 |
| TC-C-01 | Integration — concurrency | exactly one of two simultaneous bookings succeeds | concurrent booking of the last seat | As expected | PASS | 247 |
| TC-C-02 | Integration — concurrency | the loser BLOCKS on the row lock rather than racing | concurrent booking of the last seat | As expected | PASS | 1468 |
| TC-C-03 | Integration — concurrency | five clients contending for one seat still yield exactly one booking | concurrent booking of the last seat | As expected | PASS | 344 |
| TC-C-04 | Integration — concurrency | the CHECK constraint stops a writer that bypasses the procedure | concurrent booking of the last seat | As expected | PASS | 274 |
| TC-R-01 | Integration — RBAC | DELETE on booking is refused by PostgreSQL with SQLSTATE 42501 | app_agent | As expected | PASS | 208 |
| TC-R-01b | Integration — RBAC | holds no DELETE on ANY table | app_agent | As expected | PASS | 241 |
| TC-R-01c | Integration — RBAC | can still read and write bookings, which is its job | app_agent | As expected | PASS | 202 |
| TC-R-01d | Integration — RBAC | cannot read the audit trail | app_agent | As expected | PASS | 183 |
| TC-R-02 | Integration — RBAC | INSERT is refused | sql_console_ro | As expected | PASS | 234 |
| TC-R-02b | Integration — RBAC | UPDATE and DELETE are refused | sql_console_ro | As expected | PASS | 246 |
| TC-R-02c | Integration — RBAC | cannot EXECUTE the booking procedure either | sql_console_ro | As expected | PASS | 268 |
| TC-R-02d | Integration — RBAC | can SELECT, which is what it is for | sql_console_ro | As expected | PASS | 260 |
| TC-R-04 | Integration — RBAC | cannot INSERT a booking directly | app_customer | As expected | PASS | 325 |
| TC-R-04b | Integration — RBAC | CAN book through the procedure — the point of SECURITY DEFINER | app_customer | As expected | PASS | 247 |
| TC-R-04c | Integration — RBAC | cannot read the audit trail | app_customer | As expected | PASS | 215 |
| TC-R-04d | Integration — RBAC | CAN delete its own travellers — the FR-05 delete interface | app_customer | As expected | PASS | 205 |
| TC-R-05 | Integration — RBAC | is NOT a PostgreSQL superuser | app_dbadmin | As expected | PASS | 296 |
| TC-T-01 | Integration — triggers | writes an audit row on a status change, with no application insert | trg_booking_audit | As expected | PASS | 145 |
| TC-T-01b | Integration — triggers | writes NOTHING when a non-status column changes | trg_booking_audit | As expected | PASS | 131 |
| TC-T-01c | Integration — triggers | attributes the change to the actor published by the API | trg_booking_audit | As expected | PASS | 127 |
| TC-T-01d | Integration — triggers | records an unattributed change rather than refusing it | trg_booking_audit | As expected | PASS | 128 |
| TC-T-02 | Integration — triggers | refuses a guide assignment overlapping another for the same guide | trg_guide_no_overlap | As expected | PASS | 152 |
| TC-T-02b | Integration — triggers | accepts a non-overlapping assignment for the same guide | trg_guide_no_overlap | As expected | PASS | 200 |
| TC-T-02c | Integration — triggers | treats touching date ranges as overlapping | trg_guide_no_overlap | As expected | PASS | 128 |
| TC-T-03 | Integration — triggers | a negative seat count is blocked by the CHECK constraint | seat constraints | As expected | PASS | 178 |
| TC-T-03b | Integration — triggers | seats above the total are blocked too | seat constraints | As expected | PASS | 202 |
| TC-T-04 | Integration — triggers | refuses a review of a booking that is not COMPLETED | trg_review_valid | As expected | PASS | 208 |
| TC-T-04b | Integration — triggers | refuses a review by someone other than the booking customer | trg_review_valid | As expected | PASS | 195 |
| TC-T-04c | Integration — triggers | fills customer_id in from the booking when omitted | trg_review_valid | As expected | PASS | 189 |
| TC-T-04d | Integration — triggers | still allows only one review per booking | trg_review_valid | As expected | PASS | 134 |
| TC-U-01a | Unit — filter builder | emits sequential $n placeholders in order | buildWhere — whitelisted filter construction | As expected | PASS | 137 |
| TC-U-01b | Unit — filter builder | continues numbering from startAt, for composing clauses | buildWhere — whitelisted filter construction | As expected | PASS | 124 |
| TC-U-01c | Unit — filter builder | discards unknown keys and reports them | buildWhere — whitelisted filter construction | As expected | PASS | 116 |
| TC-U-01d | Unit — filter builder | a SQL-injection attempt in a KEY changes nothing | buildWhere — whitelisted filter construction | As expected | PASS | 124 |
| TC-U-01e | Unit — filter builder | a SQL-injection attempt in a VALUE stays a bound parameter | buildWhere — whitelisted filter construction | As expected | PASS | 117 |
| TC-U-01f | Unit — filter builder | skips empty, null and undefined values | buildWhere — whitelisted filter construction | As expected | PASS | 131 |
| TC-U-01g | Unit — filter builder | no filters produces no WHERE clause at all | buildWhere — whitelisted filter construction | As expected | PASS | 111 |
| TC-U-01h | Unit — filter builder | ILIKE filters are wrapped for partial matching | buildWhere — whitelisted filter construction | As expected | PASS | 104 |
| TC-U-02 | Unit — refund tiers | 400 days before departure refunds 1 (far future) | refundPercentFor — the published penalty scale | As expected | PASS | 153 |
| TC-U-02 | Unit — refund tiers | 32 days before departure refunds 1 (comfortably over 30 days) | refundPercentFor — the published penalty scale | As expected | PASS | 121 |
| TC-U-02 | Unit — refund tiers | 31 days before departure refunds 1 (one day over the boundary) | refundPercentFor — the published penalty scale | As expected | PASS | 128 |
| TC-U-02 | Unit — refund tiers | 30 days before departure refunds 0.5 (EXACTLY 30 — the 50% tier, not 100%) | refundPercentFor — the published penalty scale | As expected | PASS | 122 |
| TC-U-02 | Unit — refund tiers | 29 days before departure refunds 0.5 (just inside 15-30) | refundPercentFor — the published penalty scale | As expected | PASS | 118 |
| TC-U-02 | Unit — refund tiers | 16 days before departure refunds 0.5 (upper-middle of 15-30) | refundPercentFor — the published penalty scale | As expected | PASS | 126 |
| TC-U-02 | Unit — refund tiers | 15 days before departure refunds 0.5 (EXACTLY 15 — still 50%) | refundPercentFor — the published penalty scale | As expected | PASS | 128 |
| TC-U-02 | Unit — refund tiers | 14 days before departure refunds 0.25 (EXACTLY 14 — drops to 25%) | refundPercentFor — the published penalty scale | As expected | PASS | 121 |
| TC-U-02 | Unit — refund tiers | 10 days before departure refunds 0.25 (middle of 7-14) | refundPercentFor — the published penalty scale | As expected | PASS | 124 |
| TC-U-02 | Unit — refund tiers | 7 days before departure refunds 0.25 (EXACTLY 7 — still 25%) | refundPercentFor — the published penalty scale | As expected | PASS | 119 |
| TC-U-02 | Unit — refund tiers | 6 days before departure refunds 0 (EXACTLY 6 — nothing back) | refundPercentFor — the published penalty scale | As expected | PASS | 120 |
| TC-U-02 | Unit — refund tiers | 1 days before departure refunds 0 (day before) | refundPercentFor — the published penalty scale | As expected | PASS | 126 |
| TC-U-02 | Unit — refund tiers | 0 days before departure refunds 0 (day of departure) | refundPercentFor — the published penalty scale | As expected | PASS | 134 |
| TC-U-02n | Unit — refund tiers | a departure already past refunds nothing | refundPercentFor — the published penalty scale | As expected | PASS | 124 |
| TC-U-03a | Unit — traced result | returns all seven keys of the traced shape | runTraced | As expected | PASS | 148 |
| TC-U-03b | Unit — traced result | keeps column names for an EMPTY result set | runTraced | As expected | PASS | 143 |
| TC-U-03c | Unit — traced result | never interpolates the bound values into the SQL text | runTraced | As expected | PASS | 135 |
| TC-U-03d | Unit — traced result | measures execution time as a number | runTraced | As expected | PASS | 121 |
| TC-U-03e | Unit — traced result | survives a driver that reports no fields | runTraced | As expected | PASS | 126 |
| TC-U-03f | Unit — traced result | a non-explainable statement does not fail the request | runTraced | As expected | PASS | 126 |
| TC-U-03g | Unit — traced result | refuses to run without a client rather than failing obscurely | runTraced | As expected | PASS | 118 |
| TC-U-03h | Unit — traced result | emptyTrace matches the same shape | runTraced | As expected | PASS | 130 |

---

## Coverage

_No coverage summary found. Generate one with `npm run test:coverage`._

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
