-- =============================================================================
-- VoyageX — tests/fixtures/sample_data.sql
--
-- A small, fully predictable dataset for the automated test suite (Phase 8) and
-- for the "sample input or test data" the SEPM submission requires.
--
--   ./db/reset.sh --test
--   psql -d travel_test -f tests/fixtures/sample_data.sql
--
-- WHY THIS EXISTS ALONGSIDE db/seed.py
--   seed.py produces 1200 realistic bookings for reports and for training the
--   cancellation model. Tests need the opposite: a handful of rows whose ids and
--   values are known at the point the assertion is written, so a test can say
--   "departure 3 has exactly one seat" without querying for it first.
--
--   Every id below is fixed explicitly rather than left to a sequence, and the
--   sequences are advanced at the end so that rows created BY the tests do not
--   collide with these.
--
-- WHAT IS DELIBERATELY SET UP HERE
--   departure 3 has exactly ONE seat    -> the concurrency test (TC-C-01)
--   departure 4 is already FULL          -> the sold-out path
--   departure 5 is in the past           -> reviews and DEPARTURE_COMPLETED
--   customer 1 owns travellers 1-3, customer 2 owns traveller 4
--                                        -> the TRAVELLER_NOT_OWNED path
--   booking 1 is COMPLETED and unreviewed-> trg_review_valid happy path
--   booking 2 is CONFIRMED, part paid    -> balance-due arithmetic
--
-- Seat counts below are stated as the values that hold AFTER the triggers have
-- run on the bookings inserted here. The final block asserts that, so a change
-- to the seat trigger that breaks this fixture fails loudly here rather than
-- confusing a test three files away.
-- =============================================================================

BEGIN;

-- role rows are created by 01_schema.sql: 1 CUSTOMER, 2 AGENT, 3 MANAGER, 4 DB_ADMIN

-- ---- accounts -------------------------------------------------------------
-- password_hash is bcrypt of "voyagex-demo"; a dummy value for a local test
-- database, never a real credential.
INSERT INTO user_account (user_id, email, password_hash, role_id) VALUES
  (1, 'alice@example.test',   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.hK9m', 1),
  (2, 'bob@example.test',     '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.hK9m', 1),
  (3, 'agent@example.test',   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.hK9m', 2),
  (4, 'manager@example.test', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.hK9m', 3);

INSERT INTO branch (branch_id, branch_name, city, phone) VALUES
  (1, 'VoyageX Prayagraj', 'Prayagraj', '9876500001');

INSERT INTO employee (employee_id, user_id, branch_id, name, designation, hire_date, salary) VALUES
  (1, 3, 1, 'Agent Anita', 'Travel Consultant', DATE '2024-02-01', 42000.00);

-- ---- customers and travellers ---------------------------------------------
-- customer 3 has NO user account: the walk-in case that makes customer.user_id
-- nullable-and-unique meaningful.
INSERT INTO customer (customer_id, user_id, first_name, last_name, phone, city, pincode, registered_on) VALUES
  (1, 1, 'Alice', 'Mehta', '9876500011', 'Prayagraj', '211004', TIMESTAMPTZ '2025-01-15 10:00+00'),
  (2, 2, 'Bob',   'Rao',   '9876500012', 'Lucknow',   '226001', TIMESTAMPTZ '2025-03-20 10:00+00'),
  (3, NULL, 'Walk', 'In',  '9876500013', 'Prayagraj', '211004', TIMESTAMPTZ '2025-06-01 10:00+00');

INSERT INTO traveller (traveller_id, customer_id, full_name, gender, date_of_birth, relation_to_customer) VALUES
  (1, 1, 'Alice Mehta',  'F', DATE '1996-04-12', 'Self'),
  (2, 1, 'Arjun Mehta',  'M', DATE '1994-08-30', 'Spouse'),
  (3, 1, 'Ananya Mehta', 'F', DATE '2018-02-11', 'Child'),
  (4, 2, 'Bob Rao',      'M', DATE '1990-11-05', 'Self'),
  (5, 3, 'Walk In',      'O', DATE '1988-07-19', 'Self');

-- ---- catalogue -------------------------------------------------------------
INSERT INTO destination (destination_id, name, state, category, best_season) VALUES
  (1, 'Manali', 'Himachal Pradesh', 'Hill',     'October to March'),
  (2, 'Jaipur', 'Rajasthan',        'Heritage', 'November to February');

INSERT INTO package (package_id, title, description, duration_days, duration_nights, category, max_group_size) VALUES
  (1, 'Manali Explorer',  'Six days in the Kullu valley.', 6, 5, 'Hill',     18),
  (2, 'Jaipur Heritage',  'Forts and old city walks.',      4, 3, 'Heritage', 24);

-- Package 1 revisits Manali on day 6: the case the three-column primary key on
-- package_destination exists for.
INSERT INTO package_destination (package_id, destination_id, day_number, nights_stay) VALUES
  (1, 1, 1, 4),
  (1, 1, 6, 1),
  (2, 2, 1, 3);

INSERT INTO itinerary_activity (package_id, day_number, time_slot, title) VALUES
  (1, 1, 'Morning',   'Arrive and transfer to hotel'),
  (1, 1, 'Evening',   'Mall Road walk'),
  (1, 2, 'Morning',   'Solang Valley excursion'),
  (2, 1, 'Morning',   'Amber Fort');

INSERT INTO hotel (hotel_id, destination_id, name, star_rating, contact, price_per_night) VALUES
  (1, 1, 'Snow Ridge Retreat', 4, '9876500021', 4500.00),
  (2, 2, 'Pink City Residency', 3, '9876500022', 3200.00);

INSERT INTO transport (transport_id, mode, operator_name, vehicle_no, capacity) VALUES
  (1, 'BUS', 'Himalayan Roadways', 'HP-1042', 45);

INSERT INTO guide (guide_id, name, phone, languages_spoken, experience_years, daily_rate) VALUES
  (1, 'Karan Singh', '9876500031', 'Hindi, English', 8, 2200.00),
  (2, 'Meera Iyer',  '9876500032', 'Tamil, English', 5, 1900.00);

-- ---- departures ------------------------------------------------------------
-- available_seats is written here as the count BEFORE the bookings below; the
-- seat trigger reduces it as those bookings are inserted.
INSERT INTO departure (departure_id, package_id, start_date, end_date, total_seats, available_seats, price, status) VALUES
  -- 1: plenty of room, well in the future  -> general booking tests
  (1, 1, CURRENT_DATE + 60, CURRENT_DATE + 65, 20, 20, 25000.00, 'SCHEDULED'),
  -- 2: 40 days out -> the 100% refund tier boundary (> 30 days)
  (2, 1, CURRENT_DATE + 40, CURRENT_DATE + 45, 10, 10, 20000.00, 'SCHEDULED'),
  -- 3: EXACTLY ONE SEAT -> the concurrency test contends for this row
  (3, 2, CURRENT_DATE + 90, CURRENT_DATE + 93,  1,  1, 15000.00, 'SCHEDULED'),
  -- 4: already sold out
  (4, 2, CURRENT_DATE + 30, CURRENT_DATE + 33, 12,  0, 18000.00, 'FULL'),
  -- 5: in the past -> reviews, COMPLETED bookings, DEPARTURE_COMPLETED
  (5, 1, CURRENT_DATE - 40, CURRENT_DATE - 35, 20, 18, 22000.00, 'COMPLETED');

-- Non-overlapping, so trg_guide_no_overlap accepts both.
INSERT INTO guide_assignment (assignment_id, guide_id, departure_id, fee) VALUES
  (1, 1, 1, 9000.00),
  (2, 2, 3, 6000.00);

-- ---- bookings --------------------------------------------------------------
-- Inserted CONFIRMED so trg_booking_seats performs the decrement, exactly as it
-- does in production. Booking 1 is then transitioned to COMPLETED, which leaves
-- the seats taken and writes a booking_audit row.
INSERT INTO booking (booking_id, customer_id, departure_id, booked_by_employee_id, booking_date, num_travellers, total_amount, status) VALUES
  (1, 1, 5, NULL, CURRENT_DATE - 70, 2, 44000.00, 'CONFIRMED'),   -- past trip
  (2, 1, 1, NULL, CURRENT_DATE - 10, 2, 50000.00, 'CONFIRMED'),   -- part paid
  (3, 2, 2, 1,    CURRENT_DATE -  5, 1, 20000.00, 'CONFIRMED');   -- booked by an agent

INSERT INTO booking_traveller (booking_id, traveller_id, seat_no) VALUES
  (1, 1, '1A'), (1, 2, '1B'),
  (2, 1, '3A'), (2, 2, '3B'),
  (3, 4, '5A');

UPDATE booking SET status = 'COMPLETED' WHERE booking_id = 1;

INSERT INTO payment (payment_id, booking_id, amount, payment_date, mode, transaction_ref, status, installment_no) VALUES
  (1, 1, 44000.00, CURRENT_DATE - 70, 'UPI',  'TXN-F-1', 'SUCCESS', 1),  -- paid in full
  (2, 2, 20000.00, CURRENT_DATE - 10, 'CARD', 'TXN-F-2', 'SUCCESS', 1),  -- balance due 30000
  (3, 3, 20000.00, CURRENT_DATE -  5, NULL,   'TXN-F-3', 'PENDING', 1);  -- nothing paid yet

INSERT INTO booking_hotel_stay (stay_id, booking_id, hotel_id, check_in, check_out, room_type, num_rooms, cost) VALUES
  (1, 2, 1, CURRENT_DATE + 60, CURRENT_DATE + 65, 'Deluxe', 1, 22500.00);

INSERT INTO booking_transport_leg (leg_id, booking_id, transport_id, from_location, to_location, depart_time, arrive_time, cost) VALUES
  (1, 2, 1, 'Delhi', 'Manali',
      (CURRENT_DATE + 60)::timestamptz + INTERVAL '6 hours',
      (CURRENT_DATE + 60)::timestamptz + INTERVAL '20 hours', 1800.00);

-- Booking 1 is COMPLETED and deliberately left UNREVIEWED, so a test can insert
-- the first review and exercise trg_review_valid's happy path.

-- ---- keep sequences clear of the fixed ids ---------------------------------
-- Rows inserted BY a test must not collide with the ids above.
DO $$
BEGIN
    PERFORM setval('user_account_user_id_seq', (SELECT max(user_id) FROM user_account));
    PERFORM setval('branch_branch_id_seq', (SELECT max(branch_id) FROM branch));
    PERFORM setval('employee_employee_id_seq', (SELECT max(employee_id) FROM employee));
    PERFORM setval('customer_customer_id_seq', (SELECT max(customer_id) FROM customer));
    PERFORM setval('traveller_traveller_id_seq', (SELECT max(traveller_id) FROM traveller));
    PERFORM setval('destination_destination_id_seq', (SELECT max(destination_id) FROM destination));
    PERFORM setval('package_package_id_seq', (SELECT max(package_id) FROM package));
    PERFORM setval('hotel_hotel_id_seq', (SELECT max(hotel_id) FROM hotel));
    PERFORM setval('transport_transport_id_seq', (SELECT max(transport_id) FROM transport));
    PERFORM setval('guide_guide_id_seq', (SELECT max(guide_id) FROM guide));
    PERFORM setval('departure_departure_id_seq', (SELECT max(departure_id) FROM departure));
    PERFORM setval('guide_assignment_assignment_id_seq', (SELECT max(assignment_id) FROM guide_assignment));
    PERFORM setval('booking_booking_id_seq', (SELECT max(booking_id) FROM booking));
    PERFORM setval('payment_payment_id_seq', (SELECT max(payment_id) FROM payment));
    PERFORM setval('booking_hotel_stay_stay_id_seq', (SELECT max(stay_id) FROM booking_hotel_stay));
    PERFORM setval('booking_transport_leg_leg_id_seq', (SELECT max(leg_id) FROM booking_transport_leg));
END $$;

-- ---- assert the fixture is what the tests believe it is --------------------
DO $$
DECLARE d1 INT; d3 INT; d5 INT; bal NUMERIC; audits INT;
BEGIN
    SELECT available_seats INTO d1 FROM departure WHERE departure_id = 1;
    SELECT available_seats INTO d3 FROM departure WHERE departure_id = 3;
    SELECT available_seats INTO d5 FROM departure WHERE departure_id = 5;

    IF d1 <> 18 THEN RAISE EXCEPTION 'fixture: departure 1 should have 18 seats left, has %', d1; END IF;
    IF d3 <> 1  THEN RAISE EXCEPTION 'fixture: departure 3 must have exactly 1 seat, has %', d3; END IF;
    IF d5 <> 16 THEN RAISE EXCEPTION 'fixture: departure 5 should have 16 seats left, has %', d5; END IF;

    SELECT b.total_amount - COALESCE(sum(p.amount) FILTER (WHERE p.status = 'SUCCESS'), 0)
      INTO bal
      FROM booking b LEFT JOIN payment p ON p.booking_id = b.booking_id
     WHERE b.booking_id = 2
     GROUP BY b.total_amount;
    IF bal <> 30000.00 THEN RAISE EXCEPTION 'fixture: booking 2 balance should be 30000, is %', bal; END IF;

    SELECT count(*) INTO audits FROM booking_audit WHERE booking_id = 1;
    IF audits <> 1 THEN RAISE EXCEPTION 'fixture: booking 1 should have 1 audit row, has %', audits; END IF;

    RAISE NOTICE 'sample_data.sql loaded and verified';
END $$;

COMMIT;
