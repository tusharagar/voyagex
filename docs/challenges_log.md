# Challenges Faced and Solutions Attempted

**Feeds report section 14.** Maintained as the project proceeds, so that section 14 is a record
rather than a recollection. Entries are added when a problem is hit, and closed when it is
resolved — including the attempts that did not work, which are usually the more informative
half.

---

## C-01 · Two courses, one codebase, different rubrics

**When:** 2026-09-26 · **Status:** Resolved

**Challenge.** The same system must satisfy a DBMS project, graded on database depth, and a
Software Engineering mid-semester evaluation, graded on process evidence. The obvious risk was
producing two half-projects, or documentation that describes a system different from the one
built.

**Attempted and rejected.** Maintaining separate documentation for each course. This
duplicates effort and guarantees drift between the two descriptions.

**Solution.** One set of documents, written so that each serves both: the SRS carries the
database constraints as first-class requirements; the architecture document justifies the
database-centric design in software-engineering terms; the traceability matrix links
requirements to SQL artifacts as well as to modules. The two rubrics reward different things
but do not conflict, so the deliverables are additive rather than divergent.

---

## C-02 · Business logic in the database versus a layered, testable design

**When:** 2026-09-26 · **Status:** Resolved — recorded as ADR-02

**Challenge.** The DBMS course requires triggers and stored procedures. Software-engineering
practice puts business logic in a service layer where it can be unit-tested and kept
framework-agnostic. These pull in opposite directions on the single most important rule in the
system — seat allocation.

**Attempted and rejected.**
1. *Logic in the service layer with optimistic locking.* Testable, conventional, and wrong for
   this system: it protects only callers that go through the service, so direct SQL or a future
   client could still oversell.
2. *Splitting the difference* — validation in the service, decrement in a trigger. This is the
   worst option: the invariant is then enforced in neither place completely, and a reader has
   to check both to know what is guaranteed.

**Solution.** Keep the logic in the database and treat it as a deliberate architectural
decision with a written rationale (ADR-02), including its costs: the logic cannot be
unit-tested in isolation, it is split across two languages, and migrations become coupled to
logic changes. The compensating measure is integration tests against a real PostgreSQL
instance, plus an explicit note in the coverage report explaining why JavaScript line coverage
understates what is tested.

---

## C-03 · Seven days to the mid-semester deadline with no implementation started

**When:** 2026-09-26 · **Status:** Open — tracked as risk R-01

**Challenge.** Version control for the project began on 2026-09-26; the deadline is
2026-10-03. Eight implementation phases are outstanding and the plan has no slack.

**Attempted and rejected.** Building breadth first — several screens partially working — in
the hope that the evaluation credits visible surface area. The handout is explicit that it
wants *at least one working end-to-end feature*, so breadth without depth scores worse than
one complete path.

**Solution so far.** Fix the end-to-end path (register → search → book → view booking) as
non-negotiable, and decide the scope-reduction order in advance (`project_plan.md` §5) so that
a slip is absorbed by dropping known items rather than by improvising on the final evening.
Daily exit conditions make a slip visible on the day it occurs. *To be updated with the actual
outcome.*

---

## C-04 · Design artifacts that must precede the code they describe

**When:** 2026-09-26 · **Status:** Resolved

**Challenge.** The git history is submitted as process evidence. Wireframes and an SRS
committed *after* the implementation they describe are visibly retrofitted, and the compressed
schedule creates pressure to write code first and document later.

**Solution.** Phase 1 is done and committed before any schema or client file exists. The
wireframes are dated 2026-09-26 and precede every client commit; the SRS precedes the DDL. This
cost a day of the seven, which is accepted.

---

## Template for new entries

```
## C-nn · <short title>

**When:** YYYY-MM-DD · **Status:** Open | Resolved

**Challenge.** What went wrong or was hard, specifically.

**Attempted and rejected.** What was tried first and why it did not work.

**Solution.** What was done instead, and what it cost.
```
