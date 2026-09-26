# System Architecture
## VoyageX — Travel and Tourism Management System

**Version:** 1.0 · **Date:** 2026-09-26
**Traces to:** `SRS.md` §2.1, §2.5 · Feeds report sections 8 and 9

---

# 1. Architectural overview

VoyageX is a four-tier system: a browser client, an HTTP API, a PostgreSQL database that holds
business rules as well as data, and a separate prediction service.

The organising principle is that **the database is the enforcement boundary, not a storage
layer behind one.** Seat allocation, audit logging and guide-overlap prevention run inside
PostgreSQL. The API is a transport and presentation layer over procedures and queries; it does
not own the invariants. The consequences of that choice — good and bad — are recorded as ADR-02.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PRESENTATION — React 18 + Vite + Tailwind          browser :5173       │
│                                                                         │
│   pages/         Login · Catalogue · PackageDetail · BookingFlow ·      │
│                  MyBookings · AgentDashboard · Reports · QueryCatalogue │
│                  · SqlConsole · Schema · AuditLog                       │
│   components/    QueryTrace · ResultGrid · Layout · RoleGuard           │
│   api/           fetch wrapper, JWT attach, error normalisation         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTP/JSON  (CORS limited to :5173)
┌───────────────────────────────▼─────────────────────────────────────────┐
│  APPLICATION — Node 20 + Express 5 (ESM)              api :4000         │
│                                                                         │
│   middleware/    auth (JWT verify → role) · helmet · cors · rateLimit   │
│   routes/        auth packages departures bookings payments reports     │
│                  schema console admin ml                                │
│   services/      booking.service.js  (transaction orchestration)        │
│   utils/         runTraced.js   ← every SQL call passes through here    │
│   db/            pools.js  — one pg.Pool per database role              │
│                  queries.js — loads db/queries/q01..q15 at startup      │
└──────────┬──────────────────────────────────────────┬───────────────────┘
           │ pg wire protocol, parameterised only     │ HTTP/JSON
           │ connection chosen by the caller's role   │
┌──────────▼──────────────────────────────────────┐  ┌▼──────────────────┐
│  DATA — PostgreSQL 16              db :5432     │  │  ANALYTICS        │
│                                                 │  │  FastAPI :8000    │
│   25 tables · 4 views · 5 indexes (incl. GIN    │  │                   │
│     trigram on destination.name)                │  │  predict_service  │
│                                                 │  │  model.joblib     │
│   TRIGGERS      seat decrement / restore        │  │                   │
│                 booking status audit            │  │  reads features   │
│                 guide overlap prevention        │◄─┤  live via SQL     │
│   PROCEDURES    book_package (FOR UPDATE)       │  │  (features.sql)   │
│                 cancel_booking (refund tiers)   │  └───────────────────┘
│   ROLES         app_customer · app_agent ·      │
│                 app_manager · app_dbadmin ·     │
│                 sql_console_ro                  │
└─────────────────────────────────────────────────┘
```

**Style.** Layered (strictly downward calls) with one service extracted out of process. It is
not micro-services: there is one API and one database, and the only process split is the one
justified in ADR-04.

---

# 2. Module description

## 2.1 Presentation layer (`client/`)

| Module | Responsibility |
|---|---|
| `pages/` | One component per screen; owns its own data fetching and local form state. No global store — the application has no cross-screen state worth the dependency (constraint C-05). |
| `components/QueryTrace.jsx` | Renders the SQL, bound parameters, row count, timing and optional plan returned with every data response. Collapsed by default. Used on every data page. |
| `components/ResultGrid.jsx` | Renders a tabular result from `columns` + `rows`, so an empty result still shows headers. |
| `components/RoleGuard.jsx` | Hides navigation the current role cannot use. Convenience only — it is *not* the access control; that is in the database (ADR-03). |
| `api/` | One `fetch` wrapper: attaches the JWT, normalises errors, returns the traced response shape unchanged. |

## 2.2 Application layer (`server/`)

| Module | Responsibility |
|---|---|
| `middleware/auth.js` | Verifies the JWT, attaches `{ userId, role, dbRole }` to the request. |
| `db/pools.js` | Exports one `pg.Pool` per database role and `poolFor(req)`, which selects the pool from the authenticated role and **defaults to the most restricted pool when there is no session**. |
| `utils/runTraced.js` | The single choke point for SQL execution. Times the query and returns `{ sql, params, columns, rows, rowCount, executionMs, plan }`. Column names come from `res.fields`, not from the first row, so empty results keep their headers. Every route that touches SQL returns this shape. |
| `services/booking.service.js` | Orchestrates multi-statement work: checks out **one** client with `pool.connect()`, holds it across `BEGIN`/`COMMIT`, rolls back on error, releases in `finally`. Calling `BEGIN` on the pool instead of on a client would send each statement to a different physical connection and the transaction would silently do nothing. |
| `routes/` | Thin HTTP adapters: validate input with `zod`, select the pool, call a query or procedure, return the traced result. |
| `db/queries.js` | Loads `db/queries/q01..q15.sql` at startup with their comment headers, so the query catalogue shows exactly what runs. |

## 2.3 Data layer (`db/`)

| File | Contents |
|---|---|
| `01_schema.sql` | 25 tables in FK dependency order |
| `02_constraints.sql` | Checks, uniques and the constraints that encode business rules (`available_seats >= 0`, `UNIQUE cancellation.booking_id`, `UNIQUE review.booking_id`) |
| `03_views.sql` | `v_booking_summary`, `v_departure_availability`, `v_destination_rating`, `v_revenue_monthly`. Balance due is derived here, never stored. |
| `04_indexes.sql` | Four B-tree indexes plus a GIN trigram index on `destination(name)` |
| `05_triggers.sql` | Seat decrement/restore, booking status audit, guide overlap prevention |
| `06_procedures.sql` | `book_package`, `cancel_booking` |
| `07_roles_grants.sql` | Five roles and their grants |
| `queries/q01..q15.sql` | Showcase queries, each with a header naming the SQL features it demonstrates |
| `seed.py`, `reset.sh` | Deterministic seeding; one-command rebuild |

## 2.4 Analytics (`ml/`)

| File | Responsibility |
|---|---|
| `features.sql` | Computes the feature vector for a booking **from the live database** |
| `train.py` / `train.ipynb` | Trains LogisticRegression and RandomForest, reports five metrics, persists the better model |
| `predict_service.py` | FastAPI: `POST /predict` takes a `booking_id`, runs `features.sql`, returns `{ risk_score, label, model_version }` |

---

# 3. Key runtime paths

## 3.1 Booking — the critical path

```
BookingFlow.jsx
   └─POST /api/bookings──▶ routes/bookings.js
                              └─▶ booking.service.js
                                     client = pool.connect()      ◄── one physical connection
                                     BEGIN
                                     SELECT book_package($1,$2,$3)
                                        └─▶ PL/pgSQL:
                                              SELECT … FOR UPDATE   ◄── row lock held here
                                              check seats
                                              INSERT booking
                                                 └─ TRIGGER: decrement available_seats
                                              INSERT booking_traveller × n
                                              INSERT payment (PENDING)
                                     COMMIT                        ◄── lock released here
                                     client.release()
   ◀──{ sql, params, columns, rows, rowCount, executionMs }──┘
```

The lock is taken inside the procedure and released by the commit. The window in which a
competing transaction can observe stale availability is therefore zero — it blocks until the
first commits, then re-reads. This is the behaviour verified by TC-C-01 and demonstrated in
`concurrency_demo.md`. A sequence diagram of this path is `uml/sequence_booking.puml`.

## 3.2 Audit of privileged SQL

```
POST /api/admin/execute
   ├─ connection A:  BEGIN; SET LOCAL statement_timeout; <statement>;  ROLLBACK | COMMIT
   └─ connection B:  INSERT INTO admin_query_log (…)      ◄── outside A's transaction
```

Two connections, deliberately. PostgreSQL has no autonomous transactions, so a log row written
on connection A would vanish with A's rollback — erasing the audit trail of precisely the
statements that were reverted.

---

# 4. Screen inventory and build order

| # | Screen | Role | Phase |
|---|---|---|---|
| 1 | Login / Register | all | mid-sem |
| 2 | Package catalogue with filters | all | mid-sem |
| 3 | Package detail: itinerary, destinations, hotels, departures | all | mid-sem |
| 4 | Booking flow: select departure → travellers → confirm | customer | mid-sem |
| 5 | My bookings: list, detail, payments, balance, cancel | customer | mid-sem |
| 6 | Agent dashboard: all bookings, filters, book-on-behalf, at-risk | agent | later |
| 7 | Reports: charts, each with its SQL beneath | manager | later |
| 8 | Query catalogue: 15 queries with Run and full traces | manager | later |
| 9 | SQL console: read-only / sandbox / execute | manager, DBA | later |
| 10 | Schema: live ERD + link to conceptual ER model | manager, DBA | later |
| 11 | Audit log viewers | DBA | later |

---

# 5. Technology stack and justification

Each choice is stated with its reason, including the refusals. A refusal with a reason is
engineering judgement; an unexamined default is a tutorial followed.

| Layer | Choice | Justification |
|---|---|---|
| Database | **PostgreSQL 16** | Needed for mature PL/pgSQL, `SELECT … FOR UPDATE` row locking, role-based `GRANT`s, `information_schema` introspection and `pg_trgm`. Every one of those is load-bearing here; MySQL would have made the RBAC and introspection work harder. |
| Procedural language | **PL/pgSQL** | Keeps the seat check and the seat decrement in the same transaction and the same place. |
| Backend | **Node 20 + Express 5, plain JS, ESM** | Minimal ceremony between an HTTP route and a SQL statement, which is what this system is. Plain JavaScript over TypeScript: no compile step in the demo path, and the type surface is a handful of route handlers. |
| Driver | **`pg` (node-postgres)** | Speaks the wire protocol directly with `$n` placeholders. *(ADR-01)* |
| — | **No ORM, no query builder** | The SQL is the deliverable. *(ADR-01)* |
| Auth | **bcrypt + jsonwebtoken** | Bcrypt at cost ≥ 10 for password storage (NFR-05); a stateless JWT carries the database role, which is what selects the connection pool. |
| Validation | **zod** | Rejects malformed input at the route boundary, so procedures receive well-formed arguments. Complements, and does not replace, database constraints. |
| Hardening | **helmet, cors, express-rate-limit** | Standard headers; CORS restricted to the Vite origin; rate limits on both console routes, which are the only endpoints that run arbitrary SQL. |
| Frontend | **React 18 + Vite** | Component reuse for `<QueryTrace>`, which appears on every data screen; Vite for instant reload during a compressed schedule. |
| — | **No Next.js, no SSR** | There is nothing to server-render: the app is authenticated, localhost-only and has no SEO or first-paint requirement. SSR would add a rendering runtime for no benefit. |
| — | **No Redux/Zustand, no component library** | The only global state is which user is signed in, held in a small React context. A store would be indirection with nothing to manage; a component library would bury the markup an evaluator is meant to read, and every primitive here is short enough to hand-write. |
| — | **No photography, no icon font, no webfont** | Category gradients stand in for images and the logo is inline SVG. The system is offline-only (C-06), so there is no image service to call, nothing third-party is bundled, and the UI renders identically on a machine with no network. It also keeps the submission free of assets the group does not own. |
| Styling | **Tailwind** | Layout without a separate stylesheet to maintain, and a design-token layer (`tailwind.config.js`) that keeps colour and spacing decisions in one reviewable file rather than scattered through components. |
| Charts | **Recharts** | React-native charting sufficient for five report charts. |
| SQL display | **react-syntax-highlighter** | Renders SQL with `$n` placeholders intact — the evidence of parameterisation. |
| ER rendering | **mermaid**, client-side | Renders the `erDiagram` source generated at runtime from `information_schema`, so the diagram cannot drift from the schema. Mermaid cannot express Chen notation, so the conceptual ER model is drawn by hand as well (see §7). |
| ML service | **Python 3.11 + FastAPI**, `scikit-learn`, `pandas`, `joblib` | Python for the modelling ecosystem; FastAPI for a one-endpoint service. *(ADR-04)* |
| Seeding | **Python + Faker**, fixed seed | Deterministic data, so results in the report reproduce exactly. |
| Testing | **vitest + supertest**, `@testing-library/react`, `pytest` | Vitest runs ESM without configuration; supertest exercises real routes against a real database, which is the only way to test rules that live in PL/pgSQL (see ADR-02 consequences). |
| Packaging | **Docker Compose** | The submitted version must run from the README on a machine we do not control (NFR-07). |

---

# 6. Architectural Decision Records

Each ADR states the context, the decision, the alternatives rejected, and the consequences —
including the ones we would rather not have.

---

## ADR-01 — No ORM; hand-written parameterised SQL

**Status:** Accepted · 2026-09-26

**Context.** The application needs to read and write a 25-table relational schema. The default
choice in the Node ecosystem is an ORM (Prisma, TypeORM, Sequelize) or a query builder (Knex,
Drizzle). The DBMS course assesses SQL construction — joins, correlated subqueries, aggregates,
window functions — and requires the executed SQL to be displayed in the front end.

**Decision.** Use `pg` directly. Every statement is written by hand with `$1, $2 …`
placeholders, and every statement passes through `runTraced`, which returns the SQL text and
bound parameters along with the data.

**Alternatives rejected.**
- *Prisma.* Generates SQL we would then have to intercept and re-surface; the schema would be defined in a proprietary DSL rather than in DDL, and triggers and procedures sit outside its model entirely.
- *Knex.* Keeps SQL closer, but its output is assembled at runtime, so what we display would be a reconstruction rather than the statement authored.

**Consequences.**
- *Positive.* The SQL shown in the UI is the SQL executed. Window functions, `FILTER`, relational division and correlated subqueries are all available without fighting an abstraction. Query cost is visible at the point of authorship.
- *Negative.* More code to write and maintain. No compile-time checking of column names — a typo is a runtime error, which raises the value of integration tests. Repetitive CRUD is genuinely more tedious.
- *Mitigation.* Parameterisation is mandatory and never optional; identifiers used in dynamic filters come from a whitelist map (TC-A-03 asserts this). `runTraced` centralises execution so the discipline is enforced in one place.

---

## ADR-02 — Business rules live in the database

**Status:** Accepted · 2026-09-26 · **The central decision of this architecture**

**Context.** Seat allocation must never oversell a departure. The rule has two parts — check
availability, then decrement — and the two must be indivisible under concurrency. The
conventional layered design puts such logic in a service class, with the database as a passive
store. That is also what the SEPM criterion "appropriateness of the proposed system design"
usually rewards: modular, testable, framework-agnostic business logic.

**Decision.** Implement seat management, status auditing and guide-overlap prevention as
PL/pgSQL triggers and stored procedures. `book_package` takes a `SELECT … FOR UPDATE` lock on
the departure row, checks availability, and inserts; an `AFTER INSERT` trigger performs the
decrement. The application calls the procedure and does not reimplement the rule.

**Alternatives rejected.**
- *Service-layer enforcement with optimistic locking (version column + retry).* Workable, but it protects only callers that go through the service. Direct SQL, a future mobile backend, or a batch import would bypass it silently.
- *Pessimistic locking from the application (`SELECT … FOR UPDATE` issued by Node).* Equivalent in effect for this one path, but scatters the invariant across the application and depends on every future caller remembering it.
- *Application-level mutex or queue.* Correct only while exactly one API process exists — an assumption that is false the moment the system is scaled or a second client appears.

**Consequences.**
- *Positive.* The invariant holds for **every** client, not only this one. The rule lives next to the data it protects, inside the same transaction as the check. The `CHECK (available_seats >= 0)` constraint is a genuine backstop rather than decoration. This is the deciding factor: an invariant that a caller can bypass is not an invariant.
- *Negative, stated plainly.*
  1. The logic cannot be unit-tested in isolation. It is covered by integration tests against a real PostgreSQL instance (see `test_cases.md`), which are slower and need a disposable database.
  2. Business logic is split across two languages, JavaScript and PL/pgSQL. A developer must read both to understand a booking.
  3. Schema migrations and logic changes are coupled: changing the refund tiers means shipping a migration, not editing a function.
  4. Debugging PL/pgSQL is poorer than debugging JavaScript — no step debugger in the normal workflow, and errors surface as SQLSTATE codes.
- *Accepted because* the correctness guarantee is the point of the project, and it is the one property that cannot be recovered later if the enforcement point is wrong.
- *Noted for coverage reporting:* line coverage of the JavaScript layer understates what is tested, because the most important logic is not in JavaScript. `test_cases.md` states this explicitly rather than padding the number.

---

## ADR-03 — Role-per-pool RBAC, enforced by PostgreSQL

**Status:** Accepted · 2026-09-26

**Context.** Four user classes need different data access. The usual approach is a permissions
table plus middleware that checks it before each handler.

**Decision.** Create five PostgreSQL roles (`app_customer`, `app_agent`, `app_manager`,
`app_dbadmin`, `sql_console_ro`) with `GRANT`s expressing exactly what each may do, and open one
`pg.Pool` per role. `poolFor(req)` selects the pool from the authenticated user's role and
defaults to the most restricted pool when there is no session. Middleware role checks remain,
but as defence in depth, not as the control.

**Alternatives rejected.**
- *Middleware-only authorisation with a single privileged connection.* One missing check, or one route added without one, grants full access. The database cannot tell the difference between a legitimate request and a mistake.
- *PostgreSQL row-level security.* Powerful and tempting, but the requirement here is table-and-operation granularity, not row filtering; RLS would add policy complexity without addressing the stated need.

**Consequences.**
- *Positive.* `app_agent` attempting `DELETE FROM booking` is refused by PostgreSQL with SQLSTATE 42501 — a refusal that no application bug can undo, and one that is directly demonstrable in `psql` during the viva (TC-R-01). Privilege is declared in one auditable file, `07_roles_grants.sql`.
- *Negative.* Five pools means five sets of idle connections. Permission errors surface as database errors that the API must translate into sensible HTTP responses. Adding a table means remembering to grant on it, and a forgotten grant fails at runtime rather than at deploy time.
- *Note.* `app_dbadmin` is deliberately **not** a superuser. A superuser can reach the host shell through `COPY … TO PROGRAM`, which would make every other control in this design advisory.

---

## ADR-04 — The prediction model runs as a separate service

**Status:** Accepted · 2026-09-26

**Context.** The cancellation-risk model is trained with scikit-learn. The API is Node.js.
Predictions must use features computed from the live database.

**Decision.** Run the model in a Python FastAPI process on port 8000. The Node API calls
`POST /predict` with a `booking_id`; the service runs `features.sql` against PostgreSQL itself,
scores the vector, and returns `{ risk_score, label, model_version }`. Node persists the result
in `cancellation_prediction`.

**Alternatives rejected.**
- *Port the model to JavaScript.* No comparable ecosystem; re-implementing feature engineering in a second language invites training/serving skew.
- *Export to ONNX and run in Node.* Removes the Python process but adds a conversion step to the build and obscures the model behind a binary artifact, which makes the ML work harder to explain in a viva.
- *Precompute scores in a batch job.* Simpler, but scores would be stale, and the requirement is explicitly that features are read from SQL *at prediction time* — that live read is what makes the component integrated rather than a notebook parked beside the project.

**Consequences.**
- *Positive.* Each language is used for what it is good at. A failure in the prediction service cannot take down booking — the risk column simply shows "unavailable". The model can be retrained and the service restarted without touching the API.
- *Negative.* A third process to start, and a fourth container in Compose. Two components now hold database credentials. Cross-process calls add latency to the at-risk view, and an end-to-end failure can originate in either process.
- *Mitigation.* The API treats the prediction service as optional: calls are time-limited and failures degrade the view rather than the request.

---

## ADR-05 — `departure.available_seats` is stored, not derived

**Status:** Accepted · 2026-09-26

**Context.** Available seats are derivable: `total_seats` minus the sum of `num_travellers`
over confirmed bookings for that departure. Storing a derivable value is denormalization, and
the project is otherwise held to 3NF/BCNF.

**Decision.** Store `available_seats` on `departure`, maintain it by trigger, and constrain it
with `CHECK (available_seats >= 0)` and `CHECK (available_seats <= total_seats)`.

**Alternatives rejected.**
- *Compute on read with an aggregate.* Correct, and it keeps the schema pure — but it cannot be locked cleanly. `SELECT … FOR UPDATE` locks rows it returns; an aggregate over `booking` does not give a single row to lock, so two concurrent bookings could both read the same total. Serialisable isolation would fix it at the cost of retry loops throughout the application.
- *A materialised view refreshed on change.* Refresh is not transactional with the booking insert, so there is a window of staleness — precisely the window that causes overselling.

**Consequences.**
- *Positive.* One row to lock, so the check-and-decrement is a two-statement critical section. Availability reads are O(1) and can be shown in a catalogue listing without an aggregate per row.
- *Negative.* The value can in principle drift from the truth if a trigger is wrong or data is inserted directly with triggers disabled. It is redundant data, which the normalization document must justify rather than hide.
- *Mitigation.* The only writer is the trigger; the `CHECK` constraint makes an incorrect decrement abort the transaction rather than corrupt the count; the seeding script asserts consistency between bookings and seat counts after loading; tests TC-B-03 and TC-T-03 verify the decrement and the backstop.
- *Recorded in* `normalization.md` §5 as a conscious trade-off, with this ADR as its justification.

---

# 7. Data design

The full data model is specified in the project brief (25 tables) and documented in
`normalization.md`. Two aspects are architectural rather than merely structural:

**Package versus departure.** A `package` is a template; a `departure` is one dated, priced,
seat-limited instance of it. The functional dependency is `departure_id → price`, not
`package_id → price`. Putting price on `package` would create an update anomaly across
departures and make it impossible to sell the same package twice. This single separation is
what makes the rest of the booking model work.

**Two ER diagrams, deliberately.** `docs/er_conceptual.png` is drawn by hand in Chen notation —
ovals for attributes, diamonds for relationships, double rectangles for weak entities, double
lines for total participation — and demonstrates conceptual modelling. `GET /api/schema/erd`
generates crow's-foot relational notation from `information_schema` at request time and
demonstrates the mapping to tables. Mermaid cannot render Chen notation, which is why both are
needed rather than one being a rendering of the other.

---

# 8. Deployment view

```
Developer machine (localhost only — nothing is published)

  docker compose up
  ├── postgres:16        :5432   volume: pgdata      db/*.sql on first init
  ├── voyagex-api        :4000   depends_on postgres, bound to 127.0.0.1
  └── voyagex-ml         :8000   depends_on postgres

  npm run dev (client)   :5173   Vite dev server, proxy → :4000
```

Credentials come from `.env`, which is git-ignored; `.env.example` is committed with dummy
values (C-07, NFR-12). All services bind to `127.0.0.1` (C-06).

---

# 9. Quality attributes and how the architecture delivers them

| Attribute | Mechanism |
|---|---|
| **Correctness under concurrency** | Row lock inside a stored procedure; `CHECK` backstop; verified by TC-C-01 |
| **Security** | Privilege enforced by PostgreSQL roles (ADR-03); bcrypt password storage; universal parameterisation; non-superuser admin role |
| **Auditability** | Trigger-written `booking_audit` that the application cannot bypass; `admin_query_log` written outside the audited transaction |
| **Transparency** | `runTraced` as a single choke point, `<QueryTrace>` on every data screen, ERD generated from the live catalog |
| **Testability** | Integration tests against a real database; `reset.sh` gives a clean state per suite. Acknowledged limitation: PL/pgSQL logic is not unit-testable in isolation (ADR-02) |
| **Portability** | Docker Compose; a clean clone runs from the README (NFR-07) |
| **Modifiability** | Layered, downward-only calls; routes are thin; SQL is centralised in `queries/` and `procedures.sql` |

---

# 10. Known architectural risks

| Risk | Consequence | Mitigation |
|---|---|---|
| Trigger and procedure logic drifts from application expectations | Silent data errors | Integration tests assert the database-side effects directly, not the API's report of them |
| `available_seats` drifts from booking reality | Overselling or under-selling | Single writer, `CHECK` constraints, post-seed consistency assertion (ADR-05) |
| Long-running admin statement blocks the application | Apparent outage | `statement_timeout` and `lock_timeout` on console routes |
| Prediction service unavailable | At-risk view empty | Treated as optional; failures degrade the view, not the request (ADR-04) |
| Five pools exhaust PostgreSQL connections | Requests queue | Small per-pool maxima; the system is single-user in demonstration |

---

## Revision history

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-09-26 | Initial baseline: layered architecture, module descriptions, technology justification, ADR-01 … ADR-05 |
