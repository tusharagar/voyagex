# Software Requirements Specification
## VoyageX — Travel and Tourism Management System

**Version:** 1.0 (baseline) · **Date:** 2026-09-26
**Structure:** IEEE 830-1998, adapted
**Prepared by:** VoyageX project group, MNNIT Allahabad
**Related documents:** `problem_statement.md`, `use_cases.md`, `architecture.md`, `test_cases.md`

---

# 1. Introduction

## 1.1 Purpose

This document specifies the functional and non-functional requirements of VoyageX, a travel and
tourism management system. It is written for the project group (as the basis for design and
implementation), and for the DBMS and SEPM course evaluators (as the statement of what the
delivered system is meant to do).

It covers the complete system. Requirements required for the mid-semester increment of
2026-10-03 are marked **[MS]** throughout and listed together in §5.2.

## 1.2 Scope of the product

VoyageX manages the sale and administration of multi-day tour packages for a single travel
agency. It holds the package catalogue and itineraries, the dated departures on which packages
are sold, customer and traveller records, bookings, payments, cancellations and refunds,
reviews, guide assignments, and hotel and transport arrangements attached to a booking.

Beyond the transactional system, VoyageX is also built to *expose its own database*: every
screen that reads or writes data displays the SQL statement it executed, its bound parameters,
the row count and the execution time; the entity-relationship diagram is generated at runtime
from the live catalog; and privileged SQL execution is available through audited consoles.

An analytics component scores confirmed bookings for cancellation risk using features computed
from the database at prediction time.

VoyageX does not take real payments, does not communicate with customers, and does not connect
to external hotel or airline inventory. It is a localhost system. §2.6 states these exclusions
in full.

## 1.3 Definitions, acronyms and abbreviations

| Term | Meaning |
|---|---|
| **Package** | A reusable tour template: title, itinerary, duration, destinations. Carries no price and no seats. |
| **Departure** | One dated, priced, seat-limited running of a package. The sellable unit. |
| **Booking** | One customer's purchase of seats on one departure, covering one or more travellers. |
| **Traveller** | A person who travels. Belongs to a customer; is not necessarily a system user. |
| **Customer** | A person holding an account who makes bookings. |
| **Agent** | An agency employee who books on behalf of walk-in customers. |
| **Balance due** | Total amount minus successful payments. Derived in a view, never stored. |
| **Refund tier** | The percentage refunded on cancellation, determined by days remaining before departure. |
| **QueryTrace** | The UI component that displays the SQL behind a screen's data. |
| **RBAC** | Role-based access control. Here implemented with PostgreSQL roles, not application logic. |
| **ADR** | Architectural Decision Record. See `architecture.md`. |
| **MoSCoW** | Prioritisation scheme: Must / Should / Could / Won't. |
| **[MS]** | Required for the mid-semester increment (2026-10-03). |
| **FR / NFR** | Functional / non-functional requirement. |
| **SQLSTATE 42501** | PostgreSQL error code `insufficient_privilege`. |

## 1.4 References

1. IEEE Std 830-1998, *Recommended Practice for Software Requirements Specifications*.
2. DBMS course handout, *Projects List for DBMS, B.Tech CSE 3rd Year (Sections E and F)* — project topic 10, Travel and Tourism Management.
3. SEPM course handout, *Software Engineering Project: Mid-Semester Evaluation*, deadline 2026-10-03.
4. PostgreSQL 16 documentation — concurrency control, PL/pgSQL, privileges.
5. Project documents: `problem_statement.md`, `use_cases.md`, `architecture.md`, `normalization.md`, `project_plan.md`.

## 1.5 Overview

§2 describes the product context, its user classes, its operating environment, its constraints
and its scope boundary. §3 lists functional requirements, §4 non-functional requirements, §5
their prioritisation, and §6 the traceability matrix linking every requirement to a use case, a
module and a test case.

---

# 2. Overall description

## 2.1 Product perspective

VoyageX is a new, self-contained system; it replaces spreadsheet-and-diary working rather than
interfacing with an existing product. It has four parts:

- a **React single-page client** (browser),
- an **Express HTTP API** (Node.js),
- a **PostgreSQL 16 database** that holds both the data and the business rules that protect it,
- a **Python/FastAPI prediction service** that the API calls for cancellation-risk scores.

The database is the centre of the system, not a persistence detail behind it. Seat allocation,
audit logging and guide-overlap prevention execute inside PostgreSQL, so that any client —
this web UI, a `psql` session, or a future mobile application — is subject to the same rules.
The rationale and cost of that choice are recorded as ADR-02 in `architecture.md`.

## 2.2 Product functions

At the highest level the system:

- publishes a searchable catalogue of packages with day-by-day itineraries and destinations;
- schedules departures against packages, each with its own dates, price and seat inventory;
- registers customers and the travellers they book for;
- creates bookings that allocate seats atomically and cannot oversell;
- records payments and derives the balance outstanding;
- cancels bookings, computing a refund from a published penalty scale and restoring seats;
- accepts one review per completed booking;
- lets agents transact on a customer's behalf and lets managers report on the business;
- assigns guides to departures without allowing overlapping assignments;
- enforces access by database role and records every privileged statement;
- displays the SQL behind every screen and renders the live schema as an ER diagram;
- scores confirmed bookings for cancellation risk.

## 2.3 User classes and characteristics

Each user class maps to exactly one database role. This mapping is the access-control design;
there is no second, application-level permission table.

| User class | Characteristics | Database role | Privileges (summary) |
|---|---|---|---|
| **Customer** | General public; low technical skill; infrequent use; self-service | `app_customer` | `SELECT` on catalogue tables and `v_booking_summary`; booking only through `book_package`; no direct DML on `booking` |
| **Agent** | Agency counter staff; daily use; trained on the system | `app_agent` | `SELECT`/`INSERT`/`UPDATE` on `booking`, `payment`, `traveller`, `customer`; **no `DELETE` anywhere** |
| **Manager** | Branch or operations manager; weekly reporting use; interprets figures | `app_manager` | `SELECT` on all tables, views and audit tables; catalogue maintenance; read-only SQL console |
| **DB administrator** | Technical; rare but high-impact use | `app_dbadmin` | `ALL PRIVILEGES` and `CREATE` on schema; **deliberately not `SUPERUSER`** (see NFR-03 and ADR-03) |
| *(no user class)* | The read-only console connection used for ad-hoc inspection | `sql_console_ro` | `SELECT` only; used inside a `READ ONLY` transaction that always rolls back |

## 2.4 Operating environment

| Element | Requirement |
|---|---|
| Database | PostgreSQL 16, extension `pg_trgm` |
| API runtime | Node.js 20, Express 5, ESM |
| Prediction service | Python 3.11, FastAPI |
| Client | Any current browser supporting ES2020; developed against Chromium |
| Host | Single machine, Linux or macOS, all services bound to `127.0.0.1` |
| Packaging | Docker Compose for PostgreSQL, API and prediction service |
| Ports | PostgreSQL 5432 · API 4000 · client 5173 · prediction service 8000 |

## 2.5 Design and implementation constraints

These are binding, and several are deliberate refusals of the conventional choice. Each is
justified in `architecture.md` §9 (technology justification) or as an ADR.

| ID | Constraint | Reason |
|---|---|---|
| C-01 | **No ORM or query builder.** All SQL is hand-written and parameterised with `$1, $2` placeholders through `pg`. | The visible SQL is the substance of the DBMS submission; an ORM hides it (ADR-01). |
| C-02 | **Business rules in the database**, as PL/pgSQL triggers and procedures. | Single point of enforcement for seat inventory across all clients (ADR-02). |
| C-03 | **PostgreSQL only.** No second datastore, no cache. | Keeps the consistency story single-sourced; a cache would reintroduce the staleness this project exists to eliminate. |
| C-04 | **Role-per-connection-pool RBAC.** One `pg.Pool` per database role. | Makes PostgreSQL the enforcement point, so a middleware bug cannot grant privilege (ADR-03). |
| C-05 | **No Next.js, no SSR, no state-management or component library.** React + Vite + Tailwind only; every component hand-written. | Scope discipline. *Revised 2026-09-26:* the original constraint also required deliberately plain rendered output. That was relaxed on the project owner's decision — a booking system whose interface looks unfinished undersells the work behind it, and the demonstration video is graded on what an evaluator sees. The prohibitions that protect scope are unchanged: no component library, no SSR, no state manager, no animation framework. The QueryTrace panel remains on every data screen and was designed in from the wireframes, not added over the top. |
| C-06 | **No deployment.** Localhost, bound to `127.0.0.1`. | Out of scope for the semester; removes a class of risk from the submission. |
| C-07 | **No secrets in the repository.** `.env` ignored, `.env.example` committed with dummy values. | SEPM submission requirement; verified before packaging. |
| C-08 | **Design artifacts precede implementation** and are committed before the code they describe. | Git history is submitted as process evidence; artifacts retrofitted after the code are visible as such. |

## 2.6 Scope boundary

### 2.6.1 Included

The features specified as FR-01 … FR-27 in §3, implemented across the eleven screens listed in
`architecture.md` §4.

### 2.6.2 Excluded

Every exclusion is deliberate, and each is recorded with its reason. This section is graded; it
is not a formality.

| Excluded feature | Reason for exclusion |
|---|---|
| Real payment-gateway integration (Razorpay, Stripe) | Requires a commercial merchant account and PCI handling; payments are recorded as rows with a mode and a reference, which is sufficient to model the balance-due and refund logic that the database course grades. |
| Email and SMS notification | Adds an external delivery dependency and credentials to a submission that must contain no secrets; contributes nothing to the data model. |
| Multi-currency pricing | All figures are INR. Currency conversion would add a rate table and temporal rate lookups without exercising any SQL feature not already demonstrated. |
| Native mobile application | A second client would multiply UI effort without adding database depth. Note that the database-side rule enforcement (ADR-02) is exactly what would let a mobile client be added safely later. |
| Live hotel and airline inventory APIs | Requires commercial API access; hotels and transport are modelled as reference data with bookings attached. |
| Multi-tenancy across several agencies | Would push a tenant key into every table and every query, obscuring the normalization work that is the point of the project. Single agency assumed. |
| Production deployment, TLS, domain hosting | Out of scope per C-06; the system is demonstrated on localhost. |
| Dynamic or demand-based pricing | Price is a fixed attribute of a departure. Yield management is a forecasting problem unrelated to the chosen ML task. |
| Loyalty points and promotional coupons | `booking.discount` exists as a plain amount; a full promotions engine is a separate subsystem. |
| Full-text search over itinerary descriptions | Catalogue search is filter-based with a trigram index on destination names; a full search stack is disproportionate. |

### 2.6.3 Assumptions and dependencies

| ID | Assumption or dependency |
|---|---|
| A-01 | A single travel agency operates the system; branches belong to that one agency. |
| A-02 | All monetary amounts are INR; no conversion is performed. |
| A-03 | Data is generated by a deterministic seed script rather than drawn from live operations; volumes are stated in the project brief (1200 bookings, 300 departures, 400 customers). |
| A-04 | A traveller may be recorded without holding a user account; only the booking customer needs an account. |
| A-05 | Payments are recorded after the fact; the system is the book of record, not the payment processor. |
| A-06 | Refund penalty tiers are fixed agency policy, not per-package terms. |
| A-07 | The evaluation machine can run Docker Compose, or has PostgreSQL 16, Node 20 and Python 3.11 available locally. |
| A-08 | The cancellation-risk model is trained on seeded data; its accuracy is a demonstration of a working pipeline, not a claim about real customer behaviour. |
| D-01 | Depends on PostgreSQL 16 features: `FOR UPDATE` row locking, PL/pgSQL, `GRANT`-based privileges, `information_schema`, `pg_trgm`. |

---

# 3. Functional requirements

Each requirement has an ID, a description, a MoSCoW priority, a source, and an acceptance
condition. **[MS]** marks the mid-semester increment. Sources are: *DBMS* (DBMS course
handout), *SEPM* (mid-semester evaluation handout), *Domain* (the problem statement), or
*Derived* (implied by another requirement).

## 3.1 Account and access

| ID | Requirement | Priority | Source | Acceptance condition |
|---|---|---|---|---|
| **FR-01** **[MS]** | A visitor shall register an account with an email address and password, creating a linked customer record. | Must | Domain | Duplicate email is rejected by the `UNIQUE` constraint; the password is never stored in plaintext. |
| **FR-02** **[MS]** | A registered user shall authenticate with email and password and receive a session token carrying user id, application role and database role. | Must | Domain | Wrong credentials return HTTP 401 with no token issued. |
| **FR-03** **[MS]** | The system shall route each authenticated request to the connection pool for that user's database role, defaulting to the most restricted pool when no session exists. | Must | DBMS | A request without a session cannot reach a privileged pool; verified by TC-R-03. |
| **FR-04** | A customer shall view and update their own profile (name, phone, address, date of birth). | Should | Domain | A customer cannot read or modify another customer's profile. |
| **FR-05** **[MS]** | A customer shall add, edit and **delete** travellers belonging to their account. | Must | DBMS | Deleting a traveller who is on no booking succeeds; the UI exposes delete, satisfying the DBMS requirement for a delete interface. |

## 3.2 Catalogue

| ID | Requirement | Priority | Source | Acceptance condition |
|---|---|---|---|---|
| **FR-06** **[MS]** | Any user shall search packages by destination, category, duration range, price range and month of travel. | Must | DBMS | Filters are built from a whitelisted column map; unknown filter keys are ignored, never concatenated into SQL. |
| **FR-07** **[MS]** | Any user shall view a package's detail: description, day-by-day itinerary, destinations visited, associated hotels and forthcoming departures. | Must | Domain | Itinerary rows are ordered by day and time slot. |
| **FR-08** **[MS]** | The system shall list departures for a package with start date, end date, price and seats currently available. | Must | Domain | Availability shown is the live value of `departure.available_seats`. |
| **FR-09** | A manager shall create packages, itinerary activities and departures, update them, and deactivate a package. | Should | DBMS | Deactivation sets `is_active = false`; the package disappears from customer search but existing bookings are unaffected. |

## 3.3 Booking

| ID | Requirement | Priority | Source | Acceptance condition |
|---|---|---|---|---|
| **FR-10** **[MS]** | A customer shall book a departure for one or more of their travellers in a single operation. | Must | Domain | Executed by the `book_package` stored procedure; creates the booking, one `booking_traveller` row per traveller, and a pending payment for the full amount. |
| **FR-11** **[MS]** | The system shall refuse a booking that requests more seats than remain, and shall leave no partial data behind. | Must | Domain | Raises `INSUFFICIENT_SEATS`; no `booking` row exists afterwards. |
| **FR-12** **[MS]** | Concurrent bookings for the same departure shall not oversell it. | Must | Domain | `SELECT … FOR UPDATE` serialises seat checks; with one seat and two concurrent requests, exactly one succeeds (TC-C-01). |
| **FR-13** **[MS]** | Confirming a booking shall decrement available seats by exactly the number of travellers, and shall mark the departure `FULL` at zero. | Must | DBMS | Performed by an `AFTER INSERT` trigger, not by application code. |
| **FR-14** **[MS]** | A customer shall list their bookings and open any one of them to see travellers, payments, amount paid and balance due. | Must | Domain | Balance due is derived in `v_booking_summary`, never stored on `booking`. |
| **FR-15** | An agent shall create a booking on behalf of a customer, with the agent recorded against it. | Should | Domain | `booked_by_employee_id` is set for agent bookings and `NULL` for self-service bookings. |
| **FR-16** | An agent shall list and filter all bookings by status, date range, customer and departure. | Should | Domain | Results are paginated and show the executed SQL. |

## 3.4 Money and cancellation

| ID | Requirement | Priority | Source | Acceptance condition |
|---|---|---|---|---|
| **FR-17** | A payment shall be recorded against a booking with amount, mode, transaction reference, status and instalment number. | Should | Domain | `transaction_ref` is unique; amount must be positive. |
| **FR-18** **[MS]** | A customer or agent shall cancel a booking; the system shall compute the refund from the published penalty scale, record the cancellation, and restore the seats. | Must | Domain | Refund is 100% above 30 days before departure, 50% at 15–30 days, 25% at 7–14 days, 0% under 7 days; executed by `cancel_booking`. |
| **FR-19** | A booking shall be cancellable only once. | Must | Derived | Enforced by the `UNIQUE` constraint on `cancellation.booking_id`; a second attempt fails at the database. |
| **FR-20** | A customer shall submit exactly one review, with a rating of 1–5, for a booking they made, once the trip is complete. | Could | Domain | One review per booking enforced by `UNIQUE (review.booking_id)`; the rating range by `chk_review_rating_range`. Reviewer ownership and the completed-booking rule are enforced by `trg_review_valid` — a unique key cannot express either, since both compare the review against another table. |

## 3.5 Operations and reporting

| ID | Requirement | Priority | Source | Acceptance condition |
|---|---|---|---|---|
| **FR-21** | A manager shall assign a guide to a departure, and the system shall refuse an assignment that overlaps another assignment for that guide. | Should | Domain | A `BEFORE INSERT` trigger raises on date-range overlap; `UNIQUE (guide_id, departure_id)` blocks exact duplicates. |
| **FR-22** | A manager shall view reports covering revenue by destination and quarter, monthly booking trend, occupancy per departure, cancellation rate by category and repeat customers. | Should | DBMS | Each report renders a chart and displays the SQL beneath it. |
| **FR-23** | The system shall present a catalogue of the fifteen showcase queries, each runnable on demand, showing its purpose, the SQL features it demonstrates, its SQL text and its results. | Should | DBMS | All fifteen return rows against seeded data. |

## 3.6 Database transparency

| ID | Requirement | Priority | Source | Acceptance condition |
|---|---|---|---|---|
| **FR-24** **[MS]** | Every API response that executes SQL shall return the SQL text, bound parameters, column names, rows, row count and execution time; this shall be returned, and displayed, **only to a DB_ADMIN session.** | Must | DBMS | Placeholders remain uninterpolated (`$1`, not the value), which is the evidence of parameterisation. *Revised 2026-10-02 — see note below the table.* |
| **FR-25** | The system shall render an entity-relationship diagram generated at request time from `information_schema`, with a toggle to hide system tables, and a link to the conceptual ER model. | Should | DBMS | The diagram reflects the live schema; it cannot drift from it. **Not yet implemented** (2026-10-02): `GET /api/admin/schema` returns table/column metadata for the console's picker UI, which is a different, narrower thing than this requirement's rendered ERD. |
| **FR-26** | A DB_ADMIN shall run ad-hoc read-only SQL in a console that executes inside a `READ ONLY` transaction and always rolls back. | Should | DBMS | Write attempts fail with PostgreSQL's own refusal, not a route-level check; errors return the database's own message. **Implemented early, 2026-10-02** — narrowed from "manager or administrator" to DB_ADMIN only; see note below the table. |
| **FR-27** | Every execution against the console, successful or failed, shall be logged, on a connection separate from the audited statement's own transaction. | Could | DBMS | The log write occurs on a separate connection outside the caller's transaction, so a rollback cannot erase it. **Implemented early, 2026-10-02**, as part of FR-26 — but only this logging clause: the write-capable preview/commit console this requirement originally specified was descoped. See note below the table. |
| **FR-28** | A manager or administrator shall view the booking audit trail and the privileged-statement log. | Could | DBMS | `booking_audit` rows are written only by trigger; no application code inserts into it. **Not yet implemented** as a dedicated screen; `admin_query_log` is readable today by a DB_ADMIN through the FR-26 console itself (`SELECT * FROM admin_query_log`), which covers the data access this requirement wants without yet providing the screen. |

> **Note on FR-24, FR-26, FR-27 (added 2026-10-02).** The database-transparency feature
> originally meant every data screen to show its SQL to every signed-in role, including an
> anonymous customer browsing the catalogue. Building the rest of the system surfaced the actual
> consequence of that: the trace carries not just the SQL *text* but the bound parameter
> *values*, full row data and column names — a customer's own screen was shipping other
> customers' data details embedded in query results, and raw SQL/schema information, to whichever
> role happened to be looking at it. `server/utils/runTraced.js` now exports `traceFor(req,
> trace)`, which attaches the trace only when `req.user.role === 'DB_ADMIN'`; every other
> response omits the `trace` key entirely rather than sending an empty one. The transparency
> requirement is still met — an evaluator can see the SQL behind any screen — just from a
> DB_ADMIN session rather than from whichever account happens to be driving the demo. The
> mid-semester walkthrough (§5.2) must be read with this in mind: **the FR-24 evidence now needs a
> DB_ADMIN login, not the customer flow the walkthrough otherwise follows.**
>
> The same session also built the console FR-26 and FR-27 anticipated, five weeks ahead of its
> planned W4 slot (`project_plan.md` §3), but narrower than originally specified in two
> deliberate ways: it is DB_ADMIN-only, not "manager or administrator" (a manager's database role
> was never granted anything beyond the catalogue, and extending it for this one feature was not
> asked for); and it is read-only only — there is no write-capable tier with FR-27's
> preview/confirm/commit flow. The console runs every statement as `sql_console_ro`, a role
> granted `SELECT` and nothing else, anywhere (`07_roles_grants.sql` §6), so a write is refused by
> PostgreSQL itself even in a DB_ADMIN session. A raw-SQL write path reachable from a web UI was
> judged a disproportionate increase in blast radius for a feature nobody had asked to actually
> use for writes — `app_dbadmin` already has unrestricted write access through ordinary `psql` for
> the rare case that needs it.

## 3.7 Intelligent features

| ID | Requirement | Priority | Source | Acceptance condition |
|---|---|---|---|---|
| **FR-29** | The system shall score a confirmed booking for cancellation risk, computing its features from the database at prediction time and storing the result. | Should | DBMS | Features are read by SQL for the booking being scored; no CSV is involved at prediction time. |
| **FR-30** | An agent shall see confirmed future bookings whose risk score exceeds 0.5, so that at-risk seats can be re-marketed. | Could | Domain | Listed in the agent dashboard with the score shown. |

---

# 4. Non-functional requirements

Each is stated so that it can be checked. An unmeasurable non-functional requirement cannot be
verified and is not worth writing.

| ID | Category | Requirement | Verification method |
|---|---|---|---|
| **NFR-01** **[MS]** | Performance | Any catalogue search shall return within 500 ms against the seeded dataset of 1 200 bookings and 300 departures. | Execution time is measured and displayed by `runTraced` on every query; recorded in test evidence. |
| **NFR-02** **[MS]** | Correctness under concurrency | No two concurrent bookings shall oversell a departure. | Automated concurrency test TC-C-01; manual two-terminal `psql` demonstration in `concurrency_demo.md`. |
| **NFR-03** **[MS]** | Security | All database access shall be role-scoped. No application component shall connect as a PostgreSQL superuser. | Connection strings reviewed; `app_dbadmin` created without `SUPERUSER`; TC-R-01 and TC-R-02. |
| **NFR-04** **[MS]** | Security | All SQL shall be parameterised. No user-supplied value shall be concatenated into a statement; identifiers shall come from a whitelist. | Code review plus TC-A-03 (malicious filter key does not alter generated SQL); `$n` placeholders visible in the UI. |
| **NFR-05** **[MS]** | Security | Passwords shall be stored as bcrypt hashes with a cost factor of at least 10. | Inspection of `user_account.password_hash`; no reversible storage. |
| **NFR-06** | Auditability | Every privileged SQL execution shall be logged with user, database role, statement, status, rows affected and duration, including failures, and the log shall survive rollback of the statement logged. | Log written on a separate pool connection; verified by executing a rolled-back statement and finding its log row. |
| **NFR-07** **[MS]** | Portability | The system shall run on a clean machine using only the instructions in the README. | Verified by a clean clone and a Docker Compose start before submission. |
| **NFR-08** **[MS]** | Transparency | Every screen that displays data shall expose the SQL that produced it within one interaction, **to a DB_ADMIN session.** | `<QueryTrace>` present on every data page; renders only when the API has attached a trace, which it does only for DB_ADMIN (`traceFor`, `server/utils/runTraced.js`). *Revised 2026-10-02 — see the FR-24 note in §3.6.* |
| **NFR-09** | Data integrity | Invalid states shall be rejected by database constraints rather than by application validation alone: negative seat counts, end date before start date, rating outside 1–5, non-positive payment amounts. | `CHECK` constraints present; TC-T-03 confirms the seat backstop. |
| **NFR-10** | Maintainability | The schema shall rebuild from empty with a single command, and the test suite shall run against a disposable database. | `./db/reset.sh` completes with zero errors; CI-style local run. |
| **NFR-11** | Usability | A user who has registered shall be able to complete a booking without instruction, in no more than five screens. | Walkthrough against the wireframes; confirmed in the demonstration video. |
| **NFR-12** | Confidentiality of the submission | No password, key or credential shall appear in the repository, screenshots or the demonstration video. | `.env` git-ignored; pre-submission grep over the repository and review of media. |

---

# 5. Requirements prioritisation

## 5.1 MoSCoW summary

| Priority | Meaning here | Requirements |
|---|---|---|
| **Must** | The system is not a working submission without these | FR-01, FR-02, FR-03, FR-05, FR-06, FR-07, FR-08, FR-10, FR-11, FR-12, FR-13, FR-14, FR-18, FR-19, FR-24 · NFR-01 … NFR-05, NFR-07, NFR-08 |
| **Should** | Required for the full DBMS submission; deferrable past the mid-semester cut | FR-04, FR-09, FR-15, FR-16, FR-17, FR-21, FR-22, FR-23, FR-25, FR-26, FR-29 · NFR-06, NFR-09, NFR-10, NFR-11 |
| **Could** | Valuable, implemented if the schedule holds | FR-20, FR-27, FR-28, FR-30 |
| **Won't (this semester)** | Recorded so the boundary is explicit | The exclusions in §2.6.2 |

## 5.2 Mid-semester subset (due 2026-10-03)

The increment is the end-to-end path **register → log in → search → view package → book →
view booking**, together with the guarantees that make it worth demonstrating.

| Included | Requirements |
|---|---|
| Access | FR-01, FR-02, FR-03, FR-05 |
| Catalogue | FR-06, FR-07, FR-08 |
| Booking | FR-10, FR-11, FR-12, FR-13, FR-14, FR-18 |
| Transparency | FR-24 — **demonstrate from a DB_ADMIN login, not the customer flow above** (see the FR-24 note in §3.6) |
| Quality attributes | NFR-01, NFR-02, NFR-03, NFR-04, NFR-05, NFR-07, NFR-08, NFR-12 |

Deferred to the second half: reporting and the query catalogue (FR-22, FR-23), the schema
viewer and audit-log screen (FR-25, FR-28), guide assignment (FR-21), reviews (FR-20),
catalogue management (FR-09), and the whole machine-learning component (FR-29, FR-30).
**No longer deferred:** FR-26 and FR-27's logging clause were built early, 2026-10-02 — see the
note under §3.6.

---

# 6. Traceability matrix

Each functional requirement is traced to the use case that describes it, the module that
implements it, and the test case that verifies it. Test identifiers follow the scheme in
`test_cases.md`: `TC-U-` unit, `TC-B-` booking integration, `TC-T-` trigger, `TC-R-` RBAC,
`TC-A-` API, `TC-C-` concurrency. Tests are planned at the time of this baseline and are
generated from real runs once Phase 8 completes.

| FR | Use case | Implementing module(s) | Test case(s) |
|---|---|---|---|
| FR-01 | UC-01 Register Account | `server/routes/auth.js`, `client/src/pages/Register.jsx`, `db/01_schema.sql` (`user_account`, `customer`) | TC-A-01, TC-A-02 |
| FR-02 | UC-02 Log In | `server/routes/auth.js`, `server/middleware/auth.js`, `client/src/pages/Login.jsx` | TC-A-04, TC-A-05 |
| FR-03 | UC-02 (include) | `server/db/pools.js`, `server/middleware/auth.js`, `db/07_roles_grants.sql` | TC-R-01, TC-R-02, TC-R-03 |
| FR-04 | UC-04 Manage Profile | `server/routes/customers.js`, `client/src/pages/Profile.jsx` | TC-A-06 |
| FR-05 | UC-05 Manage Travellers | `server/routes/travellers.js`, `client/src/pages/Travellers.jsx` | TC-A-07, TC-A-08 |
| FR-06 | UC-03 Search Packages | `server/routes/packages.js` (`buildPackageSearch`), `client/src/pages/Catalogue.jsx`, `db/04_indexes.sql` | TC-U-01, TC-A-03 |
| FR-07 | UC-06 View Package Detail | `server/routes/packages.js`, `client/src/pages/PackageDetail.jsx` | TC-A-09 |
| FR-08 | UC-06 (include) | `server/routes/departures.js` | TC-A-10 |
| FR-09 | UC-12 Manage Catalogue | `server/routes/admin.js`, `client/src/pages/CatalogueAdmin.jsx` | TC-A-11 |
| FR-10 | UC-07 Book Package | `db/06_procedures.sql` (`book_package`), `server/services/booking.service.js`, `client/src/pages/BookingFlow.jsx` | TC-B-01 |
| FR-11 | UC-07 exception flow E1 | `db/06_procedures.sql` (`book_package`) | TC-B-02 |
| FR-12 | UC-07 exception flow E2 | `db/06_procedures.sql` (`FOR UPDATE`) | **TC-C-01** |
| FR-13 | UC-07 (postcondition) | `db/05_triggers.sql` (`trg_booking_seats`) | TC-B-03, TC-T-03 |
| FR-14 | UC-08 View My Bookings | `server/routes/bookings.js`, `db/03_views.sql` (`v_booking_summary`), `client/src/pages/MyBookings.jsx` | TC-A-12 |
| FR-15 | UC-11 Book on Behalf | `server/routes/bookings.js`, `client/src/pages/AgentDashboard.jsx` | TC-B-06 |
| FR-16 | UC-11 (extend) | `server/routes/bookings.js` | TC-A-13 |
| FR-17 | UC-09 Record Payment | `server/routes/payments.js` | TC-A-14 |
| FR-18 | UC-10 Cancel Booking | `db/06_procedures.sql` (`cancel_booking`), `server/routes/bookings.js` | TC-U-02, TC-B-04 |
| FR-19 | UC-10 exception flow E1 | `db/02_constraints.sql` (`UNIQUE cancellation.booking_id`) | TC-B-05 |
| FR-20 | UC-13 Submit Review | `server/routes/reviews.js`, `db/05_triggers.sql` (`trg_review_valid`) | TC-A-15, TC-T-04 |
| FR-21 | UC-14 Assign Guide | `db/05_triggers.sql` (`trg_guide_overlap`) | TC-T-02 |
| FR-22 | UC-15 Generate Revenue Report | `server/routes/reports.js`, `db/queries/q01,q07,q08,q12,q13`, `client/src/pages/Reports.jsx` | TC-A-16 |
| FR-23 | UC-16 Browse Query Catalogue | `server/routes/reports.js`, `db/queries/q01..q15` | TC-A-17 |
| FR-24 | all data use cases (include) | `server/utils/runTraced.js` (`traceFor`), `client/src/components/QueryTrace.jsx` | TC-U-03, TC-A-18, TC-A-19, TC-A-20, **TC-A-24** (the DB_ADMIN-only gate itself) |
| FR-25 | UC-17 View Schema | *not yet implemented* — `GET /api/admin/schema` is a narrower, different thing; see the FR-24/26/27 note above | — |
| FR-26 | UC-18 Run Read-only Query | `server/routes/admin.js` (`POST /api/admin/query`), role `sql_console_ro` | TC-A-25, TC-A-26, TC-R-02 (the role's own grants) |
| FR-27 | — (folded into UC-18 above) | `server/routes/admin.js`, `db/01_schema.sql` (`admin_query_log`) | **TC-A-29** (logs both a success and a refusal) |
| FR-28 | UC-20 View Audit Log | *not yet implemented as a screen* — `trg_booking_audit` writes the data (`db/05_triggers.sql`), readable today via FR-26's console | TC-T-01 (the trigger, not a viewer) |
| FR-29 | UC-21 Predict Cancellation Risk | `ml/features.sql`, `ml/predict_service.py`, `server/routes/ml.js` | TC-A-22, `ml/tests/test_features.py` |
| FR-30 | UC-21 (extend) | `server/routes/ml.js`, `client/src/pages/AgentDashboard.jsx` | TC-A-23 |

Non-functional requirements trace as follows:

| NFR | Verified by |
|---|---|
| NFR-01 | Measured `executionMs` on FR-06 responses; test evidence screenshots |
| NFR-02 | TC-C-01 and `docs/concurrency_demo.md` |
| NFR-03 | TC-R-01, TC-R-02, TC-R-03; review of `db/07_roles_grants.sql` |
| NFR-04 | TC-A-03, TC-U-01; `$n` placeholders visible in every `<QueryTrace>` |
| NFR-05 | Inspection of stored hashes; bcrypt cost asserted in `server/routes/auth.js` |
| NFR-06 | Audit-after-rollback check against `admin_query_log` |
| NFR-07 | Clean-clone Docker Compose run before submission |
| NFR-08 | TC-A-18 … TC-A-20 (trace present for DB_ADMIN), TC-A-24 (absent for everyone else) |
| NFR-09 | TC-T-03 and constraint review |
| NFR-10 | `./db/reset.sh` exit status; test-suite setup |
| NFR-11 | Walkthrough against `docs/wireframes/` |
| NFR-12 | Pre-submission repository scan and media review |

---

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-09-26 | Project group | Initial baseline for the mid-semester evaluation |
| 1.1 | 2026-10-02 | Project group | FR-24/NFR-08 restricted database transparency to DB_ADMIN sessions (the trace was shipping bound parameter values and row data to every role, including anonymous catalogue browsing); FR-26 built early and narrowed to DB_ADMIN-only, read-only-only; FR-27 narrowed to its logging clause (the write-capable preview/commit console was descoped); FR-25 and FR-28 remain unimplemented. Traceability matrix updated with real test IDs from a passing 101-test run. |
