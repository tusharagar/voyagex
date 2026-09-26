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

## Current status — Phases 1–8 of 13 complete · 95 tests passing

> **2026-09-26.** Requirements and design are baselined, and the database schema builds.
> Setup steps below are marked *(pending)* where the code has not landed yet. This section is
> updated as each phase completes; see [`docs/project_plan.md`](docs/project_plan.md) for the
> schedule and actuals.

| Phase | Deliverable | Status |
|---|---|---|
| P1 | Requirements and design: SRS, use cases, architecture + ADRs, wireframes, plan | ✅ Complete |
| P2 | Schema, constraints, `reset.sh` | ✅ Complete — 25 tables, 108 constraints |
| P3 | Seed data | ✅ Complete — 1200 bookings, deterministic |
| P4 | Triggers and stored procedures | ✅ Complete — 3 triggers, 2 procedures, concurrency verified |
| P5 | Roles and grants | ✅ Complete — 5 roles, agent DELETE refused by PostgreSQL |
| P6 | Backend: pools, tracing, auth, routes | ✅ Complete — 9 endpoints, all traced |
| P7 | Frontend end-to-end feature | ✅ Complete — 7 screens, QueryTrace on each |
| P8 | Test suite and generated test-case table | ✅ Complete — 95 tests, table generated |
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

Written for a machine with nothing installed yet.

### 1. Install the prerequisites

| | Version | Notes |
|---|---|---|
| **PostgreSQL** | 16 | Windows: the [EnterpriseDB installer](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads). **Write down the `postgres` password it asks for.** macOS: [Postgres.app](https://postgresapp.com/) or `brew install postgresql@16`. Linux: `sudo apt install postgresql-16` |
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org), LTS build |
| **Python** | 3.11+ | Only needed to seed sample data. On Windows tick *Add Python to PATH* |

Check them in a new terminal:

```bash
psql --version     # psql (PostgreSQL) 16.x
node --version     # v20 or higher
python --version   # 3.11+   (python3 on macOS/Linux)
```

If `psql` is not found on Windows, add `C:\Program Files\PostgreSQL\16\bin` to your PATH.

### 2. Create your `.env`

One file, at the repository root — beside this README, **not** inside `server/`.
It is git-ignored because it holds passwords; `.env.example` is the committed template.

```bash
cp .env.example .env          # macOS / Linux
copy .env.example .env        # Windows cmd
Copy-Item .env.example .env   # Windows PowerShell
```

Then change exactly two lines:

```ini
PGADMIN_PASSWORD=<the postgres password from the installer>
JWT_SECRET=<any long random string of your own>
```

Leave the rest. The `app_customer`, `app_agent`, `app_manager`, `app_dbadmin` and
`sql_console_ro` passwords are *applied to the database* by `db/reset.sh`, so the file and
the database always agree. The API refuses to start while `JWT_SECRET` is still the
placeholder.

This one file is read by `db/reset.sh`, the API (`server/loadEnv.js`), `db/seed.py` and the
test suite (`vitest.config.js`).

### 3. Build and run

```bash
# Build the database: creates it if absent, then 25 tables, constraints,
# triggers, procedures and the five roles. Safe to re-run at any time.
./db/reset.sh                    # Windows: bash db/reset.sh   (Git Bash)

# Load sample data — 1200 bookings, deterministic
pip install -r db/requirements.txt
python db/seed.py

# API  (leave running)
cd server && npm install && npm run dev        # → http://127.0.0.1:4000
curl http://127.0.0.1:4000/api/health

# Web app  (second terminal)
cd client && npm install && npm run dev        # → http://127.0.0.1:5173
```

Open <http://127.0.0.1:5173>.

### 4. Sample credentials

Dummy accounts in your local database, created by `db/seed.py`. Not credentials for
anything, and present only so the system can be signed into.

| Role | Email | Password |
|---|---|---|
| Customer | `customer@example.test` | `voyagex-demo` |
| Agent | `agent@example.test` | `voyagex-demo` |
| Manager | `manager@example.test` | `voyagex-demo` |
| DB admin | `dbadmin@example.test` | `voyagex-demo` |

### Troubleshooting

| Symptom | Cause |
|---|---|
| `password authentication failed for user "postgres"` | `PGADMIN_PASSWORD` in `.env` is not the password set during install |
| `no PostgreSQL server at 127.0.0.1:5432` | The service is not running — `sudo systemctl start postgresql`, or start it from Services on Windows |
| `JWT_SECRET is unset or still the .env.example placeholder` | Change `JWT_SECRET` in `.env` |
| `refusing to reset 'postgres'` | `PGDATABASE` was changed to a maintenance database. It should be `travel_tourism` |
| `no password supplied` from `seed.py` | `.env` is not at the repository root, or was never created |
| `must be owner of schema public` | The connecting user is not a superuser. `PGADMIN_USER` should be `postgres` |
| Odd failures naming a database or role with a stray character | `.env` saved with Windows CRLF line endings. `db/reset.sh` strips them, but if you hit this elsewhere, set the file to LF (bottom-right corner in VS Code) |
| `could not drop and recreate schema` while pgAdmin is open | Another client holds a lock. Close pgAdmin and re-run |

## Tests

```bash
npm install               # once, at the repository root
npm test                  # 95 tests: vitest + supertest against a disposable travel_test DB
npm run test:coverage     # with a coverage summary
npm run test:report       # runs the suite AND regenerates docs/test_cases.md from it
```

The suite builds its own database with `./db/reset.sh --test`, then truncates and reloads
`tests/fixtures/sample_data.sql` before **each** test, so no test can pass only because another
ran first.

[`docs/test_cases.md`](docs/test_cases.md) is **generated from the run**, never written by hand —
the expected/actual/status columns cannot drift from what actually happened.

The test-case table in `docs/test_cases.md` is **generated from a real run**, not written by
hand:

```bash
npx vitest run --reporter=json --outputFile=tests/results.json
node scripts/generate_test_table.js
```

The test that matters most is the concurrency test: two clients, one seat, exactly one
booking. See [`docs/use_cases.md`](docs/use_cases.md) UC-07 exception flow E2.

---

## Demo walkthrough

Screenshots of every screen are in [`docs/screenshots/`](docs/screenshots/). The order that
shows the system best:

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
