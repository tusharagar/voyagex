# Concurrency Demonstration — two clients, one seat

**Traces to:** SRS FR-12, NFR-02 · `use_cases.md` UC-07 exception flow E2 · ADR-02, ADR-05
**Automated equivalent:** TC-C-01 (Phase 8)
**First verified:** 2026-09-26 against PostgreSQL 16.13

The automated test proves this behaviour on every run. This document shows it by hand in two
terminals, which is what to do in the viva — an examiner can watch the second session *stop*.

---

## What is being demonstrated

Two customers try to take the last seat on the same departure at the same moment. Exactly one
booking must exist afterwards, and `available_seats` must be `0` — never `-1`, never two
bookings.

The mechanism is `SELECT ... FOR UPDATE` inside `book_package` (`db/06_procedures.sql`). It
takes a row-level exclusive lock on the departure and holds it until commit. The second
transaction blocks on that lock; when it is released it **re-reads** the row under READ
COMMITTED, sees the seat count the winner left behind, and fails.

The visible proof is not the error message. It is that the second session *hangs* until the
first commits.

---

## Setup

```bash
./db/reset.sh          # 25 tables, triggers, procedures
```

Then create a departure with exactly one seat and two customers who each have a traveller:

```sql
INSERT INTO user_account (email, password_hash, role_id)
VALUES ('c1@test.local', '$2b$12$dummy', 1), ('c2@test.local', '$2b$12$dummy', 1);

INSERT INTO customer (user_id, first_name) VALUES (1, 'Rohan'), (2, 'Anjali');
INSERT INTO traveller (customer_id, full_name) VALUES (1, 'Rohan Mehta'), (2, 'Anjali Rao');

INSERT INTO package (title, duration_days) VALUES ('Manali Explorer', 6);

INSERT INTO departure (package_id, start_date, end_date, total_seats, available_seats, price)
VALUES (1, CURRENT_DATE + 90, CURRENT_DATE + 95, 1, 1, 24500)
RETURNING departure_id;          -- note the id; assumed to be 1 below
```

---

## The demonstration

Open two terminals, both `psql -d travel_tourism`.

### Terminal A — takes the seat and holds the lock

```sql
BEGIN;
SELECT book_package(1, 1, ARRAY[1]);   -- customer 1, departure 1, traveller 1
```

It returns a `booking_id` immediately. **Do not commit yet.** The lock on the departure row is
held open by this transaction.

### Terminal B — while A is still open

```sql
SELECT book_package(2, 1, ARRAY[2]);   -- customer 2, same departure
```

**This hangs.** Nothing is printed. Terminal B is blocked inside `SELECT ... FOR UPDATE`,
waiting for A's lock. Leave it hanging and look at it — that pause is the whole point.

While B waits, a third terminal can show the wait explicitly:

```sql
SELECT pid, state, wait_event_type, wait_event, left(query, 40) AS query
FROM pg_stat_activity
WHERE query LIKE '%book_package%' AND pid <> pg_backend_pid();
```

B appears with `wait_event_type = Lock`, `wait_event = transactionid`.

### Terminal A — commit

```sql
COMMIT;
```

### Terminal B — unblocks immediately and fails

```
ERROR:  INSUFFICIENT_SEATS: 1 seat(s) requested but 0 remain on departure 1
CONTEXT:  PL/pgSQL function book_package(integer,integer,integer[],integer) line 73 at RAISE
```

B did not fail because it was "too late" in wall-clock terms. It failed because, on waking, it
re-read the row and found the seat gone.

### Confirm the outcome

```sql
SELECT available_seats, status FROM departure WHERE departure_id = 1;
--  available_seats | status
-- -----------------+--------
--                0 | FULL

SELECT count(*) FROM booking WHERE departure_id = 1;
--  1
```

---

## Scripted version (verified run)

The same thing without manual timing. Terminal A holds the lock for three seconds; B starts one
second in.

```bash
cat > /tmp/t1.sql <<'SQL'
BEGIN;
SELECT book_package(1, 1, ARRAY[1]);
SELECT pg_sleep(3);
COMMIT;
SQL

psql -d travel_tourism -f /tmp/t1.sql &
sleep 1
time psql -d travel_tourism -c "SELECT book_package(2, 1, ARRAY[2]);"
```

Observed on 2026-09-26:

```
 t1_booking_id
---------------
            11

ERROR:  INSUFFICIENT_SEATS: 1 seat(s) requested but 0 remain on departure 9

T2 wall time: 2.05s
 available_seats | status
-----------------+--------
               0 | FULL

 bookings_on_contended_departure
---------------------------------
                               1
```

**The 2.05 s is the evidence.** B was launched one second after A, and A held the lock for
three; B therefore waited about two seconds. A version without the lock would have returned in
milliseconds — with a second booking.

---

## The backstop, for a client that never calls the procedure

`book_package` is where the *decision* is made. It is not the only protection. A writer that
bypasses the procedure entirely still cannot oversell, because the seat trigger's `UPDATE` is
checked by a table constraint:

```sql
INSERT INTO booking (customer_id, departure_id, num_travellers, total_amount, status)
VALUES (2, 1, 1, 24500, 'CONFIRMED');
```

```
ERROR:  new row for relation "departure" violates check constraint "chk_departure_seats_non_negative"
DETAIL:  Failing row contains (1, 1, ..., 1, -1, 24500.00, FULL).
CONTEXT:  SQL statement "UPDATE departure ..."
```

`available_seats` is still `0` afterwards. This is the concrete payoff of ADR-02: the invariant
holds for *every* writer — the API, a `psql` session, the seed script, a future mobile backend —
not only for callers that go through the service layer.

---

## What would break it

Worth being able to answer, because "it works" is less convincing than "here is how it fails":

| Change | Consequence |
|---|---|
| Drop `FOR UPDATE` from the `SELECT` | Both transactions read `1`, both insert, seats go to `-1`, and only `chk_departure_seats_non_negative` catches it — as a constraint violation rather than a clean `INSUFFICIENT_SEATS` |
| Derive `available_seats` with an aggregate instead of storing it | There is no single row to lock, so there is nothing for `FOR UPDATE` to hold (this is exactly why ADR-05 stores it) |
| Check seats in Node before calling the procedure | The check and the decrement land in different transactions, reopening the race the lock closes |
| Run the check and insert in autocommit | The lock is released at the end of the `SELECT`, not at commit, so the window reopens |

---

## Note on isolation level

This works under PostgreSQL's default READ COMMITTED because `FOR UPDATE` re-reads the row
after acquiring the lock. It does not depend on SERIALIZABLE, and so it does not need the retry
loops that serialisation failures would force on every caller.
