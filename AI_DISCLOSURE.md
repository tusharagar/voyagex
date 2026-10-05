# Disclosure of Generative AI Tool Use

**Project:** VoyageX — Travel and Tourism Management System
**Courses:** DBMS (project topic 10) · Software Engineering and Project Management
**Required by:** SEPM mid-semester evaluation handout, §6 (Academic Integrity and Use of AI Tools)
**Last updated:** 2026-10-02

This disclosure is maintained as the project proceeds. Each entry records the tool, what it was
used for, what it produced, and what the group verified or changed. It is updated in the same
commit as the work it describes, not reconstructed at the end.

---

## 1. Tools used

| Tool | Version / model | Used by | Period |
|---|---|---|---|
| Claude Code (Anthropic) | Opus 5 family, accessed through the Claude Code CLI | Project group | 2026-09-26 – ongoing |

No other generative AI tool has been used on this project. If one is, it is added here.

---

## 2. Record of use

### 2.1 Phase 1 — Requirements and design artifacts · 2026-09-26

**Purpose.** Drafting the requirements and design documentation for the mid-semester
submission, under a seven-day schedule.

**Nature of the generated content.** First drafts of:

| Artifact | What was generated |
|---|---|
| `docs/problem_statement.md` | Problem statement, nine project objectives, stakeholder table |
| `docs/SRS.md` | 30 functional and 12 non-functional requirements, MoSCoW prioritisation, scope and exclusions, traceability matrix |
| `docs/use_cases.md` | Inventory of 21 use cases, five detailed descriptions with alternate and exception flows, nine user stories |
| `docs/uml/use_case_diagram.puml` | PlantUML source for the use-case diagram |
| `docs/architecture.md` | Layered architecture description, module descriptions, technology justification, five Architectural Decision Records |
| `docs/wireframes/*.svg` | Five low-fidelity wireframes as hand-written SVG |
| `docs/project_plan.md` | Work breakdown, seven-day sprint plan, semester plan, ten-entry risk register |
| `docs/contribution_record.md`, `docs/meeting_log.md` | Structure and templates; content pending confirmation by the group |

**Input supplied by the group.** The two course handouts, the chosen project topic, and a
detailed project brief written by the group that fixed the technology stack, the 25-table data
model, the business rules, the constraints (no ORM, rules in the database, PostgreSQL only) and
the build order. The architectural decisions recorded in the ADRs are the group's decisions;
the tool drafted the prose that documents them, including the rejected alternatives and the
stated costs.

**What the group verified or modified.** *To be completed as review proceeds — each member
records what they checked in their own layer. A row that names a correction is worth more than
one that says "reviewed".*

| Reviewer | Artifact reviewed | Verified / corrected | Date |
|---|---|---|---|
| ⟨TBC⟩ | | | |

**Known items requiring group verification before submission:**

1. Every `⟨TBC⟩` placeholder — names, registration numbers, section, group number, supervisor.
2. The meeting log entry M-01 — attendees and decisions must be confirmed by those present.
3. The contribution tables — currently a plan, not a record; they become a record only once
   work is done and attributed.
4. The traceability matrix references test case IDs that do not yet exist. `docs/test_cases.md`
   is generated from a real test run in Phase 8; until then those references are planned, and
   they are labelled as such in the SRS.
5. Every requirement must be checked against what is actually built. A requirement that is
   documented but not implemented must be re-marked, not left claiming completion.

### 2.2 Phases 2 onward — Implementation

*Entries are added here as implementation proceeds: what was generated (schema, procedures,
routes, components, tests), and what each member verified, corrected or rewrote. Expected areas
of AI assistance: SQL scaffolding, boilerplate routes, test scaffolding, and documentation.*

| Date | Artifact | Generated content | Verification / modification by the group |
|---|---|---|---|
| 2026-10-02 | `server/utils/runTraced.js`, 13 response sites across `server/routes/*.js`, `client/src/pages/AdminQuery.jsx`, `server/routes/admin.js` (new) | A security fix restricting the FR-24 SQL trace to DB_ADMIN sessions only, after review found it was shipping bound parameter values and row data to every role; a new DB_ADMIN-only read-only SQL console (routes `POST /api/admin/query`, `GET /api/admin/schema`) with a clickable table/column browser on the client | Verified live against a running server with all four roles (CUSTOMER, AGENT, MANAGER, DB_ADMIN) via direct HTTP requests before being accepted, not just by reading the code; a write attempt through the console was confirmed refused by PostgreSQL's own grant, not by application logic |
| 2026-10-02 | `tests/integration/api.test.js`, `tests/fixtures/sample_data.sql`, `tests/globalSetup.js`, `tests/setup.js` | 6 new automated tests for the above (TC-A-24 … TC-A-29); fixes to 6 existing tests that the trace change broke; a real bug fix to the fixture's seeded password hash (same root cause as the `db/seed.py` bug below) plus a missing DB_ADMIN seed row; a Windows portability fix to the test harness itself (`execFileSync` could not run a shebang script via Windows `CreateProcess` — `EFTYPE`) | Full suite re-run against a real, disposable `travel_test` database before and after each change, not assumed from reading the diff: 95 → 101 passing, 0 failing. `docs/test_cases.md` regenerated from that real run (`npm run test:report`), not edited by hand. |
| 2026-10-02 | `db/seed.py` (`DEMO_PASSWORD_HASH`) | A bug fix: the documented demo password `voyagex-demo` never actually matched the committed hash — it was a generic tutorial example hash, not one generated from that password. Reported by the user as a login failure, root-caused with `bcrypt.compare`, and fixed with a correctly generated hash | Verified with `bcrypt.compare('voyagex-demo', <new hash>)` returning `true` before committing, and by a live login against the already-seeded development database afterward |
| 2026-10-02 | `docs/SRS.md`, `docs/architecture.md`, `docs/use_cases.md`, `docs/project_plan.md`, `docs/problem_statement.md`, `docs/challenges_log.md`, `README.md` | Documentation updated to match the above: FR-24/FR-26/FR-27 requirement text revised, the traceability matrix updated to real (not placeholder) test IDs, UC-19 rewritten to describe what was actually built rather than the originally planned preview/commit design, three new `challenges_log.md` entries (C-07, C-08, C-09), the README's demo walkthrough corrected so it no longer tells a reader to look for the trace panel on a screen that no longer shows it | Each claim cross-checked against the actual code and a real test run rather than drafted from the feature description alone — e.g. the "101 tests passing" and "25 tables" figures quoted in these docs are copied from real command output captured during this session, not estimated |

---

## 3. Responsibility

The group remains responsible for the correctness, security and originality of everything
submitted, whether or not it was drafted with AI assistance.

Specifically, the group commits to the following before submission:

1. **Every member can explain the modules attributed to them**, including code they did not
   type. Time is set aside before submission for each member to read through their own layer;
   this is scheduled in `docs/project_plan.md`.
2. **Generated SQL is verified against real data**, not accepted because it parses. Queries are
   checked to return sensible results against the seeded dataset.
3. **Generated constraints and business rules are checked against the requirements**, not
   assumed correct.
4. **Tests are run, not described.** `docs/test_cases.md` is generated from actual test output,
   so the expected/actual/pass-fail columns reflect a real execution.
5. **No credentials, keys or passwords** appear in generated content that reaches the
   repository, screenshots or the demonstration video.

The evaluation handout states that code group members cannot explain may result in reduced
marks. The group accepts that standard, and this disclosure is written to be specific enough to
be useful rather than vague enough to be safe.
