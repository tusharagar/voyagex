# Contribution Record
## VoyageX — Travel and Tourism Management System

**Version:** 1.0 · **Baselined:** 2026-09-26 · **Feeds report section 13**

> **Action required before submission.** Member names, registration numbers, section and group
> number are pending and are marked `⟨TBC⟩`. Every `⟨TBC⟩` in this file must be filled in, and
> the declaration in §5 confirmed by each member, before the ZIP is packaged. These fields are
> on the submission checklist.

---

# 1. Group details

| Field | Value |
|---|---|
| Project title | VoyageX — Travel and Tourism Management System |
| DBMS project topic | 10 — Travel and Tourism Management |
| Course and section | B.Tech CSE 3rd year · Section ⟨TBC⟩ |
| Group number | ⟨TBC⟩ |
| Supervisor / instructor | ⟨TBC⟩ |
| Repository | `tusharagar/voyagex` |
| Mid-semester deadline | 2026-10-03 |

# 2. Members

| Label | Name | Registration no. | Primary module | Git identity |
|---|---|---|---|---|
| **A** | Tushar Agarwal | ⟨TBC⟩ | Database layer | `tusharagar` |
| **B** | ⟨TBC⟩ | ⟨TBC⟩ | Backend / API | ⟨TBC⟩ |
| **C** | ⟨TBC⟩ | ⟨TBC⟩ | Frontend | ⟨TBC⟩ |
| **D** | ⟨TBC⟩ | ⟨TBC⟩ | Testing, tooling, ML | ⟨TBC⟩ |

*Adjust the allocation if the group is smaller or larger than four; the principle to preserve is
that each member owns a layer they can explain end to end.*

---

# 3. Task allocation

Modules are allocated so that contributions are **separable** — each member owns files no one
else writes, so that the git history evidences individual work and each member can walk through
their own code in the viva and the demonstration video.

| Member | Owns | Files and artifacts | Phases |
|---|---|---|---|
| **A — Database** | The schema and everything enforced inside PostgreSQL | `db/01_schema.sql`, `db/02_constraints.sql`, `db/03_views.sql`, `db/04_indexes.sql`, `db/05_triggers.sql`, `db/06_procedures.sql`, `db/07_roles_grants.sql`, `db/reset.sh`, `db/queries/q01..q15`, `docs/normalization.md`, `docs/er_conceptual.png` | P2, P4, P5, P10, P13 |
| **B — Backend** | The API and the transparency mechanism | `server/db/pools.js`, `server/utils/runTraced.js`, `server/middleware/auth.js`, `server/services/booking.service.js`, `server/routes/*`, `.env.example` | P6, P11 (consoles) |
| **C — Frontend** | Every screen and the design that precedes it | `client/src/pages/*`, `client/src/components/QueryTrace.jsx`, `client/src/api/*`, `docs/wireframes/*` | P1 (wireframes), P7, P11 |
| **D — Testing, tooling, ML** | Proof that it works, and the intelligent feature | `tests/**`, `scripts/generate_test_table.js`, `docker-compose.yml`, `ml/*`, `docs/test_cases.md`, `docs/project_plan.md`, `docs/meeting_log.md` | P3, P8, P9, P12 |

**Shared, written jointly:** `docs/SRS.md`, `docs/use_cases.md`, `docs/architecture.md`,
`docs/problem_statement.md`, `README.md`, `AI_DISCLOSURE.md`, the report and the video.

## 3.1 Interfaces between members

Agreed on day 1 so that the four layers can proceed in parallel rather than in sequence:

| Interface | Contract | Between |
|---|---|---|
| Traced response shape | Every SQL-bearing endpoint returns `{ sql, params, columns, rows, rowCount, executionMs, plan }` | B → C |
| Stored procedure signatures | `book_package(int, int, int[]) → int`; `cancel_booking(int, text, int) → void` | A → B |
| Error contract | Domain failures raise named exceptions (`INSUFFICIENT_SEATS`, `DEPARTURE_NOT_AVAILABLE`); privilege failures surface as SQLSTATE 42501 | A → B → C |
| Test database | `travel_test`, rebuilt by `db/reset.sh` before each suite | A → D |
| Feature query | `ml/features.sql` returns one feature row per `booking_id` | A → D |

---

# 4. Individual contribution record

Updated as work completes. Commit counts are taken from `docs/git_history.txt`, exported before
submission with:

```bash
git log --pretty=format:'%h %an %ad %s' --date=short > docs/git_history.txt
```

## 4.1 Phase 1 — Requirements and design (2026-09-26) ✅

| Member | Contribution | Evidence |
|---|---|---|
| A | ⟨TBC — record what you wrote⟩ | commits of 26 Sep |
| B | ⟨TBC⟩ | |
| C | ⟨TBC⟩ | |
| D | ⟨TBC⟩ | |

> Phase 1 artifacts were drafted with AI assistance and are disclosed in `AI_DISCLOSURE.md`.
> Each member must review the artifacts covering their own layer before submission, and record
> here what they verified or changed. A contribution row that says only "reviewed" is worth
> less than one that names a correction made.

## 4.2 Phases 2–9 — Mid-semester implementation

| Member | Planned contribution | Actual | Commits |
|---|---|---|---|
| A | Schema, constraints, triggers, procedures, roles, `reset.sh` | ⬜ pending | |
| B | Pools, `runTraced`, auth, catalogue/booking/payment routes | ⬜ pending | |
| C | Login, catalogue, package detail, booking flow, my bookings, `<QueryTrace>` | ⬜ pending | |
| D | Seed script, test suite incl. concurrency test, generated test table, Compose | ⬜ pending | |

## 4.3 Summary table for the report

| Member | Modules owned | Approx. share | Can demonstrate |
|---|---|---|---|
| A | Database layer: 25 tables, 3 triggers, 2 procedures, 5 roles | ⟨TBC⟩% | Normalization reasoning, the `FOR UPDATE` lock, the RBAC refusal in `psql` |
| B | API layer: pools, tracing, auth, routes | ⟨TBC⟩% | The traced response, transaction handling, parameterisation |
| C | Client: 5 screens, `<QueryTrace>` | ⟨TBC⟩% | The end-to-end booking path with SQL visible at each step |
| D | Tests, tooling, ML | ⟨TBC⟩% | The concurrency test, the generated test table, the prediction pipeline |

---

# 5. Individual contribution declaration

> Each member confirms, by adding their name and the date below, that:
>
> 1. the contribution recorded against them in §4 is accurate;
> 2. they have reviewed the code and documents attributed to them and can explain them on
>    request;
> 3. the use of AI tools is disclosed accurately in `AI_DISCLOSURE.md`;
> 4. the submission contains no material copied from another group or from an undisclosed
>    source.

| Member | Name | Confirmed on | Signature / confirmation |
|---|---|---|---|
| A | ⟨TBC⟩ | | |
| B | ⟨TBC⟩ | | |
| C | ⟨TBC⟩ | | |
| D | ⟨TBC⟩ | | |

*For the ZIP, export this section to `06_Project_Management/Contribution_Record.pdf` with the
declaration signed or confirmed by all members, as the evaluation handout requires.*

---

# 6. Git discipline

Rules adopted for this project, because commit history is submitted as contribution evidence
(risk R-06 in `project_plan.md`):

1. **Each member commits under their own git identity.** Set once per clone:
   `git config user.name "…"` and `git config user.email "…"`.
2. **No single member pushes everyone's work.** A single-author history undermines the whole
   individual-contribution section, whatever this document says.
3. **Conventional commit messages:** `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
4. **One branch per feature**, merged when the exit condition in the plan is met.
5. **Steady commits.** A history consisting of one large commit on 2 October reads exactly as
   what it is.
