# VoyageX — Travel and Tourism Management System

A travel-agency management system built around a PostgreSQL database that enforces its own
business rules, with a front end that shows you the SQL behind every screen.

Submitted for two courses from one codebase:

| | Course | Assessed on |
|---|---|---|
| **DBMS** | Database Management Systems, project topic 10 — Travel and Tourism Management | Database design, SQL, triggers, procedures, transactions, RBAC, ML integration |
| **SEPM** | Software Engineering and Project Management, mid-semester evaluation (due 2026-10-03) | Requirements, design, implementation progress, testing, process evidence |

---

## What it does

A package is a template; a **departure** is one dated, priced, seat-limited running of it. That
separation is the centre of the data model, and everything else follows from it: customers book
departures, seats are allocated atomically, cancellations restore them, and the refund depends
on how long is left before the trip.

Three things make it more than a booking form:

1. **The database enforces the rules, not the application.** Seat allocation runs inside a
   PL/pgSQL procedure that takes a `SELECT … FOR UPDATE` row lock. Two customers taking the last
   seat at the same moment produce exactly one booking — for any client, including a direct
   `psql` session. Status changes are audited by a trigger the application cannot bypass.
2. **Access control is PostgreSQL's job.** Five database roles, one connection pool each. An
   agent attempting `DELETE FROM booking` is refused by PostgreSQL with SQLSTATE 42501, not by
   a middleware check that could be forgotten on the next route.
3. **Every screen shows its SQL.** Each data response carries the statement, its bound
   parameters (`$1`, `$2` — left uninterpolated on purpose), the column names, the row count
   and the execution time. The ER diagram is generated at request time from
   `information_schema`, so it cannot drift from the live schema.

---

## Current status — Phases 1–2 of 13 complete

> **2026-09-26.** Requirements and design are baselined, and the database schema builds.
> Setup steps below are marked *(pending)* where the code has not landed yet. This section is
> updated as each phase completes; see [`docs/project_plan.md`](docs/project_plan.md) for the
> schedule and actuals.

| Phase | Deliverable | Status |
|---|---|---|
| P1 | Requirements and design: SRS, use cases, architecture + ADRs, wireframes, plan | ✅ Complete |
| P2 | Schema, constraints, `reset.sh` | ✅ Complete — 25 tables, 108 constraints |
| P3 | Seed data | ⬜ Pending |
| P4 | Triggers and stored procedures | ⬜ Pending |
| P5 | Roles and grants | ⬜ Pending |
| P6 | Backend: pools, tracing, auth, routes | ⬜ Pending |
| P7 | Frontend end-to-end feature | ⬜ Pending |
| P8 | Test suite and generated test-case table | ⬜ Pending |
| P9 | UML, README, Compose, report, video | ⬜ Pending |
| P10–P13 | Showcase queries, remaining screens, ML, DBMS report | ⬜ After mid-semester |

---

## Documentation

Start here — the design is documented before it is built, deliberately.

| Document | What it covers |
|---|---|
| [`docs/problem_statement.md`](docs/problem_statement.md) | The problem, nine objectives, nine stakeholders |
| [`docs/SRS.md`](docs/SRS.md) | 30 functional and 12 non-functional requirements, MoSCoW priorities, scope and exclusions, **traceability matrix** |
| [`docs/use_cases.md`](docs/use_cases.md) | 21 use cases, 5 described in full with exception flows, 9 user stories |
| [`docs/architecture.md`](docs/architecture.md) | Layered architecture, module descriptions, technology justification, **ADR-01 … ADR-05** |
| [`docs/wireframes/`](docs/wireframes/) | Low-fidelity wireframes for the 5 mid-semester screens |
| [`docs/project_plan.md`](docs/project_plan.md) | Work breakdown, 7-day sprint, semester plan, 10-entry risk register, weekly progress |
| [`docs/contribution_record.md`](docs/contribution_record.md) | Task allocation by module, per-member contributions, declaration |
| [`docs/meeting_log.md`](docs/meeting_log.md) | Meeting records with action items |
| [`docs/challenges_log.md`](docs/challenges_log.md) | Problems hit, what was tried, what was done |
| [`AI_DISCLOSURE.md`](AI_DISCLOSURE.md) | Generative AI use, per artifact, with verification record |

The four ADRs worth reading first are **ADR-02** (why business rules live in the database, and
what that costs), **ADR-03** (role-per-pool access control), **ADR-05** (why `available_seats`
is stored rather than derived), and **ADR-01** (why there is no ORM).

---

## Technology

| Layer | Choice |
|---|---|
| Database | PostgreSQL 16, PL/pgSQL, `pg_trgm` |
| Backend | Node.js 20, Express 5, ESM, `pg` — **no ORM** |
| Auth | bcrypt, jsonwebtoken · Validation: zod |
| Frontend | React 18, Vite, Tailwind, React Router, Recharts, mermaid |
| ML | Python 3.11, FastAPI, scikit-learn, pandas, joblib |
| Testing | vitest, supertest, @testing-library/react, pytest |
| Packaging | Docker Compose |

Ports: PostgreSQL `5432` · API `4000` · client `5173` · prediction service `8000`. Everything
binds to `127.0.0.1`; nothing is deployed.

Rationale for each choice — including the deliberate refusals (no ORM, no Next.js, no state
library) — is in [`docs/architecture.md`](docs/architecture.md) §5.

---

## Setup

### Prerequisites

- Docker and Docker Compose, **or** PostgreSQL 16 + Node.js 20 + Python 3.11 locally.

### 1. Configure

```bash
git clone https://github.com/tusharagar/voyagex.git
cd voyagex
cp .env.example .env
# edit .env and replace every "replace_me" value
```

`.env` is git-ignored. No credentials are committed anywhere in this repository.

### 2. Run with Docker Compose *(pending — Phase 9)*

```bash
docker compose up --build        # postgres + api + ml service
cd client && npm install && npm run dev
```

Then open <http://127.0.0.1:5173>.

### 3. Run locally without Docker *(database works; API and client pending — Phases 6–7)*

```bash
# Database: build the schema from empty. reset.sh creates the database if it
# does not exist, so this is the only command needed.
./db/reset.sh                    # 25 tables + constraints today; picks up
                                 # views, indexes, triggers, procedures and
                                 # roles automatically as those files land
./db/reset.sh --test             # same, against the test database
./db/reset.sh --seed             # rebuild, then seed (Phase 3)

# API
cd server && npm install && npm run dev        # → http://127.0.0.1:4000

# Client
cd client && npm install && npm run dev        # → http://127.0.0.1:5173

# Prediction service (optional; the app runs without it)
cd ml && pip install -r requirements.txt && uvicorn predict_service:app --port 8000
```

`./db/reset.sh` drops and rebuilds everything in one command. It is safe to run repeatedly.

### 4. Sample credentials *(pending — available after seeding)*

Seeded accounts for demonstration. These are dummy accounts in a local database, not real
credentials:

| Role | Email | Password |
|---|---|---|
| Customer | `customer@example.test` | *(see seed output)* |
| Agent | `agent@example.test` | *(see seed output)* |
| Manager | `manager@example.test` | *(see seed output)* |
| DB admin | `dbadmin@example.test` | *(see seed output)* |

---

## Tests *(pending — Phase 8)*

```bash
cd server
npm test                  # vitest + supertest against a disposable travel_test database
npm run test:coverage     # coverage summary

cd ../ml && pytest        # feature-extraction tests
```

The test-case table in `docs/test_cases.md` is **generated from a real run**, not written by
hand:

```bash
npx vitest run --reporter=json --outputFile=tests/results.json
node scripts/generate_test_table.js
```

The test that matters most is the concurrency test: two clients, one seat, exactly one
booking. See [`docs/use_cases.md`](docs/use_cases.md) UC-07 exception flow E2.

---

## Demo walkthrough *(pending)*

The order that shows the system best:

1. **Book something end to end** — register, search, open a package, book two travellers.
2. **Open the QueryTrace panel** under the booking — the procedure call, `$1 $2 $3` still as
   placeholders, timing.
3. **Run the concurrency test** and watch one of two contending bookings fail with
   `INSUFFICIENT_SEATS` while seats land exactly at zero.
4. **Refuse a deletion** — `psql -U app_agent -c "DELETE FROM booking"` → SQLSTATE 42501.
5. **Open the schema viewer** — the ERD is generated from `information_schema`, live.

---

## Repository layout

```
voyagex/
├── README.md              AI_DISCLOSURE.md      .env.example   .gitignore
├── db/                    schema, constraints, views, indexes, triggers,
│                          procedures, roles, queries/q01..q15, seed.py, reset.sh
├── server/                pools · runTraced · middleware · services · routes
├── client/                pages · components (QueryTrace) · api
├── ml/                    features.sql · train.py · predict_service.py
├── tests/                 unit · integration · fixtures
└── docs/                  SRS · use cases · architecture · wireframes · uml ·
                           normalization · project plan · contribution · meeting log
```

---

## Licence and academic note

Coursework submitted at MNNIT Allahabad. Generative AI use is disclosed in
[`AI_DISCLOSURE.md`](AI_DISCLOSURE.md); the group is responsible for the correctness of
everything submitted and can explain the modules attributed to each member.
