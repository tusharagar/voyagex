# Meeting Log
## VoyageX — Travel and Tourism Management System

**Feeds report section 12 and the project-management evidence folder.**

> **How to use this file.** One entry per meeting, added on the day. Keep entries short and
> real — a log of four honest three-line entries is worth more than a fabricated weekly series,
> and the evaluation handout treats fabricated progress as an integrity matter. Action items
> carry an owner and a due date, and are ticked off in the following entry.

**Template**

```
## M-nn · YYYY-MM-DD · <duration> · <in person | online>
**Attendees:** 
**Absent:** 
**Agenda:** 
**Discussion and decisions:**
1. 
**Action items:**
| # | Action | Owner | Due | Status |
|---|---|---|---|---|
```

---

## M-01 · 2026-09-26 · Phase 1 planning

**Attendees:** ⟨TBC — record who attended⟩
**Absent:** ⟨TBC⟩
**Agenda:** Confirm the shared project for DBMS and SEPM; agree scope, architecture and the
seven-day plan to the mid-semester deadline.

**Discussion and decisions:**

1. **One codebase serves both courses.** The DBMS topic (10 — Travel and Tourism Management)
   and the SEPM mid-semester submission are satisfied by the same system. The rubrics reward
   different things but do not conflict: DBMS grades what the database does, SEPM grades the
   documented evidence that the software was engineered.
   *Open item:* confirm with the DBMS instructor that a shared project is acceptable, given
   that the DBMS project is individually assessed. **Owner: A. Due: 27 Sep.**
2. **Business rules go in the database** (ADR-02), accepting that this is unconventional for a
   layered design, and recording the trade-off honestly rather than splitting the difference.
3. **Scope fixed** at the eleven screens in `architecture.md` §4; exclusions written down with
   reasons in `SRS.md` §2.6.2 rather than left implicit.
4. **Mid-semester increment** is register → search → book → view booking, with `<QueryTrace>`
   on every data screen. Nothing else is allowed to displace it.
5. **Module ownership** allocated by layer so contributions are separable
   (`contribution_record.md` §3); interfaces between layers agreed today so that the four
   layers can proceed in parallel.
6. **Risk R-01 acknowledged:** seven days to the deadline with no implementation started. The
   scope-reduction order is decided in advance (`project_plan.md` §5) so the decision is not
   made under pressure on the final evening.
7. **AI assistance** will be used for scaffolding and documentation and disclosed in
   `AI_DISCLOSURE.md`; each member reviews and must be able to explain their own layer.

**Action items**

| # | Action | Owner | Due | Status |
|---|---|---|---|---|
| 1 | Confirm with the DBMS instructor that one project may serve both courses | A | 27 Sep | ⬜ Open |
| 2 | Fill in names, registration numbers, section, group number and supervisor across `contribution_record.md` and the report cover page | All | 28 Sep | ⬜ Open |
| 3 | Each member set their own git identity in their clone before their first commit | All | 27 Sep | ⬜ Open |
| 4 | Build schema, constraints and `reset.sh`; exit condition is 25 tables from empty with zero errors | A | 27 Sep | ⬜ Open |
| 5 | Seed script to the target row counts, with biased (not random) cancellations | D | 28 Sep | ⬜ Open |
| 6 | Review the Phase 1 artifacts covering your own layer and record what you verified or corrected | All | 29 Sep | ⬜ Open |

**Artifacts produced today:** `problem_statement.md`, `SRS.md` (30 FRs, 12 NFRs, traceability
matrix), `use_cases.md` (21 use cases, 5 detailed), `architecture.md` (5 ADRs),
`wireframes/` (5 screens), `project_plan.md`, `contribution_record.md`, `AI_DISCLOSURE.md`.

---

## M-02 · ⟨date⟩ · Daily stand-up

**Attendees:**
**Agenda:** Progress against day D2; blockers.

**Discussion and decisions:**

**Action items**

| # | Action | Owner | Due | Status |
|---|---|---|---|---|
