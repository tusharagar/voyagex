# Use-Case Model
## VoyageX — Travel and Tourism Management System

**Version:** 1.0 · **Date:** 2026-09-26 · **Traces to:** `SRS.md` §3, §6
**Diagram source:** [`uml/use_case_diagram.puml`](uml/use_case_diagram.puml)
**Render:** `plantuml -tpng docs/uml/use_case_diagram.puml`

---

# 1. Actors

| Actor | Type | Description | Database role |
|---|---|---|---|
| **Customer** | Primary, human | Books travel for themselves and their travellers | `app_customer` |
| **Agent** | Primary, human | Agency counter staff; transacts on behalf of walk-in customers | `app_agent` |
| **Manager** | Primary, human | Runs the catalogue and reads the business reports | `app_manager` |
| **DB Administrator** | Primary, human | Inspects and repairs data; reviews the audit trail | `app_dbadmin` |
| **Prediction Service** | Secondary, system | FastAPI service that returns a cancellation-risk score when called by the API | — |

A note on the fifth actor: the prediction service is drawn as a secondary actor rather than as
an internal component because it is a separate process with its own language runtime and its
own failure mode. If it is down, booking must still work. That boundary is recorded as ADR-04.

---

# 2. Use-case inventory

| ID | Use case | Primary actor | FR | Mid-sem |
|---|---|---|---|---|
| UC-01 | Register Account | Customer | FR-01 | ✅ |
| UC-02 | Log In | all | FR-02, FR-03 | ✅ |
| UC-03 | Search Packages | Customer, Agent | FR-06 | ✅ |
| UC-04 | Manage Profile | Customer | FR-04 | |
| UC-05 | Manage Travellers | Customer | FR-05 | ✅ |
| UC-06 | View Package Detail | Customer, Agent | FR-07, FR-08 | ✅ |
| UC-07 | Book Package | Customer | FR-10 … FR-13 | ✅ |
| UC-08 | View My Bookings | Customer, Agent | FR-14 | ✅ |
| UC-09 | Record Payment | Agent | FR-17 | |
| UC-10 | Cancel Booking | Customer, Agent | FR-18, FR-19 | ✅ |
| UC-11 | Book on Behalf of Customer | Agent | FR-15, FR-16 | |
| UC-12 | Manage Catalogue | Manager | FR-09 | |
| UC-13 | Submit Review | Customer | FR-20 | |
| UC-14 | Assign Guide | Manager | FR-21 | |
| UC-15 | Generate Revenue Report | Manager | FR-22 | |
| UC-16 | Browse Query Catalogue | Manager | FR-23 | |
| UC-17 | View Schema (ERD) | Manager, DBA | FR-25 | |
| UC-18 | Run Read-only Query | **DBA only** | FR-26 | *(built early, 2026-10-02 — see UC-19, same implementation)* |
| UC-19 | Execute Admin Query | DB Administrator | FR-26, FR-27 (logging clause only) | *(built early, 2026-10-02 — narrower than originally designed; see the note at the end of UC-19)* |
| UC-20 | View Audit Log | DBA, Manager | FR-28 | |
| UC-21 | Predict Cancellation Risk | Agent (← Prediction Service) | FR-29, FR-30 | |

**Included behaviours** (factored out because several use cases share them):
`Authenticate` (every use case behind a login), `Display Executed SQL` (every data-bearing use
case — this is FR-24 and it is why it is modelled as `<<include>>` rather than as a UI detail —
*revised 2026-10-02: the API attaches it only when the actor is DB Administrator, so every other
actor includes the behaviour without ever receiving its output; see the FR-24 note in `SRS.md`
§3.6*), and `Log Privileged Statement`.

**Extending behaviours:** `Compute Refund` extends *Cancel Booking* (it applies only when the
cancellation qualifies for a refund); `Record Payment` extends *Book Package*; `Submit Review`
extends *View My Bookings*; `Predict Cancellation Risk` extends *View My Bookings* when the
viewer is an agent.

---

# 3. Detailed use-case descriptions

The five use cases below are described in full because they carry the design: the booking path
contains the concurrency guarantee, cancellation contains the money rules, search contains the
injection-safety requirement, reporting contains the SQL the DBMS course grades, and the admin
console contains the privilege and audit design.

---

## UC-07 — Book Package

| Field | Value |
|---|---|
| **ID** | UC-07 |
| **Name** | Book Package |
| **Primary actor** | Customer |
| **Secondary actors** | — |
| **Stakeholders** | Customer (wants the seats), Agency owner (must not oversell), Manager (needs accurate availability) |
| **Traces to** | FR-10, FR-11, FR-12, FR-13, FR-24 · NFR-02 |
| **Priority** | Must · mid-semester increment |
| **Frequency** | The most frequent write operation in the system |

**Preconditions**
1. The customer is authenticated (`<<include>> Authenticate`).
2. At least one traveller exists on the customer's account (UC-05).
3. The chosen departure exists with status `SCHEDULED`.

**Trigger** — The customer selects a departure and confirms a set of travellers.

**Main success flow**

| # | Actor action | System response |
|---|---|---|
| 1 | Customer opens a package and selects a departure | System displays date, price per seat and seats currently available |
| 2 | Customer selects one or more of their travellers | System shows the number of seats requested and the computed total |
| 3 | Customer confirms | System calls the stored procedure `book_package(customer_id, departure_id, traveller_ids[])` inside one transaction |
| 4 | | Procedure locks the departure row: `SELECT available_seats, price … FOR UPDATE` |
| 5 | | Procedure verifies `available_seats >= array_length(traveller_ids, 1)` |
| 6 | | Procedure inserts the booking with status `CONFIRMED` and `total_amount = price × n` |
| 7 | | `AFTER INSERT` trigger decrements `departure.available_seats` by `n`, and sets departure status to `FULL` if it reaches zero |
| 8 | | Procedure inserts one `booking_traveller` row per traveller, and a `PENDING` payment row for the full amount |
| 9 | | Transaction commits, releasing the row lock; procedure returns the new `booking_id` |
| 10 | | System displays the booking confirmation together with the SQL executed, its bound parameters, row count and execution time (`<<include>> Display Executed SQL`) |

**Alternate flows**

- **A1 — Traveller not yet on file.** At step 2 the customer adds a traveller inline; UC-05 runs, then the flow resumes.
- **A2 — Agent acting for a walk-in customer.** UC-11 substitutes for steps 1–3; the agent's employee id is recorded in `booked_by_employee_id`. All remaining steps are identical, which is the point: the rule lives below both entry paths.

**Exception flows**

- **E1 — Insufficient seats.** At step 5 the requested count exceeds availability. The procedure raises `INSUFFICIENT_SEATS`; the transaction rolls back; no booking, no `booking_traveller` and no payment row exist. The UI shows a plain message with the number of seats actually left and returns the customer to step 1. *(FR-11, TC-B-02)*

- **E2 — Concurrent contention for the last seat.** Two customers reach step 3 for the same departure at the same moment. The first transaction takes the row lock at step 4; the second blocks at its own step 4 until the first commits, then reads the *updated* seat count and fails at step 5 with `INSUFFICIENT_SEATS`. Exactly one booking exists afterwards and `available_seats` is zero, never negative.
  Should a defect ever allow the decrement through, the `CHECK (available_seats >= 0)` constraint aborts the transaction as a backstop. *(FR-12, NFR-02, TC-C-01 — this is the single most important behaviour in the system)*

- **E3 — Departure cancelled between listing and confirmation.** The status read at step 4 is not `SCHEDULED`; the procedure raises `DEPARTURE_NOT_AVAILABLE` and the customer is returned to the package page.

- **E4 — Database unavailable.** The API returns HTTP 503 and the UI states that no booking was made. Because all work is in one transaction, there is no partial state to reconcile.

**Postconditions**

- *On success:* one `booking` row with status `CONFIRMED`; `n` `booking_traveller` rows; one `PENDING` payment row for the full amount; `departure.available_seats` reduced by exactly `n`; departure status `FULL` if zero.
- *On any failure:* the database is byte-for-byte as it was before the attempt.

**Business rules**
BR-01 A booking is always for one departure. · BR-02 Seats are allocated only against confirmed bookings. · BR-03 The price charged is the departure's price at the moment of booking, not the package's. · BR-04 Seat allocation is atomic with the seat check.

---

## UC-10 — Cancel Booking

| Field | Value |
|---|---|
| **ID** | UC-10 |
| **Primary actor** | Customer (self-service) or Agent (on behalf) |
| **Stakeholders** | Customer (wants the refund), Agency owner (wants the penalty applied and the seat resold), Manager (wants the seat back in inventory) |
| **Traces to** | FR-18, FR-19 · NFR-09 |
| **Priority** | Must · mid-semester increment |

**Preconditions**
1. Actor is authenticated and owns the booking, or is an agent.
2. Booking status is `CONFIRMED` or `PENDING`.
3. No `cancellation` row exists for the booking.

**Trigger** — The actor requests cancellation and supplies a reason.

**Main success flow**

| # | Actor action | System response |
|---|---|---|
| 1 | Actor opens the booking and selects Cancel | System shows departure date, amount paid and the refund the customer will receive under the current tier |
| 2 | Actor supplies a reason and confirms | System calls `cancel_booking(booking_id, reason, employee_id)` in one transaction |
| 3 | | Procedure computes days remaining as `departure.start_date − CURRENT_DATE` |
| 4 | | Procedure applies the refund tier (`<<extend>> Compute Refund`): **> 30 days → 100%**, **15–30 → 50%**, **7–14 → 25%**, **< 7 → 0%**; penalty is the remainder |
| 5 | | Procedure inserts the `cancellation` row with refund and penalty amounts |
| 6 | | Procedure updates `booking.status` to `CANCELLED` |
| 7 | | `AFTER UPDATE` trigger increments `departure.available_seats` by `num_travellers` and restores departure status to `SCHEDULED` |
| 8 | | A second `AFTER UPDATE` trigger writes the status change to `booking_audit` with old status, new status and actor |
| 9 | | Procedure inserts a `REFUNDED` payment row for the refund amount |
| 10 | | Transaction commits; the UI shows the refund, the penalty and the executed SQL |

**Alternate flows**
- **A1 — Zero refund.** Under 7 days the refund is zero. The `cancellation` row is still written with `refund_amount = 0` and the full penalty, and no `REFUNDED` payment row is created. The customer is shown the policy that produced the outcome.
- **A2 — Agent cancels for a customer.** `processed_by` carries the agent's employee id instead of `NULL`.

**Exception flows**
- **E1 — Already cancelled.** Step 5 violates `UNIQUE (cancellation.booking_id)`. The transaction rolls back; seats are *not* credited twice. The error surfaces as "this booking has already been cancelled". This is enforced by the database, not by an application check, so a double-submitted form cannot defeat it. *(FR-19, TC-B-05)*
- **E2 — Departure already completed.** The procedure refuses to cancel a booking whose departure has ended, raising `DEPARTURE_COMPLETED`.

**Postconditions**
- One `cancellation` row; booking status `CANCELLED`; seats restored exactly once; one `booking_audit` row written by trigger; a `REFUNDED` payment row when the refund is positive.

**Business rules**
BR-05 Refund percentage depends only on days remaining before departure. · BR-06 A booking may be cancelled at most once. · BR-07 Restoring seats is the database's responsibility, not the caller's.

---

## UC-03 — Search Packages

| Field | Value |
|---|---|
| **ID** | UC-03 |
| **Primary actor** | Customer or Agent (also available unauthenticated) |
| **Traces to** | FR-06, FR-24 · NFR-01, NFR-04 |
| **Priority** | Must · mid-semester increment |

**Preconditions** — The catalogue contains at least one active package. No login is required.

**Trigger** — The actor submits search filters, or opens the catalogue with none.

**Main success flow**

| # | Actor action | System response |
|---|---|---|
| 1 | Actor opens the catalogue | System lists active packages with title, duration, category, indicative price range and next departure |
| 2 | Actor sets filters: destination, category, duration range, price range, month of travel | System maps each submitted key against a **whitelist of permitted columns**, discarding anything unrecognised |
| 3 | | System builds a parameterised `WHERE` clause with sequential `$1, $2 …` placeholders, values bound separately, never interpolated |
| 4 | | System executes the query and measures its duration |
| 5 | | System renders the matching packages, and beneath them the SQL text with placeholders intact, the bound parameters listed separately, the row count and the execution time |
| 6 | Actor opens a result | UC-06 View Package Detail |

**Alternate flows**
- **A1 — No filters.** All active packages are returned, ordered by title.
- **A2 — Fuzzy destination name.** Partial or misspelled destination names are matched through the trigram index on `destination(name)`.

**Exception flows**
- **E1 — No matches.** An empty result is displayed with the filters that produced it. The trace still shows correct column headers, because headers come from `res.fields` rather than from the first row — an empty result set must not break the display. *(TC-U-03)*
- **E2 — Malicious filter key.** A key such as `city; DROP TABLE booking --` is not in the whitelist and is discarded at step 2. The generated SQL is identical to the unfiltered query. The displayed trace is itself the evidence, and this is asserted by TC-A-03. *(NFR-04)*

**Postconditions** — No state change; the query is read-only. Search returns within 500 ms against the seeded dataset (NFR-01).

---

## UC-15 — Generate Revenue Report

| Field | Value |
|---|---|
| **ID** | UC-15 |
| **Primary actor** | Manager |
| **Traces to** | FR-22, FR-24 |
| **Priority** | Should · post-mid-semester |

**Preconditions** — Manager is authenticated; the request is served through the `app_manager` pool, which holds `SELECT` on all tables and views.

**Trigger** — The manager opens the reports dashboard or selects a reporting period.

**Main success flow**

| # | Actor action | System response |
|---|---|---|
| 1 | Manager opens Reports | System runs the report queries against the `app_manager` pool |
| 2 | | Revenue per destination per quarter is computed by a five-table join with `GROUP BY` and `HAVING` (q01) |
| 3 | | Monthly booking trend with month-on-month delta is computed using the `LAG` window function (q07) |
| 4 | | Occupancy per departure is computed as booked seats over total seats (q08); cancellation rate by category uses conditional aggregation with `FILTER` (q12) |
| 5 | | Each result is rendered as a chart, with the SQL that produced it shown beneath the chart |
| 6 | Manager changes the period | Steps 2–5 repeat with the new bound parameters; the SQL text is unchanged, only the parameters differ — which demonstrates parameterisation directly |

**Alternate flows**
- **A1 — Period with no data.** Charts render empty with a "no bookings in this period" note; the SQL and its parameters are still displayed.
- **A2 — Export.** *Revised 2026-10-02:* the trace panel this flow refers to is DB_ADMIN-only (see the FR-24 note, `SRS.md` §3.6), so a manager viewing this report does not see it and cannot copy SQL from it. The read-only console (UC-18/19) is itself DB_ADMIN-only for the same reason. A manager wanting ad-hoc variation on a report query has no in-app path today; this alternate flow is retired until that gap is addressed.

**Exception flows**
- **E1 — Query timeout.** A report exceeding the statement timeout returns an error naming the report; the remaining reports still render.
- **E2 — Insufficient privilege.** Should a non-manager reach the endpoint, PostgreSQL refuses with SQLSTATE 42501 and the API returns 403. The refusal comes from the database, not from the middleware — the middleware is defence in depth, not the control.

**Postconditions** — No state change. Read-only throughout.

---

## UC-19 — Execute Admin Query

*Rewritten 2026-10-02 to describe what was actually built, five weeks ahead of its planned
schedule (`project_plan.md` §3, W4). It is narrower than the version below described until this
revision — no preview/commit, no `app_dbadmin` execution, no rate limiting — and the reasoning
for each narrowing is given inline. UC-18 "Run Read-only Query" is the same flow under a
different name; the two were designed as separate tiers and built as one.*

| Field | Value |
|---|---|
| **ID** | UC-19 (same implementation as UC-18) |
| **Primary actor** | DB Administrator |
| **Traces to** | FR-26, FR-27 (logging clause only) · NFR-03, NFR-06 |
| **Priority** | Should/Could · built early |
| **Note** | The highest-risk-*shaped* operation in the system, built as the lowest-risk version of it that still demonstrates the design: no code path in this use case can write anything, by database grant rather than by application logic. |

**Preconditions**
1. The actor is authenticated with role `DB_ADMIN`. (Not Manager — see the FR-26 note in `SRS.md` §3.6 for why the role was narrowed from the original "manager or administrator".)
2. `requireRole('DB_ADMIN')` (`server/middleware/auth.js`) has passed — the first of two independent checks; the second is the database grant in step 2 below.

**Trigger** — The administrator submits a SQL statement through the custom-query console (`client/src/pages/AdminQuery.jsx`).

**Main success flow**

| # | Actor action | System response |
|---|---|---|
| 1 | Administrator types a statement — optionally built with help from the schema sidebar's per-table/per-column **Add** buttons, which insert an identifier at the cursor — and submits it | System checks out a client from `pools.CONSOLE_RO`, authenticated as `sql_console_ro`, **not `app_dbadmin`** |
| 2 | | System runs `BEGIN READ ONLY`, then the statement, inside that transaction |
| 3 | | System captures columns, rows, row count and duration |
| 4 | | System runs `ROLLBACK`, always — there is no commit path. For a `SELECT` this is a no-op; for any other statement it is moot, because step 2's role cannot write regardless (see Exception flow E3) |
| 5 | | System writes the statement, a fixed `db_role` of `sql_console_ro`, status, rows affected and duration to `admin_query_log`, **on a separate connection** (`pools.DB_ADMIN`) outside the just-rolled-back transaction |
| 6 | | Result renders as a table in the console; `GET /api/admin/schema` (same connection, not logged — it is the page's own fixed query, not something the administrator authored) powers the clickable table/column sidebar |

**Alternate flows**
- **A1 — Read-only inspection.** This *is* what UC-18 described as a separate, lower-risk tier; there is no second, higher-risk tier to fall back to from here. The write-capable preview/commit flow originally designed for this use case (steps once numbered 4–6, offering `commit: true`) was not built — see the note below.

**Exception flows**
- **E1 — Statement error.** Syntax or constraint errors return the database's own message as `{ error, code: 'QUERY_FAILED' }`. A log row with status `ERROR` and the error message is still written — failures are as interesting as successes in an audit trail. Verified by TC-A-26 and TC-A-29.
- **E2 — Attempted write.** `INSERT`/`UPDATE`/`DELETE`/DDL fails with PostgreSQL's own `cannot execute … in a read-only transaction` or `permission denied` — refused by the `sql_console_ro` grant (`07_roles_grants.sql` §6: `SELECT` and nothing else, anywhere), not by a keyword filter in this route. Verified by TC-A-26.
- **E3 — Non-DB_ADMIN caller.** A customer, agent or manager gets 403; an unauthenticated caller gets 401. Verified by TC-A-27.

**Postconditions**
- Nothing in the schema or data is ever changed by this use case — there is no code path that commits.
- **In every case — success or error — one `admin_query_log` row exists.** Because the console's own transaction is always rolled back, writing the log on that same connection would erase it along with everything else; the separate `app_dbadmin` connection is what survives. Verified by TC-A-29.

**What this use case originally specified, and why it changed (added 2026-10-02).** The design
above this note described a two-tier console: UC-18 for read-only inspection under
`sql_console_ro`, and this use case, UC-19, as a second, write-capable tier under `app_dbadmin`
with a preview-then-commit workflow, a 10s statement timeout, a 3s lock timeout, and request
throttling. None of that second tier was built. Two reasons: first, nobody had asked to actually
use it to write — `app_dbadmin` already has unrestricted write access to the schema through
ordinary `psql`, which is the tool an administrator reaches for when a write is genuinely needed,
so a second write path through a web form adds risk without adding capability. Second, a
raw-SQL write endpoint reachable from a browser is a meaningfully larger blast radius than a
read-only one, and that cost was judged not worth paying for a feature whose entire read-only
value UC-18 already delivers. If a write-capable tier is built later, this note is where its
design should be re-derived from, not the flow above it.

---

# 4. User stories (alternative form)

The SEPM handout accepts either use cases or user stories. Use cases are the primary model
here; these stories restate the mid-semester increment in a form suitable for the backlog in
`project_plan.md`.

| ID | Story | Acceptance criteria |
|---|---|---|
| US-01 | As a visitor, I want to register with my email and a password, so that I can book travel. | Duplicate email rejected; password stored as a bcrypt hash; a customer record is created and linked. |
| US-02 | As a customer, I want to filter packages by destination, price and month, so that I can find a trip that fits. | Results respect every filter; unknown filter keys are ignored; results return in under 500 ms; the SQL is visible. |
| US-03 | As a customer, I want to see which departures still have seats, so that I do not waste time on a full one. | Each departure shows live `available_seats`; a full departure is marked and cannot be selected. |
| US-04 | As a customer, I want to book several travellers in one step, so that my family travels on one booking. | One booking with one `booking_traveller` row per traveller; total equals price × travellers; a pending payment is created. |
| US-05 | As a customer, I want to be told clearly when seats have run out, so that I am not charged for a booking that cannot exist. | `INSUFFICIENT_SEATS` surfaces as a plain message; no partial rows remain. |
| US-06 | As the agency owner, I want two simultaneous bookings for the last seat to produce exactly one booking, so that we never oversell a coach. | TC-C-01 passes: one fulfilled, one rejected with `INSUFFICIENT_SEATS`, seats end at zero. |
| US-07 | As a customer, I want to see my bookings with what I have paid and what I still owe. | Balance due derived in `v_booking_summary`; payment history listed. |
| US-08 | As a customer, I want to cancel and know my refund before I confirm. | The refund tier is shown before confirmation and matches what is recorded; seats are restored. |
| US-09 | As an evaluator, I want to see the SQL behind every screen, so that I can judge the database work. | `<QueryTrace>` on every data page; `$n` placeholders shown uninterpolated. |

---

## Revision history

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-09-26 | Initial baseline: 21 use cases, 5 detailed descriptions, 9 user stories |
| 1.1 | 2026-10-02 | UC-19 rewritten to match the console actually built (read-only only, `sql_console_ro`, no preview/commit); UC-18's actor narrowed to DBA-only and noted as the same implementation as UC-19; UC-15's A2 flow and the `Display Executed SQL` include corrected for FR-24's DB_ADMIN-only gate |
