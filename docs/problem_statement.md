# Problem Statement, Objectives and Stakeholders

**Project:** VoyageX — Travel and Tourism Management System
**Courses:** Database Management Systems (project topic 10) · Software Engineering and Project Management
**Institution:** MNNIT Allahabad, B.Tech CSE, 3rd year
**Document status:** Baselined 2026-09-26 · feeds report sections 2, 3 and 5

---

## 1. Problem statement

A mid-sized travel agency sells multi-day tour packages. Each package is offered several times
a year on fixed dates, and each of those offerings has its own price and its own fixed number
of seats. Customers book online; walk-in customers are booked by counter agents; managers need
to know which departures are selling and which are not.

Agencies of this size typically run on spreadsheets, a shared inbox and a desk diary. That
arrangement fails in four specific ways, and those four failures are what this project exists
to fix.

**1. Overselling.** Seat counts live in a spreadsheet that two people can edit at once. When a
counter agent and an online customer take the last seat within the same minute, both bookings
are accepted. The agency discovers the conflict only when the coach is full. There is no
single place where "is there a seat left?" and "take the seat" happen as one indivisible step.

**2. Price and availability anomalies.** Because there is no separation between *a package* and
*one dated running of that package*, the price of a package is stored once. Changing the
October price silently changes what the June customers appear to have paid, and the same
package cannot be sold twice on different dates without duplicating the whole itinerary row.

**3. No enforced audit trail.** A booking's status changes from pending to confirmed to
cancelled, with a refund attached. Who changed it, when, and from what, is recorded only if
someone remembers to write it down. Refund disputes cannot be settled from records.

**4. Uncontrolled access.** Everyone who can open the spreadsheet can delete from it. There is
no technical distinction between a counter agent, who should be able to create a booking, and a
manager, who should be able to see salaries and revenue. The distinction exists only as an
instruction people are trusted to follow.

Reactive cancellations compound all four. Cancellations arrive without warning, seats are
released too late to resell, and the agency has no way to tell which of its confirmed bookings
are likely to evaporate.

## 2. Motivation

Each of the four failures above is a textbook database problem with a textbook database answer,
which is why this domain was chosen for a DBMS project:

| Failure | Database mechanism that addresses it |
|---|---|
| Overselling | Row-level locking (`SELECT … FOR UPDATE`) inside a stored procedure, with a `CHECK` constraint as backstop |
| Price/availability anomalies | Correct normalization — separating `package` (template) from `departure` (dated, priced, seat-limited instance) |
| No audit trail | A trigger that the application cannot bypass, writing to an append-only audit table |
| Uncontrolled access | PostgreSQL roles and `GRANT`s, enforced by the database rather than by application code |

The fifth problem, unpredictable cancellations, is not a database problem. It is a prediction
problem, and it is what the machine-learning component of the project addresses: score each
confirmed booking for cancellation risk using features computed live from the database, so that
at-risk seats can be re-marketed before they are lost.

The motivation is therefore not "build a booking website". It is to demonstrate that these
specific guarantees are enforceable at the data layer, and to make that enforcement *visible* —
which is why every screen in the system shows the SQL it executed.

## 3. Project objectives

Objectives are numbered `OBJ-nn` and are traced from in the SRS.

| ID | Objective | Measure of achievement |
|---|---|---|
| OBJ-01 | Model the travel-agency domain as a normalized relational schema in 3NF/BCNF, with the package/departure separation as its central design decision | 25 tables build from empty with zero errors; normalization documented with functional dependencies and a worked decomposition |
| OBJ-02 | Make concurrent seat allocation provably safe | An automated test in which two clients contend for one seat: exactly one succeeds, seats end at zero |
| OBJ-03 | Enforce business rules inside the database rather than the application | Seat decrement, audit logging and guide double-booking are triggers/procedures; tests confirm they fire without application involvement |
| OBJ-04 | Enforce access control at the database level | Five PostgreSQL roles; `app_agent` attempting `DELETE FROM booking` is refused by PostgreSQL with SQLSTATE 42501, not by middleware |
| OBJ-05 | Deliver a web front end covering insert, search, update, delete and reporting | All five operation types reachable from the UI; each displays the SQL executed, its parameters, row count and timing |
| OBJ-06 | Make the database self-describing to the user | ER diagram generated at runtime from `information_schema`, so it cannot drift from the live schema |
| OBJ-07 | Integrate one meaningful ML task with the database and the UI | Cancellation-risk classifier trained on seeded data, features read live from SQL at prediction time, risk surfaced in the agent dashboard |
| OBJ-08 | Apply and evidence software-engineering practice | SRS with traceability matrix, use cases, architecture with recorded decisions, UML, wireframes preceding implementation, automated test suite, project plan with actuals |
| OBJ-09 | Deliver a verifiable mid-semester increment by 2026-10-03 | Register → search → book → view booking works end to end, with SQL visible at each step |

## 4. Scope summary

The full scope statement with exclusions lives in [`SRS.md` §2.6](SRS.md) and feeds report
section 4. In brief:

- **In scope:** catalogue and itinerary management, dated departures with seat inventory,
  customer and traveller records, booking and cancellation with refund tiering, payment
  recording, reviews, agent and manager workflows, role-based access control, SQL transparency
  and schema viewing, audited SQL consoles, cancellation-risk prediction.
- **Out of scope:** real payment-gateway integration, notifications, multi-currency, a mobile
  application, live hotel/airline inventory, multi-agency tenancy, production deployment.
- **Key constraints:** PostgreSQL 16 only, no ORM, localhost-only, seeded rather than live data.

## 5. Stakeholder identification

Stakeholders are wider than the four system user classes. Only the first four hold accounts;
the rest have interests the design must respect without logging in.

| # | Stakeholder | Interest in the system | Influence on requirements | How the design serves them |
|---|---|---|---|---|
| S-01 | **Customer** (traveller/booker) | Find a suitable package, see whether seats remain, book for a group, pay, cancel with a fair refund, review | High — primary actor for the end-to-end feature | Catalogue search, live availability, multi-traveller booking, transparent refund tiers, one review per completed booking |
| S-02 | **Counter agent** | Book on behalf of walk-in customers, take payments, process cancellations, see which bookings are at risk | High | `booked_by_employee_id` nullable FK distinguishes agent from self-service; agent dashboard; at-risk column |
| S-03 | **Branch/operations manager** | Revenue by destination and quarter, occupancy per departure, cancellation rates, repeat customers, staff and guide allocation | High — owns the reporting requirements | Manager reports, 15 showcase queries, views, audit-log visibility |
| S-04 | **Database administrator** | Inspect and repair data, verify integrity, audit privileged activity | Medium | `app_dbadmin` role (deliberately not superuser), preview/commit admin console, `admin_query_log` |
| S-05 | **Tour guide** | Not be double-booked across overlapping departures; be paid per assignment | Medium — source of a hard business rule | `guide_assignment` with an overlap-preventing trigger and a uniqueness constraint |
| S-06 | **Hotel and transport operators** | Accurate room and seat counts per booking | Low — represented as reference data | `booking_hotel_stay`, `booking_transport_leg`; live inventory explicitly out of scope |
| S-07 | **Agency owner** | The agency does not oversell, does not lose refund disputes, and can see where revenue comes from | Medium — source of the integrity and audit objectives | OBJ-02, OBJ-03, OBJ-04 and the audit trigger exist for this stakeholder |
| S-08 | **Course instructors and evaluators** (DBMS and SEPM) | Assess database depth, engineering process, and each member's individual contribution | High — a real constraint on deliverables, not a courtesy entry | SQL visible on every screen, live ER viewer, per-module contribution split, generated test-case table, git history as evidence |
| S-09 | **Project team members** | Own a separable module each, be able to explain it in the viva and video | High | Contribution record allocates modules by member; see `contribution_record.md` |

Stakeholders S-01 through S-04 map one-to-one onto the system's user classes and onto the four
database roles (`app_customer`, `app_agent`, `app_manager`, `app_dbadmin`); that mapping is set
out in SRS §2.3.

## 6. Success criteria for the mid-semester evaluation

The project is not required to be complete on 2026-10-03. It is required to show 40–60%
progress with at least one working end-to-end feature. For this project that feature is
**register → search packages → book a departure → view the booking**, with the executed SQL
displayed at every step, and with the concurrency guarantee (OBJ-02) demonstrated by a passing
automated test.

---

*Team, section and group details are recorded in `contribution_record.md` and on the report
cover page; they are pending at the time of this baseline.*
