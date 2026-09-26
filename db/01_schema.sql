-- =============================================================================
-- VoyageX — Travel and Tourism Management System
-- 01_schema.sql · Data Definition Language: 25 base tables
--
-- Phase 2 of docs/project_plan.md · traces to SRS §2.1 and docs/architecture.md §2.3
--
-- Run order: this file first, then 02_constraints.sql. ./db/reset.sh runs both.
--
-- WHAT IS IN THIS FILE
--   Table structure only: columns, data types, primary keys, foreign keys,
--   NOT NULL and DEFAULT.
--
-- WHAT IS DELIBERATELY NOT IN THIS FILE
--   CHECK constraints and the UNIQUE constraints that express candidate keys.
--   Those live in 02_constraints.sql, added by ALTER TABLE with explicit names,
--   so that a violation reports a constraint the reader can look up
--   (for example "chk_departure_seats_non_negative" rather than a generated
--   name), and so that the rules a row must satisfy can be read in one place.
--
-- TABLE ORDER
--   Tables are created in foreign-key dependency order: no table references one
--   that has not been created yet. The order is therefore also a readable
--   dependency graph of the domain.
-- =============================================================================

-- Trigram matching for fuzzy destination search (SRS FR-06, alternate flow A2).
-- Created here because 04_indexes.sql depends on it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- =============================================================================
-- SECTION 1 — ACCESS CONTROL                                      (3 tables)
-- =============================================================================

-- Application-level role of a user account. These four rows map one-to-one onto
-- the PostgreSQL database roles created in 07_roles_grants.sql, which is where
-- access is actually enforced (ADR-03). This table records which role a user
-- holds; it does not grant anything by itself.
CREATE TABLE role (
    role_id      SERIAL       PRIMARY KEY,
    role_name    VARCHAR(30)  NOT NULL,
    description  TEXT
);

-- Reference data, not sample data: the application cannot authenticate anyone
-- before these rows exist, so they belong with the structure rather than with
-- the seed script.
INSERT INTO role (role_name, description) VALUES
    ('CUSTOMER', 'Books travel for themselves and their travellers. Maps to DB role app_customer.'),
    ('AGENT',    'Agency counter staff; books on behalf of walk-in customers. Maps to app_agent.'),
    ('MANAGER',  'Runs the catalogue and reads business reports. Maps to app_manager.'),
    ('DB_ADMIN', 'Inspects and repairs data; reviews the audit trail. Maps to app_dbadmin.');

CREATE TABLE user_account (
    user_id        SERIAL        PRIMARY KEY,
    email          VARCHAR(120)  NOT NULL,
    -- bcrypt hash, cost factor >= 10 (SRS NFR-05). Never a reversible form.
    -- TEXT rather than CHAR(60): the hash length is an artefact of the algorithm,
    -- and pinning it would break a future migration to a longer scheme.
    password_hash  TEXT          NOT NULL,
    role_id        INT           NOT NULL REFERENCES role (role_id),
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    last_login     TIMESTAMPTZ
);

CREATE TABLE branch (
    branch_id    SERIAL       PRIMARY KEY,
    branch_name  VARCHAR(80)  NOT NULL,
    city         VARCHAR(60),
    phone        VARCHAR(15)
);


-- =============================================================================
-- SECTION 2 — PEOPLE                                              (4 tables)
-- =============================================================================

-- A customer is a person who books. user_id is nullable and UNIQUE:
--   NULL      -> a walk-in customer the agency holds records for, who has no
--                login (they are booked by an agent, SRS FR-15)
--   NOT NULL  -> a self-service customer with an account
-- The UNIQUE constraint (02_constraints.sql) makes this a 1:1-optional
-- relationship rather than 1:M.
CREATE TABLE customer (
    customer_id    SERIAL       PRIMARY KEY,
    user_id        INT          REFERENCES user_account (user_id),
    first_name     VARCHAR(60)  NOT NULL,
    last_name      VARCHAR(60),
    phone          VARCHAR(15),
    address_line   VARCHAR(160),
    city           VARCHAR(60),
    state          VARCHAR(60),
    pincode        CHAR(6),
    date_of_birth  DATE,
    registered_on  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- A traveller is a person who travels; a customer is a person who pays.
-- They are separate entities because the sets genuinely differ: a customer
-- books for a spouse and two children who will never hold accounts, and the
-- same traveller recurs across bookings.
--
-- ON DELETE CASCADE: travellers have no meaning independent of the customer who
-- recorded them, so removing the customer removes them.
CREATE TABLE traveller (
    traveller_id          SERIAL       PRIMARY KEY,
    customer_id           INT          NOT NULL REFERENCES customer (customer_id) ON DELETE CASCADE,
    full_name             VARCHAR(120) NOT NULL,
    gender                CHAR(1),
    date_of_birth         DATE,
    passport_no           VARCHAR(20),
    relation_to_customer  VARCHAR(30)
);

CREATE TABLE employee (
    employee_id  SERIAL        PRIMARY KEY,
    user_id      INT           REFERENCES user_account (user_id),
    branch_id    INT           REFERENCES branch (branch_id),
    name         VARCHAR(120)  NOT NULL,
    designation  VARCHAR(60),
    phone        VARCHAR(15),
    hire_date    DATE,
    salary       NUMERIC(10,2)
);

-- Guides are contracted per departure (see guide_assignment), so they are not
-- employees and carry a daily rate rather than a salary.
CREATE TABLE guide (
    guide_id          SERIAL        PRIMARY KEY,
    name              VARCHAR(120)  NOT NULL,
    phone             VARCHAR(15),
    email             VARCHAR(120),
    languages_spoken  VARCHAR(120),
    experience_years  INT,
    daily_rate        NUMERIC(8,2),
    is_available      BOOLEAN       NOT NULL DEFAULT TRUE
);


-- =============================================================================
-- SECTION 3 — CATALOGUE                                           (7 tables)
-- =============================================================================

CREATE TABLE destination (
    destination_id  SERIAL       PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    state           VARCHAR(60),
    country         VARCHAR(60)  NOT NULL DEFAULT 'India',
    category        VARCHAR(20),
    description     TEXT,
    best_season     VARCHAR(40)
);

-- A package is a TEMPLATE: what the tour visits and for how long.
-- It carries no seats and no sale price. See the note on `departure` below —
-- this separation is the most important decision in the data model.
CREATE TABLE package (
    package_id       SERIAL        PRIMARY KEY,
    title            VARCHAR(160)  NOT NULL,
    description      TEXT,
    duration_days    INT           NOT NULL,
    duration_nights  INT,
    category         VARCHAR(20),
    -- Indicative "from" price for catalogue display only. The amount a customer
    -- is actually charged is departure.price, and booking.total_amount is
    -- derived from that, never from this column. Kept because the catalogue
    -- needs a sort key before departures are attached; documented in
    -- docs/normalization.md as a reporting attribute, not a transactional one.
    base_price       NUMERIC(10,2),
    max_group_size   INT,
    is_active        BOOLEAN       NOT NULL DEFAULT TRUE
);

-- M:N between package and destination, resolved as a junction table.
--
-- The primary key is three columns, not two, and that is deliberate: a tour may
-- revisit the same city on a later day (out to Manali on day 1, back through it
-- on day 6). With PK (package_id, destination_id) the second visit would be
-- rejected as a duplicate. day_number is part of the key because it is part of
-- what makes the visit distinct.
CREATE TABLE package_destination (
    package_id      INT  NOT NULL REFERENCES package (package_id) ON DELETE CASCADE,
    destination_id  INT  NOT NULL REFERENCES destination (destination_id),
    day_number      INT  NOT NULL,
    nights_stay     INT,
    CONSTRAINT pk_package_destination PRIMARY KEY (package_id, destination_id, day_number)
);

-- Weak entity: an activity has no identity apart from the package it belongs to.
-- Its key is the owner's key plus the discriminators (day and time slot), and it
-- cascades on delete — the textbook mapping of a weak entity.
CREATE TABLE itinerary_activity (
    package_id   INT          NOT NULL REFERENCES package (package_id) ON DELETE CASCADE,
    day_number   INT          NOT NULL,
    time_slot    VARCHAR(20)  NOT NULL,
    title        VARCHAR(160) NOT NULL,
    description  TEXT,
    CONSTRAINT pk_itinerary_activity PRIMARY KEY (package_id, day_number, time_slot)
);

-- ---------------------------------------------------------------------------
-- THE CENTRAL DESIGN DECISION
--
-- A package is a template; a departure is ONE dated, priced, seat-limited
-- running of that template. Price and seats belong here and never on `package`.
--
-- The functional dependency is  departure_id -> price,  not  package_id -> price.
-- Putting price on `package` would mean:
--   * changing the October price silently rewrites what June customers paid
--     (update anomaly), and
--   * the same package could not be sold twice on different dates without
--     duplicating the entire itinerary.
--
-- available_seats is derivable from the bookings, and is stored anyway. That is
-- a conscious denormalization recorded as ADR-05: an aggregate over `booking`
-- gives no single row for SELECT ... FOR UPDATE to lock, and without a lockable
-- row the check-then-decrement in book_package cannot be made atomic. One
-- lockable row is worth the redundancy. The CHECK constraints in
-- 02_constraints.sql are the backstop that turns a wrong decrement into an
-- aborted transaction instead of a corrupt seat count.
-- ---------------------------------------------------------------------------
CREATE TABLE departure (
    departure_id     SERIAL         PRIMARY KEY,
    package_id       INT            NOT NULL REFERENCES package (package_id),
    start_date       DATE           NOT NULL,
    end_date         DATE           NOT NULL,
    total_seats      INT            NOT NULL,
    available_seats  INT            NOT NULL,
    price            NUMERIC(10,2)  NOT NULL,
    status           VARCHAR(12)    NOT NULL DEFAULT 'SCHEDULED'
);

CREATE TABLE hotel (
    hotel_id         SERIAL        PRIMARY KEY,
    destination_id   INT           REFERENCES destination (destination_id),
    name             VARCHAR(120)  NOT NULL,
    star_rating      INT,
    address          VARCHAR(200),
    contact          VARCHAR(15),
    price_per_night  NUMERIC(8,2)
);

CREATE TABLE transport (
    transport_id   SERIAL        PRIMARY KEY,
    mode           VARCHAR(10)   NOT NULL,
    operator_name  VARCHAR(120),
    vehicle_no     VARCHAR(20),
    capacity       INT
);


-- =============================================================================
-- SECTION 4 — BOOKING AND MONEY                                   (8 tables)
--
-- DELETION POLICY — the ON DELETE clauses below are split deliberately, and the
-- split is along the line between description and record:
--
--   CASCADE from booking:  booking_traveller, booking_hotel_stay,
--                          booking_transport_leg
--       These only describe a booking. They have no meaning once it is gone,
--       and no one will ever be asked to account for them separately.
--
--   RESTRICT (no clause):  payment, cancellation, review
--       These are financial and reputational records. A booking with money or a
--       cancellation against it must not be deletable in one statement; the
--       delete fails, which is the correct outcome. Removing such a booking is
--       a deliberate multi-step act, not a side effect.
--
-- The same reasoning keeps ON DELETE off booking -> customer and
-- booking -> departure: a departure that has been sold cannot be dropped, and
-- PostgreSQL is what refuses it.
-- =============================================================================

-- One customer's purchase of seats on one departure.
--
-- booked_by_employee_id is nullable, and the NULL is meaningful rather than
-- merely permitted:
--   NULL      -> the customer booked online themselves (SRS FR-10)
--   NOT NULL  -> an agent booked on their behalf at a counter (SRS FR-15)
-- The ML feature `booked_online` in Phase 12 reads exactly this distinction.
--
-- No ON DELETE CASCADE to customer or departure: bookings are financial records.
-- Deleting a departure that has been sold should fail, and it does.
CREATE TABLE booking (
    booking_id             SERIAL         PRIMARY KEY,
    customer_id            INT            NOT NULL REFERENCES customer (customer_id),
    departure_id           INT            NOT NULL REFERENCES departure (departure_id),
    booked_by_employee_id  INT            REFERENCES employee (employee_id),
    booking_date           TIMESTAMPTZ    NOT NULL DEFAULT now(),
    num_travellers         INT            NOT NULL,
    total_amount           NUMERIC(10,2)  NOT NULL,
    discount               NUMERIC(8,2)   NOT NULL DEFAULT 0,
    status                 VARCHAR(12)    NOT NULL DEFAULT 'PENDING',
    special_requests       TEXT
);

-- Which travellers are on which booking, and in which seat.
-- Composite PK prevents the same traveller being added to one booking twice.
CREATE TABLE booking_traveller (
    booking_id    INT          NOT NULL REFERENCES booking (booking_id) ON DELETE CASCADE,
    traveller_id  INT          NOT NULL REFERENCES traveller (traveller_id),
    seat_no       VARCHAR(10),
    CONSTRAINT pk_booking_traveller PRIMARY KEY (booking_id, traveller_id)
);

-- Instalments are supported: several payment rows may reference one booking.
-- Balance due is NEVER stored on `booking`; it is derived in v_booking_summary
-- (03_views.sql) as total_amount minus the sum of successful payments. Storing
-- it would create a value that can disagree with the rows it summarises.
CREATE TABLE payment (
    payment_id       SERIAL         PRIMARY KEY,
    booking_id       INT            NOT NULL REFERENCES booking (booking_id),
    amount           NUMERIC(10,2)  NOT NULL,
    payment_date     TIMESTAMPTZ    NOT NULL DEFAULT now(),
    mode             VARCHAR(12),
    transaction_ref  VARCHAR(60),
    status           VARCHAR(10)    NOT NULL DEFAULT 'PENDING',
    installment_no   INT            NOT NULL DEFAULT 1
);

-- A cancellation is a table rather than four nullable columns on `booking`
-- because it is a distinct event with its own attributes, its own actor and its
-- own timestamp, and because most bookings never have one — four columns that
-- are NULL on 85% of rows describe an entity that has not been factored out.
--
-- booking_id is UNIQUE (02_constraints.sql): that single constraint is what
-- makes this 1:1-optional and what makes a double cancellation fail in the
-- database rather than in a UI check that a double-submitted form could defeat
-- (SRS FR-19).
CREATE TABLE cancellation (
    cancellation_id  SERIAL         PRIMARY KEY,
    booking_id       INT            NOT NULL REFERENCES booking (booking_id),
    processed_by     INT            REFERENCES employee (employee_id),
    cancelled_on     TIMESTAMPTZ    NOT NULL DEFAULT now(),
    reason           TEXT,
    refund_amount    NUMERIC(10,2),
    penalty_amount   NUMERIC(10,2)
);

CREATE TABLE booking_hotel_stay (
    stay_id     SERIAL         PRIMARY KEY,
    booking_id  INT            NOT NULL REFERENCES booking (booking_id) ON DELETE CASCADE,
    hotel_id    INT            REFERENCES hotel (hotel_id),
    check_in    DATE           NOT NULL,
    check_out   DATE           NOT NULL,
    room_type   VARCHAR(40),
    num_rooms   INT,
    cost        NUMERIC(10,2)
);

CREATE TABLE booking_transport_leg (
    leg_id         SERIAL        PRIMARY KEY,
    booking_id     INT           NOT NULL REFERENCES booking (booking_id) ON DELETE CASCADE,
    transport_id   INT           REFERENCES transport (transport_id),
    from_location  VARCHAR(120),
    to_location    VARCHAR(120),
    depart_time    TIMESTAMPTZ,
    arrive_time    TIMESTAMPTZ,
    cost           NUMERIC(8,2)
);

-- UNIQUE (guide_id, departure_id) stops the same guide being assigned twice to
-- one departure. It does NOT stop a guide being assigned to two DIFFERENT
-- departures whose dates overlap — that needs to compare date ranges across
-- rows, which a table constraint cannot do. A BEFORE INSERT trigger in
-- 05_triggers.sql handles it (SRS FR-21).
CREATE TABLE guide_assignment (
    assignment_id  SERIAL        PRIMARY KEY,
    guide_id       INT           NOT NULL REFERENCES guide (guide_id),
    departure_id   INT           NOT NULL REFERENCES departure (departure_id),
    assigned_on    DATE          NOT NULL DEFAULT CURRENT_DATE,
    fee            NUMERIC(8,2)
);

-- UNIQUE booking_id encodes the rule "only someone who actually booked may
-- review, and only once" as a key rather than as application logic.
CREATE TABLE review (
    review_id       SERIAL       PRIMARY KEY,
    booking_id      INT          NOT NULL REFERENCES booking (booking_id),
    customer_id     INT          REFERENCES customer (customer_id),
    destination_id  INT          REFERENCES destination (destination_id),
    rating          INT          NOT NULL,
    comment         TEXT,
    review_date     TIMESTAMPTZ  NOT NULL DEFAULT now()
);


-- =============================================================================
-- SECTION 5 — SYSTEM TABLES                                       (3 tables)
-- =============================================================================

-- Append-only audit of booking status changes. WRITTEN ONLY BY TRIGGER
-- (05_triggers.sql). No application code inserts here, and 07_roles_grants.sql
-- grants no INSERT on it to any application role — which is what makes the
-- trail trustworthy (SRS FR-28, NFR-06).
--
-- booking_id carries NO foreign key, deliberately: the audit record of a
-- booking must outlive the booking row itself. A trail that can be erased by
-- deleting what it describes is not an audit trail.
CREATE TABLE booking_audit (
    audit_id     SERIAL       PRIMARY KEY,
    booking_id   INT          NOT NULL,
    old_status   VARCHAR(12),
    new_status   VARCHAR(12),
    changed_by   INT,
    changed_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Every statement run through the admin console (SRS FR-27), successful or not.
-- Written on a SEPARATE pool connection, outside the audited statement's own
-- transaction: PostgreSQL has no autonomous transactions, so a log row written
-- inside that transaction would be rolled back along with it, erasing the
-- record of precisely the statements that were reverted (architecture.md §3.2).
CREATE TABLE admin_query_log (
    log_id         SERIAL       PRIMARY KEY,
    user_id        INT          REFERENCES user_account (user_id),
    db_role        TEXT,
    statement      TEXT         NOT NULL,
    status         VARCHAR(5)   NOT NULL,
    error_msg      TEXT,
    rows_affected  INT,
    duration_ms    NUMERIC,
    executed_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Output of the cancellation-risk model (Phase 12, SRS FR-29). Kept out of
-- `booking` because a prediction is a versioned, dated opinion about a booking,
-- not an attribute of it: the model changes, the booking does not.
CREATE TABLE cancellation_prediction (
    prediction_id    SERIAL        PRIMARY KEY,
    booking_id       INT           NOT NULL REFERENCES booking (booking_id),
    risk_score       NUMERIC(5,4),
    predicted_label  VARCHAR(10),
    model_version    VARCHAR(20),
    predicted_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);


-- =============================================================================
-- End of 01_schema.sql — 25 tables.
-- Next: 02_constraints.sql adds the named CHECK and UNIQUE constraints.
-- =============================================================================
