#!/usr/bin/env python3
"""
VoyageX — deterministic seed data generator.

Phase 3 of docs/project_plan.md · SRS assumption A-03 · brief §11 row counts.

    ./db/reset.sh --seed        rebuild, then seed
    python3 db/seed.py          seed an already-built schema

WHY THIS SCRIPT DOES NOT COMPUTE SEAT COUNTS
--------------------------------------------
Bookings are inserted with status CONFIRMED and then transitioned to their
final status with an UPDATE. That is not a detail of convenience: it means
`departure.available_seats` is maintained by trg_booking_seats — the same
trigger the application uses — rather than by arithmetic in Python that could
silently disagree with it. The transitions also produce genuine booking_audit
rows, so the audit trail in the seeded database is real history rather than
fabricated rows.

The script tracks remaining capacity only to decide what it may book. The
database remains the authority on what was actually taken, and §7 verifies the
two agree.

WHY CANCELLATIONS ARE NOT RANDOM
--------------------------------
The ML component (Phase 12) predicts cancellation. If cancellations were drawn
uniformly there would be no signal to find, and a model reporting high accuracy
on such data would be reporting nothing. Each booking's cancellation
probability is therefore a logistic function of plausible drivers — unpaid
balance, long lead time, the customer's own history, off-season travel — plus
Gaussian noise so the relationship is learnable but not separable. A model that
scores 0.99 here would mean the data was trivial; 0.75-0.85 is the target.

The intercept is calibrated numerically so the expected count matches the
target rather than being guessed (see calibrate_intercept).

DETERMINISM
-----------
One seed drives Python's RNG and Faker. The same seed produces byte-identical
data on every machine, so figures quoted in the report reproduce on the
examiner's machine. Override with SEED_RANDOM_SEED in .env.

DEVIATION FROM THE BRIEF, recorded deliberately
-----------------------------------------------
The brief specifies departures over 2024-01 to 2026-12. Today is late September
2026, which would leave barely three months of bookable future departures — too
few for the end-to-end booking demo or for the at-risk list. The range is
extended to 2027-06 so that roughly a fifth of departures are still in the
future and bookable. It stops there rather than running to 2027-12 because a
booking must be dated before today and within a plausible lead time, so
departures much beyond mid-2027 could never receive one. Row counts are
unchanged.
"""

from __future__ import annotations

import math
import os
import random
import sys
from datetime import date, datetime, timedelta

try:
    import psycopg2
    import psycopg2.extras
    from faker import Faker
except ImportError as exc:                                    # pragma: no cover
    sys.exit(f"missing dependency: {exc}\n  pip install -r db/requirements.txt")


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

SEED = int(os.environ.get("SEED_RANDOM_SEED", "20260926"))

TARGETS = {
    "destination":  40,
    "package":      25,
    "departure":   300,
    "customer":    400,
    "traveller":   900,
    "booking":    1200,
    "cancellation": 180,
    "hotel":        80,
    "guide":        30,
    "review":      600,
}

DEPARTURE_FIRST = date(2024, 1, 1)
DEPARTURE_LAST  = date(2027, 6, 30)

# Demonstration accounts. These are dummy credentials for a local database and
# are documented in the README; the hash below is bcrypt of "voyagex-demo".
DEMO_PASSWORD_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.hK9m"

CATEGORIES = ["Hill", "Beach", "Heritage", "Pilgrimage", "Wildlife", "Urban"]
PEAK_MONTHS = {3, 4, 5, 6, 10, 11, 12}
TIME_SLOTS = ["Morning", "Afternoon", "Evening"]

# Gaussian noise added to each booking's cancellation log-odds. This is the dial
# that sets how hard the Phase 12 learning task is: too little and a model
# scores 0.99 and proves nothing, too much and there is no signal to find.
# Tuned against a held-out logistic regression and random forest to land
# ROC-AUC in the 0.75-0.85 band the brief asks for.
NOISE_SIGMA = 0.45

rng = random.Random(SEED)
fake = Faker("en_IN")
Faker.seed(SEED)

TODAY = date.today()


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


# --------------------------------------------------------------------------
# Cancellation model
# --------------------------------------------------------------------------

def cancel_logit(intercept: float, f: dict) -> float:
    """Log-odds that a booking is cancelled, from features a real agency would
    recognise. Coefficients are chosen for plausibility, not fitted to data."""
    return (
        intercept
        + 2.60 * (1.0 - f["paid_ratio"])            # money not yet committed
        + 1.10 * (f["lead_days"] > 120)             # booked far ahead
        + 2.40 * f["prior_cancel_rate"]             # this customer's habit
        + 0.70 * (not f["is_peak"])                 # off-season trips get dropped
        + 0.35 * (f["num_travellers"] >= 4)         # groups are harder to keep together
        + 0.40 * f["booked_online"]                 # less commitment than a counter visit
        + f["noise"]
    )


def calibrate(count_for, target_count: int) -> float:
    """Bisect for the intercept at which count_for(intercept) hits the target.

    Guessing an intercept and hoping the count lands near the brief's 180 would
    make the row count depend on the coefficients; solving for it keeps the two
    independent. count_for must be deterministic in its argument, which is why
    the per-booking uniform draws are made once, up front, rather than inside.
    """
    lo, hi = -14.0, 6.0
    for _ in range(50):
        mid = (lo + hi) / 2
        if count_for(mid) < target_count:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def refund_tier(days_left: int) -> float:
    """The same scale cancel_booking() applies in 06_procedures.sql. Duplicated
    here because the seed writes historical cancellations directly: the
    procedure computes its tier against CURRENT_DATE, which is correct for a
    live cancellation and wrong for one dated 2024."""
    if days_left > 30:
        return 1.00
    if days_left >= 15:
        return 0.50
    if days_left >= 7:
        return 0.25
    return 0.00


# --------------------------------------------------------------------------
# Reference data
# --------------------------------------------------------------------------

DESTINATION_POOL = [
    ("Manali", "Himachal Pradesh", "Hill"), ("Shimla", "Himachal Pradesh", "Hill"),
    ("Kasol", "Himachal Pradesh", "Hill"), ("Dharamshala", "Himachal Pradesh", "Hill"),
    ("Leh", "Ladakh", "Hill"), ("Nubra Valley", "Ladakh", "Hill"),
    ("Mussoorie", "Uttarakhand", "Hill"), ("Nainital", "Uttarakhand", "Hill"),
    ("Auli", "Uttarakhand", "Hill"), ("Darjeeling", "West Bengal", "Hill"),
    ("Gangtok", "Sikkim", "Hill"), ("Munnar", "Kerala", "Hill"),
    ("Ooty", "Tamil Nadu", "Hill"), ("Coorg", "Karnataka", "Hill"),
    ("Goa", "Goa", "Beach"), ("Gokarna", "Karnataka", "Beach"),
    ("Varkala", "Kerala", "Beach"), ("Kovalam", "Kerala", "Beach"),
    ("Havelock Island", "Andaman and Nicobar", "Beach"),
    ("Puri", "Odisha", "Beach"), ("Diu", "Daman and Diu", "Beach"),
    ("Jaipur", "Rajasthan", "Heritage"), ("Udaipur", "Rajasthan", "Heritage"),
    ("Jodhpur", "Rajasthan", "Heritage"), ("Jaisalmer", "Rajasthan", "Heritage"),
    ("Agra", "Uttar Pradesh", "Heritage"), ("Khajuraho", "Madhya Pradesh", "Heritage"),
    ("Hampi", "Karnataka", "Heritage"), ("Ajanta and Ellora", "Maharashtra", "Heritage"),
    ("Varanasi", "Uttar Pradesh", "Pilgrimage"), ("Rishikesh", "Uttarakhand", "Pilgrimage"),
    ("Haridwar", "Uttarakhand", "Pilgrimage"), ("Tirupati", "Andhra Pradesh", "Pilgrimage"),
    ("Amritsar", "Punjab", "Pilgrimage"), ("Bodh Gaya", "Bihar", "Pilgrimage"),
    ("Jim Corbett", "Uttarakhand", "Wildlife"), ("Ranthambore", "Rajasthan", "Wildlife"),
    ("Kaziranga", "Assam", "Wildlife"), ("Periyar", "Kerala", "Wildlife"),
    ("Mumbai", "Maharashtra", "Urban"),
]

SEASONS = ["October to March", "March to June", "November to February",
           "September to April", "Year round"]


def connect():
    dsn = {
        "host":     os.environ.get("PGHOST", "127.0.0.1"),
        "port":     os.environ.get("PGPORT", "5432"),
        "dbname":   os.environ.get("PGDATABASE", "travel_tourism"),
        "user":     os.environ.get("PGADMIN_USER", os.environ.get("PGUSER", "postgres")),
    }
    pw = os.environ.get("PGADMIN_PASSWORD") or os.environ.get("PGPASSWORD")
    if pw:
        dsn["password"] = pw
    return psycopg2.connect(**dsn)


def main() -> int:
    print(f"\nVoyageX seed · random seed {SEED}\n")
    conn = connect()
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("SELECT count(*) FROM booking")
    if cur.fetchone()[0] > 0:
        sys.exit("  database already contains bookings — run ./db/reset.sh first")

    # ---- 1. Branches, staff accounts -------------------------------------
    branches = []
    for city in ["Prayagraj", "Lucknow", "Delhi", "Mumbai", "Bengaluru"]:
        cur.execute(
            "INSERT INTO branch (branch_name, city, phone) VALUES (%s,%s,%s) RETURNING branch_id",
            (f"VoyageX {city}", city, fake.msisdn()[:10]))
        branches.append(cur.fetchone()[0])

    # One demonstration account per role, with predictable emails for the README.
    demo_users = {}
    for role_id, role_name, email in [
        (2, "AGENT",    "agent@example.test"),
        (3, "MANAGER",  "manager@example.test"),
        (4, "DB_ADMIN", "dbadmin@example.test"),
    ]:
        cur.execute(
            "INSERT INTO user_account (email, password_hash, role_id) VALUES (%s,%s,%s) "
            "RETURNING user_id", (email, DEMO_PASSWORD_HASH, role_id))
        demo_users[role_name] = cur.fetchone()[0]

    employees = []
    for i in range(12):
        uid = demo_users["AGENT"] if i == 0 else None
        if uid is None:
            cur.execute(
                "INSERT INTO user_account (email, password_hash, role_id) VALUES (%s,%s,%s) "
                "RETURNING user_id",
                (f"staff{i}@example.test", DEMO_PASSWORD_HASH, 2))
            uid = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO employee (user_id, branch_id, name, designation, phone, hire_date, salary) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING employee_id",
            (uid, rng.choice(branches), fake.name(),
             rng.choice(["Travel Consultant", "Senior Agent", "Branch Manager"]),
             fake.msisdn()[:10],
             TODAY - timedelta(days=rng.randint(200, 2500)),
             round(rng.uniform(25000, 90000), 2)))
        employees.append(cur.fetchone()[0])
    conn.commit()
    log(f"branches {len(branches)} · employees {len(employees)}")

    # ---- 2. Destinations, hotels, transport, guides ----------------------
    destinations = []
    for name, state, cat in DESTINATION_POOL[:TARGETS["destination"]]:
        cur.execute(
            "INSERT INTO destination (name, state, category, description, best_season) "
            "VALUES (%s,%s,%s,%s,%s) RETURNING destination_id",
            (name, state, cat, f"{name} in {state} — {cat.lower()} destination.",
             rng.choice(SEASONS)))
        destinations.append((cur.fetchone()[0], cat, name))

    hotels = []
    for i in range(TARGETS["hotel"]):
        did = rng.choice(destinations)[0]
        cur.execute(
            "INSERT INTO hotel (destination_id, name, star_rating, address, contact, price_per_night) "
            "VALUES (%s,%s,%s,%s,%s,%s) RETURNING hotel_id",
            (did, f"{fake.last_name()} {rng.choice(['Residency','Palace','Retreat','Inn','Grand'])}",
             rng.randint(2, 5), fake.address().replace("\n", ", ")[:200],
             fake.msisdn()[:10], round(rng.uniform(1200, 9000), 2)))
        hotels.append(cur.fetchone()[0])

    transports = []
    for _ in range(20):
        mode = rng.choice(["FLIGHT", "TRAIN", "BUS", "CAB"])
        cur.execute(
            "INSERT INTO transport (mode, operator_name, vehicle_no, capacity) "
            "VALUES (%s,%s,%s,%s) RETURNING transport_id",
            (mode, fake.company()[:60], fake.bothify("??-####").upper(),
             {"FLIGHT": 180, "TRAIN": 72, "BUS": 45, "CAB": 6}[mode]))
        transports.append(cur.fetchone()[0])

    guides = []
    for _ in range(TARGETS["guide"]):
        cur.execute(
            "INSERT INTO guide (name, phone, email, languages_spoken, experience_years, daily_rate) "
            "VALUES (%s,%s,%s,%s,%s,%s) RETURNING guide_id",
            (fake.name(), fake.msisdn()[:10], fake.email(),
             ", ".join(rng.sample(["Hindi", "English", "Bengali", "Tamil", "Marathi", "Ladakhi"], 2)),
             rng.randint(1, 20), round(rng.uniform(800, 3500), 2)))
        guides.append(cur.fetchone()[0])
    conn.commit()
    log(f"destinations {len(destinations)} · hotels {len(hotels)} · "
        f"transport {len(transports)} · guides {len(guides)}")

    # ---- 3. Packages, itineraries -----------------------------------------
    packages = []
    pd_rows = itin_rows = 0
    for _ in range(TARGETS["package"]):
        cat = rng.choice(CATEGORIES)
        days = rng.randint(3, 9)
        pool = [d for d in destinations if d[1] == cat] or destinations
        picked = rng.sample(pool, min(len(pool), rng.randint(3, 5)))
        # base_price is an indicative catalogue figure only; the price a
        # customer is charged is departure.price. It is set below from the
        # departures actually created, so the two can never disagree.
        cur.execute(
            "INSERT INTO package (title, description, duration_days, duration_nights, "
            "category, max_group_size) VALUES (%s,%s,%s,%s,%s,%s) RETURNING package_id",
            (f"{picked[0][2]} {rng.choice(['Explorer','Discovery','Trail','Escape','Circuit'])}",
             fake.paragraph(nb_sentences=3), days, days - 1, cat, rng.choice([12, 16, 18, 24, 30])))
        pid = cur.fetchone()[0]
        packages.append({"id": pid, "days": days, "category": cat,
                         "destinations": [d[0] for d in picked]})

        day = 1
        for dest_id, _cat, _name in picked:
            nights = max(1, days // len(picked))
            cur.execute(
                "INSERT INTO package_destination (package_id, destination_id, day_number, nights_stay) "
                "VALUES (%s,%s,%s,%s)", (pid, dest_id, day, nights))
            pd_rows += 1
            day = min(day + nights, days)

        for d in range(1, days + 1):
            for slot in rng.sample(TIME_SLOTS, rng.randint(1, 3)):
                cur.execute(
                    "INSERT INTO itinerary_activity (package_id, day_number, time_slot, title, description) "
                    "VALUES (%s,%s,%s,%s,%s)",
                    (pid, d, slot, fake.sentence(nb_words=4).rstrip("."), fake.sentence(nb_words=10)))
                itin_rows += 1
    conn.commit()
    log(f"packages {len(packages)} · package_destination {pd_rows} · itinerary_activity {itin_rows}")

    # ---- 4. Departures -----------------------------------------------------
    span = (DEPARTURE_LAST - DEPARTURE_FIRST).days
    departures, taken = [], set()
    while len(departures) < TARGETS["departure"]:
        pkg = rng.choice(packages)
        start = DEPARTURE_FIRST + timedelta(days=rng.randint(0, span))
        if (pkg["id"], start) in taken:            # uq_departure_package_start
            continue
        taken.add((pkg["id"], start))
        seats = rng.choice([15, 18, 20, 24, 30, 36])
        # Peak-season departures cost more: this is the seasonal price variation
        # query q14 looks for, and it is a genuine attribute of the departure.
        price = round(rng.uniform(8000, 45000) * (1.18 if start.month in PEAK_MONTHS else 1.0), 2)
        cur.execute(
            "INSERT INTO departure (package_id, start_date, end_date, total_seats, "
            "available_seats, price, status) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING departure_id",
            (pkg["id"], start, start + timedelta(days=pkg["days"] - 1), seats, seats, price,
             "SCHEDULED"))
        departures.append({"id": cur.fetchone()[0], "package": pkg, "start": start,
                           "end": start + timedelta(days=pkg["days"] - 1),
                           "seats": seats, "free": seats, "price": float(price)})
    conn.commit()
    future = sum(1 for d in departures if d["start"] > TODAY)
    log(f"departures {len(departures)} ({future} still in the future)")

    # base_price := the cheapest departure of that package, so the catalogue
    # "from" price is always consistent with something actually on sale.
    cur.execute("""
        UPDATE package p SET base_price = s.min_price
        FROM (SELECT package_id, min(price) AS min_price FROM departure GROUP BY package_id) s
        WHERE s.package_id = p.package_id""")
    conn.commit()

    # ---- 5. Customers and travellers --------------------------------------
    customers, travellers = [], {}
    for i in range(TARGETS["customer"]):
        first, last = fake.first_name(), fake.last_name()
        email = (f"customer@example.test" if i == 0
                 else f"{first}.{last}{i}@example.test".lower().replace(" ", ""))
        cur.execute(
            "INSERT INTO user_account (email, password_hash, role_id) VALUES (%s,%s,1) "
            "RETURNING user_id", (email, DEMO_PASSWORD_HASH))
        uid = cur.fetchone()[0]
        registered = TODAY - timedelta(days=rng.randint(30, 1100))
        cur.execute(
            "INSERT INTO customer (user_id, first_name, last_name, phone, address_line, city, "
            "state, pincode, date_of_birth, registered_on) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING customer_id",
            (uid, first, last, fake.msisdn()[:10], fake.street_address()[:160],
             fake.city()[:60], fake.state()[:60], f"{rng.randint(100000, 999999)}",
             fake.date_of_birth(minimum_age=21, maximum_age=70), registered))
        cid = cur.fetchone()[0]
        customers.append({"id": cid, "registered": registered})

        travellers[cid] = []
        for j in range(rng.choices([1, 2, 3, 4], weights=[20, 35, 28, 17])[0]):
            cur.execute(
                "INSERT INTO traveller (customer_id, full_name, gender, date_of_birth, "
                "passport_no, relation_to_customer) VALUES (%s,%s,%s,%s,%s,%s) RETURNING traveller_id",
                (cid, f"{first} {last}" if j == 0 else fake.name(),
                 rng.choice(["M", "F", "O"]),
                 fake.date_of_birth(minimum_age=2, maximum_age=75),
                 fake.bothify("?#######").upper() if rng.random() < 0.4 else None,
                 "Self" if j == 0 else rng.choice(["Spouse", "Child", "Parent", "Sibling", "Friend"])))
            travellers[cid].append(cur.fetchone()[0])
    conn.commit()
    total_travellers = sum(len(v) for v in travellers.values())
    log(f"customers {len(customers)} · travellers {total_travellers}")

    # ---- 6. Bookings ------------------------------------------------------
    # Plan every booking first, so the cancellation intercept can be calibrated
    # over the whole population before a single row is written.
    plans = []
    attempts = 0
    max_attempts = TARGETS["booking"] * 60
    while len(plans) < TARGETS["booking"] and attempts < max_attempts:
        attempts += 1
        dep = rng.choice(departures)
        cust = rng.choice(customers)
        party = travellers[cust["id"]]
        n = len(party) if rng.random() < 0.7 else rng.randint(1, len(party))
        if dep["free"] < n:
            continue                                   # never attempt an oversell
        chosen = rng.sample(party, n)

        # A booking is dated before the departure, after the customer registered,
        # and never in the future. Departures more than ~14 months out therefore
        # have no valid booking date yet, and legitimately carry no bookings.
        earliest = max(cust["registered"], dep["start"] - timedelta(days=400))
        latest = min(dep["start"] - timedelta(days=1), TODAY)
        if latest <= earliest:
            continue
        booked_on = earliest + timedelta(days=rng.randint(0, (latest - earliest).days))

        r = rng.random()
        paid_ratio = 1.0 if r < 0.55 else 0.5 if r < 0.80 else 0.25 if r < 0.92 else 0.0
        online = rng.random() < 0.65

        dep["free"] -= n
        plans.append({
            "dep": dep, "cust": cust, "travellers": chosen, "n": n,
            "booked_on": booked_on, "paid_ratio": paid_ratio, "online": online,
            "total": round(dep["price"] * n, 2),
            # One uniform draw per booking, made now and reused for every
            # candidate intercept, so the calibration below is a deterministic
            # function of the intercept and bisection converges.
            "u": rng.random(),
            "features": {
                "paid_ratio": paid_ratio,
                "lead_days": (dep["start"] - booked_on).days,
                "is_peak": dep["start"].month in PEAK_MONTHS,
                "num_travellers": n,
                "booked_online": online,
                "noise": rng.gauss(0, NOISE_SIGMA),
            },
        })

    # A customer's cancellation history can only be known in booking order, so
    # decisions are simulated forward through time rather than drawn
    # independently. An earlier version read prior_cancel_rate during planning
    # while only updating it during writing, so the term was always zero and the
    # strongest intended driver contributed nothing — measured ROC-AUC was 0.59.
    plans.sort(key=lambda p: p["booked_on"])

    def simulate(intercept: float) -> list[bool]:
        history: dict[int, list[int]] = {}
        decisions = []
        for pl in plans:
            h = history.setdefault(pl["cust"]["id"], [0, 0])
            f = dict(pl["features"],
                     prior_cancel_rate=(h[1] / h[0]) if h[0] else 0.0)
            prob = 1.0 / (1.0 + math.exp(-cancel_logit(intercept, f)))
            cancelled = pl["u"] < prob
            decisions.append(cancelled)
            h[0] += 1
            if cancelled:
                h[1] += 1
        return decisions

    intercept = calibrate(lambda i: sum(simulate(i)), TARGETS["cancellation"])
    decisions = simulate(intercept)
    log(f"cancellation intercept calibrated to {intercept:.3f} — "
        f"{sum(decisions)} of {len(plans)} bookings cancel")

    n_booking = n_bt = n_pay = n_cancel = n_completed = 0
    completed_bookings = []
    for p, cancelled in zip(plans, decisions):
        dep, cust = p["dep"], p["cust"]

        # Inserted CONFIRMED so trg_booking_seats takes the seats. Everything
        # after this is a status transition, which is how the audit rows arise.
        cur.execute(
            "INSERT INTO booking (customer_id, departure_id, booked_by_employee_id, booking_date, "
            "num_travellers, total_amount, status, special_requests) "
            "VALUES (%s,%s,%s,%s,%s,%s,'CONFIRMED',%s) RETURNING booking_id",
            (cust["id"], dep["id"], None if p["online"] else rng.choice(employees),
             datetime.combine(p["booked_on"], datetime.min.time()),
             p["n"], p["total"],
             fake.sentence(nb_words=6) if rng.random() < 0.15 else None))
        bid = cur.fetchone()[0]
        n_booking += 1

        for t in p["travellers"]:
            cur.execute(
                "INSERT INTO booking_traveller (booking_id, traveller_id, seat_no) VALUES (%s,%s,%s)",
                (bid, t, f"{rng.randint(1,12)}{rng.choice('ABCD')}"))
            n_bt += 1

        paid = round(p["total"] * p["paid_ratio"], 2)
        if paid > 0:
            # Many customers pay in instalments, which is what the balance-due
            # view and the installment_no column exist to model. Splitting is
            # done so the parts sum exactly to `paid` — a rounding residue here
            # would put v_booking_summary permanently a rupee out.
            k_parts = rng.choices([1, 2, 3], weights=[55, 35, 10])[0]
            if k_parts == 1:
                parts = [paid]
            else:
                each = round(paid / k_parts, 2)
                parts = [each] * (k_parts - 1) + [round(paid - each * (k_parts - 1), 2)]
                parts = [x for x in parts if x > 0]
            for k, amt in enumerate(parts, start=1):
                cur.execute(
                    "INSERT INTO payment (booking_id, amount, payment_date, mode, transaction_ref, "
                    "status, installment_no) VALUES (%s,%s,%s,%s,%s,'SUCCESS',%s)",
                    (bid, amt,
                     datetime.combine(p["booked_on"] + timedelta(days=k - 1), datetime.min.time()),
                     rng.choice(["CARD", "UPI", "NETBANKING", "CASH"]),
                     f"TXN-{bid}-{k}", k))
                n_pay += 1
        else:
            cur.execute(
                "INSERT INTO payment (booking_id, amount, payment_date, status, installment_no) "
                "VALUES (%s,%s,%s,'PENDING',1)",
                (bid, p["total"], datetime.combine(p["booked_on"], datetime.min.time())))
            n_pay += 1

        if cancelled:
            # Cancelled some time between booking and departure.
            window = max(1, (dep["start"] - p["booked_on"]).days)
            cancelled_on = p["booked_on"] + timedelta(days=rng.randint(0, window - 1))
            days_left = (dep["start"] - cancelled_on).days
            pct = refund_tier(days_left)
            refund = round(paid * pct, 2)
            cur.execute(
                "INSERT INTO cancellation (booking_id, processed_by, cancelled_on, reason, "
                "refund_amount, penalty_amount) VALUES (%s,%s,%s,%s,%s,%s)",
                (bid, None if p["online"] else rng.choice(employees),
                 datetime.combine(cancelled_on, datetime.min.time()),
                 rng.choice(["Change of plans", "Medical reasons", "Work commitment",
                             "Found a better date", "Family emergency", "Visa delay"]),
                 refund, round(paid - refund, 2)))
            n_cancel += 1
            # The UPDATE restores the seats through the trigger and writes the
            # audit row; neither is done by hand here.
            cur.execute("UPDATE booking SET status='CANCELLED' WHERE booking_id=%s", (bid,))
            dep["free"] += p["n"]
            if refund > 0:
                cur.execute(
                    "INSERT INTO payment (booking_id, amount, payment_date, transaction_ref, "
                    "status, installment_no) VALUES (%s,%s,%s,%s,'REFUNDED',1)",
                    (bid, refund,
                     datetime.combine(cancelled_on + timedelta(days=3), datetime.min.time()),
                     f"REFUND-{bid}"))
                n_pay += 1
        elif dep["end"] < TODAY:
            # The trip happened. CONFIRMED -> COMPLETED keeps the seats taken,
            # which is correct: they were used.
            cur.execute("UPDATE booking SET status='COMPLETED' WHERE booking_id=%s", (bid,))
            n_completed += 1
            completed_bookings.append((bid, cust["id"], dep["package"]["destinations"],
                                       dep["end"]))
    conn.commit()
    log(f"bookings {n_booking} · booking_traveller {n_bt} · payments {n_pay} · "
        f"cancellations {n_cancel} ({100*n_cancel/max(n_booking,1):.1f}%) · completed {n_completed}")

    # ---- 7. Hotel stays and transport legs --------------------------------
    n_stay = n_leg = 0
    cur.execute("SELECT booking_id, departure_id FROM booking WHERE status <> 'CANCELLED'")
    for bid, did in cur.fetchall():
        if rng.random() < 0.45:
            dep = next(d for d in departures if d["id"] == did)
            nights = max(1, (dep["end"] - dep["start"]).days)
            cur.execute(
                "INSERT INTO booking_hotel_stay (booking_id, hotel_id, check_in, check_out, "
                "room_type, num_rooms, cost) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (bid, rng.choice(hotels), dep["start"], dep["start"] + timedelta(days=nights),
                 rng.choice(["Standard", "Deluxe", "Suite"]), rng.randint(1, 3),
                 round(rng.uniform(3000, 30000), 2)))
            n_stay += 1
        if rng.random() < 0.35:
            dep = next(d for d in departures if d["id"] == did)
            depart = datetime.combine(dep["start"], datetime.min.time()) + timedelta(hours=rng.randint(5, 20))
            cur.execute(
                "INSERT INTO booking_transport_leg (booking_id, transport_id, from_location, "
                "to_location, depart_time, arrive_time, cost) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (bid, rng.choice(transports), fake.city()[:60], fake.city()[:60],
                 depart, depart + timedelta(hours=rng.randint(2, 14)),
                 round(rng.uniform(600, 9000), 2)))
            n_leg += 1
    conn.commit()
    log(f"hotel stays {n_stay} · transport legs {n_leg}")

    # ---- 8. Guide assignments ---------------------------------------------
    # trg_guide_no_overlap rejects overlapping assignments, so each guide's
    # departures are walked in date order and only non-overlapping ones taken.
    # The trigger is the authority; this just avoids provoking it.
    n_assign = 0
    by_date = sorted(departures, key=lambda d: d["start"])
    guide_free_from = {g: date(1900, 1, 1) for g in guides}
    for dep in by_date:
        for g in rng.sample(guides, len(guides)):
            if guide_free_from[g] < dep["start"]:
                cur.execute(
                    "INSERT INTO guide_assignment (guide_id, departure_id, assigned_on, fee) "
                    "VALUES (%s,%s,%s,%s)",
                    (g, dep["id"], dep["start"] - timedelta(days=rng.randint(5, 40)),
                     round(rng.uniform(2000, 15000), 2)))
                guide_free_from[g] = dep["end"] + timedelta(days=1)
                n_assign += 1
                break
    conn.commit()
    log(f"guide assignments {n_assign}")

    # ---- 9. Reviews --------------------------------------------------------
    # trg_review_valid requires a COMPLETED booking and the booking's own
    # customer. customer_id is left NULL so the trigger fills it, which also
    # exercises that path.
    n_review = 0
    for bid, cid, dests, ended in rng.sample(completed_bookings,
                                             min(TARGETS["review"], len(completed_bookings))):
        rating = rng.choices([5, 4, 3, 2, 1], weights=[38, 32, 18, 8, 4])[0]
        cur.execute(
            "INSERT INTO review (booking_id, destination_id, rating, comment, review_date) "
            "VALUES (%s,%s,%s,%s,%s)",
            (bid, rng.choice(dests), rating,
             fake.sentence(nb_words=12) if rng.random() < 0.8 else None,
             datetime.combine(ended + timedelta(days=rng.randint(1, 21)), datetime.min.time())))
        n_review += 1
    conn.commit()
    log(f"reviews {n_review}")

    # ---- 10. Verify the database agrees with us ---------------------------
    # The script tracked capacity to decide what to book; the trigger decided
    # what was actually taken. If those two ever disagree, the seat logic is
    # wrong and everything downstream is built on sand — so it is checked
    # rather than assumed.
    cur.execute("""
        SELECT count(*) FROM departure d
        WHERE d.available_seats <> d.total_seats - COALESCE((
            SELECT sum(b.num_travellers) FROM booking b
            WHERE b.departure_id = d.departure_id
              AND b.status IN ('CONFIRMED','COMPLETED')), 0)""")
    drift = cur.fetchone()[0]
    if drift:
        conn.rollback()
        sys.exit(f"  FAILED: {drift} departures have available_seats inconsistent with their bookings")

    cur.execute("SELECT count(*) FROM booking_audit")
    audit_rows = cur.fetchone()[0]

    print()
    log(f"seat consistency verified across all {len(departures)} departures")
    log(f"booking_audit holds {audit_rows} rows, all written by trigger")
    print(f"\n  seeded deterministically with SEED_RANDOM_SEED={SEED}\n")

    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
