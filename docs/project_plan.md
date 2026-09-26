# Project Plan and Progress Record
## VoyageX — Travel and Tourism Management System

**Baselined:** 2026-09-26 · **Mid-semester deadline:** 2026-10-03 (7 days from baseline)
**Feeds report section 12** (original plan · current progress · delayed or pending tasks · risks)

> **Note on this baseline.** Planning and version control for this project began on 2026-09-26,
> which is the date of the first commit in the repository. The schedule below is therefore the
> *original* plan as committed on that date, not a reconstruction. The compressed runway to the
> mid-semester deadline is recorded as risk R-01 rather than disguised by a back-dated plan.
> The "Actual" columns are updated as work completes and are never filled in ahead of the work.

---

# 1. Work breakdown structure

| Phase | Deliverable | Cut line |
|---|---|---|
| P1 | Requirements and design: SRS, use cases, architecture + ADRs, wireframes, plan | mid-sem |
| P2 | Schema: `01_schema.sql`, `02_constraints.sql`, `reset.sh` | mid-sem |
| P3 | Seed data: `seed.py`, `tests/fixtures/sample_data.sql` | mid-sem |
| P4 | Triggers and procedures: `05_triggers.sql`, `06_procedures.sql` | mid-sem |
| P5 | Roles and grants: `07_roles_grants.sql` | mid-sem |
| P6 | Backend core: pools, `runTraced`, auth, catalogue/booking/payment routes | mid-sem |
| P7 | Frontend end-to-end feature: login → catalogue → detail → booking → my bookings | mid-sem |
| P8 | Test suite + generated `test_cases.md` | mid-sem |
| P9 | UML, normalization doc, contribution records, README, Compose, report, video | mid-sem |
| P10 | Showcase queries, views, indexes, `index_impact.md` | full |
| P11 | Remaining frontend: agent dashboard, reports, query catalogue, SQL console, schema, audit | full |
| P12 | ML: features, training, prediction service, at-risk integration | full |
| P13 | DBMS report: normalization, concurrency demo, viva preparation | full |

---

# 2. Original plan — sprint to the mid-semester deadline

Seven days, 2026-09-26 to 2026-10-03. Owners use the member labels from
`contribution_record.md`; substitute names once the group roster is confirmed.

| Day | Date | Planned work | Owner | Exit condition | Actual |
|---|---|---|---|---|---|
| D1 | Fri 26 Sep | **P1** SRS, use cases, architecture + 5 ADRs, wireframes, project plan, AI disclosure | All (A leads) | Every FR has an ID, a priority and a traceability row | ✅ **Complete** — committed 26 Sep, design artifacts committed before any implementation code |
| D2 | Sat 27 Sep | **P2** 25 tables, constraints, `reset.sh`; **P3** seed script started | A | `./db/reset.sh` builds all 25 tables from empty, zero errors | ✅ **P2 complete, a day early** (26 Sep) — 25 tables, 108 constraints (45 check, 29 FK) build from empty in ~1s against PostgreSQL 16.13; verified idempotent over repeated runs and on `--test`. P3 seed script not started. |
| D3 | Sun 28 Sep | **P3** seeding to target row counts; **P4** triggers and procedures | A | Row counts match the brief; `book_package` decrements seats, cancel restores them | ⬜ Not started |
| D4 | Mon 29 Sep | **P5** roles and grants; **P6** pools, `runTraced`, auth routes | A, B | `psql -U app_agent -c "DELETE FROM booking"` is refused by PostgreSQL | ⬜ Not started |
| D5 | Tue 30 Sep | **P6** catalogue, departure, booking, payment routes | B | Every data endpoint returns all seven traced keys | ⬜ Not started |
| D6 | Wed 1 Oct | **P7** login, catalogue, package detail, booking flow, my bookings, `<QueryTrace>` | C | A user can register, search, book and see the booking, with SQL visible at each step | ⬜ Not started |
| D7 | Thu 2 Oct | **P8** test suite incl. concurrency test; generate `test_cases.md`; **P9** UML, README, Compose | D | 25+ tests pass; the table is generated from a real run | ⬜ Not started |
| — | Fri 3 Oct | **P9** report assembly, screenshots, demo video, ZIP packaging, **submit** | All | Clean clone runs from the README alone; ZIP opens correctly | ⬜ Not started |

**Buffer.** There is none inside the seven days. The mitigation for that is R-01: the
feature set is already cut to the minimum that satisfies "one working end-to-end feature", and
the drop order is fixed in advance (§5) so that a slip is absorbed by dropping scope in a known
sequence rather than by improvising on the final evening.

---

# 3. Original plan — remainder of the semester

Post-mid-semester work for the full DBMS submission.

| Week | Dates | Planned work | Owner | Actual |
|---|---|---|---|---|
| W1 | 6 – 12 Oct | **P10** showcase queries q01–q08, views, indexes | A | ⬜ |
| W2 | 13 – 19 Oct | **P10** queries q09–q15, `EXPLAIN` evidence for two indexes | A | ⬜ |
| W3 | 20 – 26 Oct | **P11** agent dashboard, reports dashboard with charts | C | ⬜ |
| W4 | 27 Oct – 2 Nov | **P11** query catalogue screen, read-only SQL console | B, C | ⬜ |
| W5 | 3 – 9 Nov | **P11** admin console with preview/commit, audit viewers, live ERD screen | B | ⬜ |
| W6 | 10 – 16 Nov | **P12** `features.sql`, training notebook, model evaluation on five metrics | D | ⬜ |
| W7 | 17 – 23 Nov | **P12** prediction service, API wiring, at-risk column | D | ⬜ |
| W8 | 24 – 30 Nov | **P13** `normalization.md`, concurrency demo doc, conceptual ER diagram | A | ⬜ |
| W9 | 1 – 7 Dec | Regression pass, DBMS report, viva preparation — every member walks their own modules | All | ⬜ |

---

# 4. Current progress (as of 2026-09-26)

| Measure | Status |
|---|---|
| Overall completion | ≈ 15% (requirements and design baselined; database schema built and verified) |
| Phases complete | P1, P2 |
| Phases in progress | — |
| Phases not started | P3 – P13 |
| End-to-end feature | Not yet working — target D6 (1 Oct) |
| Automated tests | 0 written — target D7 (2 Oct) |
| Mid-semester deliverables complete | 7 of 19 checklist items (SRS, use cases, architecture, wireframes, plan, AI disclosure, 25 tables built by `reset.sh`) |

### Delayed or pending tasks

Nothing is delayed. P2 completed on 26 September, a day ahead of its D2 slot, which buys back
part of the zero-slack problem in R-01 but does not remove it. The honest statement of position
is still that **most of the implementation is ahead of us with seven days to run**: P3 through
P9 are pending. The critical path is P4 → P6 → P7, and P7 is the deliverable the evaluation
actually requires.

---

# 5. Scope-reduction order if the schedule slips

Decided in advance so that the decision is not made under pressure on 2 October. Items are
dropped from the bottom up.

| Order | Dropped first | Consequence if dropped |
|---|---|---|
| 1 | Cancellation UI (FR-18 stays in the database and is shown through tests instead of a screen) | Loses a screen, keeps the procedure and its tests |
| 2 | Traveller management screen (FR-05); seed pre-made travellers instead | Loses the delete interface from the UI — restore before the DBMS submission, which requires it |
| 3 | Payment recording screen (FR-17) | Booking still creates the pending payment row |
| 4 | Docker Compose (README documents manual setup instead) | Raises the risk against NFR-07; do not drop unless forced |
| **Never dropped** | Register → search → book → view booking; `<QueryTrace>`; the concurrency test | These *are* the mid-semester requirement |

---

# 6. Risk register

Likelihood and impact are High / Medium / Low. Exposure is the combination.

| ID | Risk | Likelihood | Impact | Exposure | Mitigation | Owner |
|---|---|---|---|---|---|---|
| **R-01** | **Seven days to the deadline with no implementation started.** The plan has no slack; any single lost day pushes P7 into the submission day. | **High** | **High** | **Critical** | Fixed drop order agreed in advance (§5); the end-to-end path is built before anything optional; daily exit conditions so a slip is visible on the day it happens, not on 2 Oct | All |
| R-02 | Concurrency defect found late — the `FOR UPDATE` path appears to work but does not serialise under real contention | Medium | High | High | Write the concurrency test immediately after P4, not in P8; keep the two-terminal `psql` demonstration as an independent check | A |
| R-03 | Members unavailable during exams or other coursework in the same week | High | Medium | High | Modules are separable by design (database / backend / frontend / testing), so one member's absence blocks one layer rather than the whole project; interfaces (the traced response shape) are agreed on D1 so layers can proceed in parallel | All |
| R-04 | PostgreSQL version or environment mismatch on the evaluator's machine | Medium | High | High | Docker Compose pins PostgreSQL 16; clean-clone test before submission; README documents the manual path as a fallback | D |
| R-05 | Seeded cancellation data is trivially separable, so the model scores ~0.99 and reads as fabricated | Medium | Medium | Medium | Bias the generator on plausible drivers (low paid ratio, long lead time, prior cancellations, off-season) and add noise to land accuracy at 0.75–0.85; report all five metrics including the confusion matrix | D |
| R-06 | Single-author git history undermines the individual-contribution criterion | Medium | High | High | Each member commits under their own git identity from D2 onward; `git_history.txt` exported for the submission; contribution table cross-references modules to commits | All |
| R-07 | Generated code that a member cannot explain in the viva or video | Medium | High | High | AI use disclosed in `AI_DISCLOSURE.md`; each member reviews and can walk through the module they own; a dedicated walkthrough session is scheduled before submission | All |
| R-08 | Demo video link not accessible to the evaluator | Low | High | Medium | Upload early, verify in a private browser window, place the link in the report, `DEMO_VIDEO_LINK.txt` and the Moodle comment | C |
| R-09 | Credentials accidentally committed, or visible in a screenshot or the video | Low | High | Medium | `.env` git-ignored from D1; repository scanned before packaging; screenshots and video reviewed for connection strings and tokens | B |
| R-10 | Trigger logic and application expectations diverge, producing silent data errors | Medium | Medium | Medium | Integration tests assert database state directly rather than trusting the API's report of it | D |

---

# 7. Weekly progress record

Updated at the end of each week. *(SEPM requires this separately from the meeting log.)*

| Week ending | Planned | Achieved | Variance | Corrective action |
|---|---|---|---|---|
| 2026-09-26 | Baseline requirements and design artifacts (P1) | SRS with 30 FRs, 12 NFRs and a full traceability matrix; 21 use cases with 5 detailed descriptions; architecture with 5 ADRs; 5 wireframes; this plan; AI disclosure. All committed before any implementation code. | None — P1 complete on the day it was planned | Proceed to P2 on 27 Sep |
| 2026-10-03 | P2 – P9; submit mid-semester package | P2 complete 26 Sep: 25 tables, 108 constraints, `reset.sh` verified idempotent and asserting its own exit condition. Constraint behaviour spot-checked — 12 invalid writes rejected, including a negative seat count and a second cancellation of one booking. | P2 a day early | Continue to P3 (seed) and P4 (triggers, procedures) |
| 2026-10-10 | W1: showcase queries q01–q08, views, indexes | *(pending)* | | |

---

# 8. Milestones

| Milestone | Planned date | Status |
|---|---|---|
| M1 — Requirements and design baselined | 2026-09-26 | ✅ Met |
| M2 — Database builds from empty with triggers and procedures working | 2026-09-28 | 🟡 Partly met — schema and constraints build from empty (26 Sep); triggers and procedures are P4 |
| M3 — API returns traced responses on every data route | 2026-09-30 | ⬜ Pending |
| M4 — End-to-end feature working (register → search → book → view) | 2026-10-01 | ⬜ Pending |
| M5 — Test suite green, including the concurrency test | 2026-10-02 | ⬜ Pending |
| M6 — Mid-semester package submitted | 2026-10-03 | ⬜ Pending |
| M7 — Showcase queries, views and indexes complete | 2026-10-19 | ⬜ Pending |
| M8 — Full front end complete | 2026-11-09 | ⬜ Pending |
| M9 — ML component integrated end to end | 2026-11-23 | ⬜ Pending |
| M10 — DBMS submission and viva ready | 2026-12-07 | ⬜ Pending |

---

## Revision history

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-09-26 | Initial baseline: WBS, 7-day sprint plan, semester plan, risk register with 10 risks, milestones |
