-- =============================================================================
-- VoyageX — Travel and Tourism Management System
-- 02_constraints.sql · Named CHECK and UNIQUE constraints
--
-- Phase 2 of docs/project_plan.md · traces to SRS NFR-09, FR-19, FR-11
-- Run after 01_schema.sql. ./db/reset.sh runs both in order.
--
-- WHY THESE ARE HERE AND NOT INLINE
--   1. Every constraint is NAMED. A violation then reports
--      "violates check constraint chk_departure_seats_non_negative" instead of
--      a generated name, which is readable in an API error, in a test assertion
--      and in a viva demonstration.
--   2. The rules a row must satisfy can be read in one place, separately from
--      the shape of the row.
--
-- WHAT THIS FILE IS FOR
--   These constraints are the last line of defence, not the first. zod validates
--   at the API boundary and the UI validates before that, but only the database
--   sees every writer: the API, a psql session, the seed script, a future mobile
--   backend. A rule that matters is enforced here (SRS NFR-09, ADR-02).
--
-- NAMING
--   chk_<table>_<rule>    CHECK constraint
--   uq_<table>_<columns>  UNIQUE constraint (candidate key)
--
-- NOTE ON CURRENT_DATE
--   PostgreSQL requires CHECK expressions to be IMMUTABLE, and CURRENT_DATE is
--   STABLE, so "date_of_birth must be in the past" cannot be a CHECK. Rules of
--   that kind are enforced in triggers or at the API boundary instead.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — CANDIDATE KEYS (UNIQUE)
--
-- Each of these is a candidate key: an attribute set that identifies a row as
-- surely as the primary key does. The DBMS course asks for candidate keys to be
-- identified; this section is where they are declared to the database rather
-- than only described in a document. docs/normalization.md lists them per table.
-- =============================================================================

-- Role names are the natural key; role_id is a surrogate.
ALTER TABLE role
    ADD CONSTRAINT uq_role_role_name UNIQUE (role_name);

-- Email is how a user identifies themselves at login, so it must be unique.
-- Registration relies on this constraint to reject a duplicate account rather
-- than on a prior SELECT, which would race between the check and the insert.
ALTER TABLE user_account
    ADD CONSTRAINT uq_user_account_email UNIQUE (email);

-- 1:1-optional. A customer record may exist without a login (a walk-in), but no
-- two customer records may share one account.
ALTER TABLE customer
    ADD CONSTRAINT uq_customer_user_id UNIQUE (user_id);

ALTER TABLE employee
    ADD CONSTRAINT uq_employee_user_id UNIQUE (user_id);

-- A package runs at most once on a given start date. This also prevents the
-- seed script and the catalogue-management screen from creating a duplicate
-- departure that would split one date's seat inventory across two rows.
ALTER TABLE departure
    ADD CONSTRAINT uq_departure_package_start UNIQUE (package_id, start_date);

-- The payment gateway's reference. Unique so that replaying a webhook or
-- double-submitting a payment form cannot record the same money twice.
ALTER TABLE payment
    ADD CONSTRAINT uq_payment_transaction_ref UNIQUE (transaction_ref);

-- THE constraint that makes cancellation 1:1-optional with booking, and the one
-- that makes "cancel twice" fail in the database (SRS FR-19, test TC-B-05).
-- cancel_booking() does not check whether a cancellation already exists; it
-- inserts, and lets this constraint abort the transaction. That is the point:
-- a check-then-insert in application code has a race between the two steps.
ALTER TABLE cancellation
    ADD CONSTRAINT uq_cancellation_booking_id UNIQUE (booking_id);

-- A guide is assigned to a departure at most once. Overlapping assignments to
-- DIFFERENT departures need cross-row date comparison and are handled by a
-- trigger in 05_triggers.sql (SRS FR-21).
ALTER TABLE guide_assignment
    ADD CONSTRAINT uq_guide_assignment_guide_departure UNIQUE (guide_id, departure_id);

-- "Only someone who actually booked may review, and only once" expressed as a
-- key rather than as application logic (SRS FR-20).
ALTER TABLE review
    ADD CONSTRAINT uq_review_booking_id UNIQUE (booking_id);


-- =============================================================================
-- SECTION 2 — ENUMERATED DOMAINS (CHECK ... IN)
--
-- Implemented as CHECK rather than as PostgreSQL ENUM types: adding a value to
-- an ENUM is a type-level migration, whereas these sets are business
-- vocabulary that may plausibly gain a member (a new destination category, a
-- new payment mode). A CHECK is also visible in information_schema, which the
-- schema viewer (SRS FR-25) reads.
-- =============================================================================

ALTER TABLE traveller
    ADD CONSTRAINT chk_traveller_gender
        CHECK (gender IN ('M', 'F', 'O'));

ALTER TABLE destination
    ADD CONSTRAINT chk_destination_category
        CHECK (category IN ('Hill', 'Beach', 'Heritage', 'Pilgrimage', 'Wildlife', 'Urban'));

ALTER TABLE transport
    ADD CONSTRAINT chk_transport_mode
        CHECK (mode IN ('FLIGHT', 'TRAIN', 'BUS', 'CAB'));

-- SCHEDULED -> FULL when seats reach zero (set by the seat trigger)
-- SCHEDULED -> CANCELLED | COMPLETED by operations
ALTER TABLE departure
    ADD CONSTRAINT chk_departure_status
        CHECK (status IN ('SCHEDULED', 'FULL', 'CANCELLED', 'COMPLETED'));

-- The booking lifecycle. Transitions are audited by trigger into booking_audit;
-- the state machine itself is drawn in docs/uml/ (state diagram, Phase 9).
ALTER TABLE booking
    ADD CONSTRAINT chk_booking_status
        CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'));

ALTER TABLE payment
    ADD CONSTRAINT chk_payment_mode
        CHECK (mode IN ('CARD', 'UPI', 'NETBANKING', 'CASH'));

ALTER TABLE payment
    ADD CONSTRAINT chk_payment_status
        CHECK (status IN ('SUCCESS', 'FAILED', 'PENDING', 'REFUNDED'));

ALTER TABLE admin_query_log
    ADD CONSTRAINT chk_admin_query_log_status
        CHECK (status IN ('OK', 'ERROR'));


-- =============================================================================
-- SECTION 3 — SEAT INVENTORY
--
-- The most important constraints in the schema. They are the backstop behind
-- the row lock in book_package (ADR-02, ADR-05): if a trigger or a direct write
-- would ever push the seat count out of range, the transaction aborts instead
-- of leaving a corrupt count behind. Test TC-T-03 asserts exactly this.
-- =============================================================================

ALTER TABLE departure
    ADD CONSTRAINT chk_departure_total_seats_positive
        CHECK (total_seats > 0);

-- Overselling made structurally impossible. If the seat-decrement trigger is
-- ever wrong, this is what stops the damage.
ALTER TABLE departure
    ADD CONSTRAINT chk_departure_seats_non_negative
        CHECK (available_seats >= 0);

-- The mirror of the above: a cancellation that restored too many seats would
-- leave more seats available than the coach has.
ALTER TABLE departure
    ADD CONSTRAINT chk_departure_seats_within_total
        CHECK (available_seats <= total_seats);

ALTER TABLE departure
    ADD CONSTRAINT chk_departure_dates_ordered
        CHECK (end_date >= start_date);

ALTER TABLE departure
    ADD CONSTRAINT chk_departure_price_positive
        CHECK (price > 0);


-- =============================================================================
-- SECTION 4 — QUANTITIES AND MONEY
--
-- Money is NUMERIC, never floating point: NUMERIC(10,2) is exact, and a refund
-- computed in binary floating point would produce amounts that do not reconcile.
-- =============================================================================

ALTER TABLE package
    ADD CONSTRAINT chk_package_duration_days_positive
        CHECK (duration_days > 0);

-- Nights may be zero (a one-day tour) but never negative.
ALTER TABLE package
    ADD CONSTRAINT chk_package_duration_nights_non_negative
        CHECK (duration_nights IS NULL OR duration_nights >= 0);

ALTER TABLE package
    ADD CONSTRAINT chk_package_base_price_non_negative
        CHECK (base_price IS NULL OR base_price >= 0);

ALTER TABLE package
    ADD CONSTRAINT chk_package_max_group_size_positive
        CHECK (max_group_size IS NULL OR max_group_size > 0);

ALTER TABLE package_destination
    ADD CONSTRAINT chk_package_destination_day_positive
        CHECK (day_number > 0);

ALTER TABLE package_destination
    ADD CONSTRAINT chk_package_destination_nights_non_negative
        CHECK (nights_stay IS NULL OR nights_stay >= 0);

ALTER TABLE itinerary_activity
    ADD CONSTRAINT chk_itinerary_activity_day_positive
        CHECK (day_number > 0);

-- A booking is for at least one traveller. book_package relies on this: it
-- compares available_seats against array_length(traveller_ids, 1), and an empty
-- array would otherwise book zero seats and charge zero.
ALTER TABLE booking
    ADD CONSTRAINT chk_booking_num_travellers_positive
        CHECK (num_travellers > 0);

ALTER TABLE booking
    ADD CONSTRAINT chk_booking_total_amount_non_negative
        CHECK (total_amount >= 0);

ALTER TABLE booking
    ADD CONSTRAINT chk_booking_discount_non_negative
        CHECK (discount >= 0);

ALTER TABLE payment
    ADD CONSTRAINT chk_payment_amount_positive
        CHECK (amount > 0);

ALTER TABLE payment
    ADD CONSTRAINT chk_payment_installment_positive
        CHECK (installment_no > 0);

-- Refund and penalty are each non-negative. Their sum relative to the booking
-- total is a business rule spanning two tables, so it belongs in
-- cancel_booking() rather than in a CHECK, which cannot see another row.
ALTER TABLE cancellation
    ADD CONSTRAINT chk_cancellation_refund_non_negative
        CHECK (refund_amount IS NULL OR refund_amount >= 0);

ALTER TABLE cancellation
    ADD CONSTRAINT chk_cancellation_penalty_non_negative
        CHECK (penalty_amount IS NULL OR penalty_amount >= 0);

ALTER TABLE guide
    ADD CONSTRAINT chk_guide_experience_non_negative
        CHECK (experience_years IS NULL OR experience_years >= 0);

ALTER TABLE guide
    ADD CONSTRAINT chk_guide_daily_rate_non_negative
        CHECK (daily_rate IS NULL OR daily_rate >= 0);

ALTER TABLE employee
    ADD CONSTRAINT chk_employee_salary_non_negative
        CHECK (salary IS NULL OR salary >= 0);

ALTER TABLE transport
    ADD CONSTRAINT chk_transport_capacity_positive
        CHECK (capacity IS NULL OR capacity > 0);


-- =============================================================================
-- SECTION 5 — RATINGS AND DATE ORDERING
-- =============================================================================

ALTER TABLE hotel
    ADD CONSTRAINT chk_hotel_star_rating_range
        CHECK (star_rating IS NULL OR star_rating BETWEEN 1 AND 5);

ALTER TABLE hotel
    ADD CONSTRAINT chk_hotel_price_per_night_non_negative
        CHECK (price_per_night IS NULL OR price_per_night >= 0);

-- Rating is NOT NULL in the schema, so no NULL branch is needed here.
ALTER TABLE review
    ADD CONSTRAINT chk_review_rating_range
        CHECK (rating BETWEEN 1 AND 5);

-- Strictly greater: a stay must span at least one night, so same-day check-in
-- and check-out is not a valid hotel stay.
ALTER TABLE booking_hotel_stay
    ADD CONSTRAINT chk_booking_hotel_stay_dates_ordered
        CHECK (check_out > check_in);

ALTER TABLE booking_hotel_stay
    ADD CONSTRAINT chk_booking_hotel_stay_rooms_positive
        CHECK (num_rooms IS NULL OR num_rooms > 0);

ALTER TABLE booking_hotel_stay
    ADD CONSTRAINT chk_booking_hotel_stay_cost_non_negative
        CHECK (cost IS NULL OR cost >= 0);

-- Arrival after departure. Both are nullable because a leg may be recorded
-- before its times are confirmed, so the constraint only applies when both are
-- present.
ALTER TABLE booking_transport_leg
    ADD CONSTRAINT chk_booking_transport_leg_times_ordered
        CHECK (depart_time IS NULL OR arrive_time IS NULL OR arrive_time > depart_time);

ALTER TABLE booking_transport_leg
    ADD CONSTRAINT chk_booking_transport_leg_cost_non_negative
        CHECK (cost IS NULL OR cost >= 0);


-- =============================================================================
-- SECTION 6 — FORMAT CONSTRAINTS
-- =============================================================================

-- Indian PIN codes are exactly six digits. CHAR(6) enforces the length but not
-- the alphabet, so '  12 A' would otherwise be accepted.
ALTER TABLE customer
    ADD CONSTRAINT chk_customer_pincode_format
        CHECK (pincode IS NULL OR pincode ~ '^[0-9]{6}$');

-- Not full RFC 5322 validation, which is not worth attempting in a CHECK. This
-- rejects the obviously malformed; zod validates properly at the API boundary.
ALTER TABLE user_account
    ADD CONSTRAINT chk_user_account_email_format
        CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- An empty or whitespace-only name is not a name. btrim() is IMMUTABLE, so it
-- is permitted in a CHECK.
ALTER TABLE customer
    ADD CONSTRAINT chk_customer_first_name_not_blank
        CHECK (btrim(first_name) <> '');

ALTER TABLE traveller
    ADD CONSTRAINT chk_traveller_full_name_not_blank
        CHECK (btrim(full_name) <> '');

ALTER TABLE package
    ADD CONSTRAINT chk_package_title_not_blank
        CHECK (btrim(title) <> '');

ALTER TABLE destination
    ADD CONSTRAINT chk_destination_name_not_blank
        CHECK (btrim(name) <> '');


-- =============================================================================
-- End of 02_constraints.sql
--
-- Next in the build order:
--   03_views.sql       (Phase 10) — v_booking_summary and the derived balance
--   04_indexes.sql     (Phase 10) — B-tree indexes and the GIN trigram index
--   05_triggers.sql    (Phase 4)  — seat management, audit, guide overlap
--   06_procedures.sql  (Phase 4)  — book_package, cancel_booking
--   07_roles_grants.sql(Phase 5)  — the five database roles
-- =============================================================================
