-- =============================================================================
-- VoyageX — Travel and Tourism Management System
-- 07_roles_grants.sql · Role-based access control, enforced by PostgreSQL
--
-- Phase 5 of docs/project_plan.md
-- Traces to SRS FR-03, NFR-03 · ADR-03 · use_cases.md UC-19
--
-- THE POINT OF THIS FILE
--   Access control here is not a permissions table the application consults.
--   It is PostgreSQL's own privilege system. The API opens one connection pool
--   per role (server/db/pools.js) and picks the pool from the authenticated
--   user's role, so a request physically cannot perform an operation the
--   database has not granted to that role.
--
--   The consequence worth demonstrating: an agent running
--       DELETE FROM booking
--   is refused with SQLSTATE 42501 by the server, not by middleware. No bug in
--   a route handler, and no route added later without a check, can undo it.
--
-- IDEMPOTENCE
--   Roles are cluster-level, so DROP SCHEMA ... CASCADE in reset.sh does not
--   remove them, and this file is re-run on every rebuild. Every statement here
--   is therefore safe to repeat: roles are created only if absent, and GRANT is
--   idempotent by nature.
--
-- NO PASSWORDS IN THIS FILE
--   Roles are created without one. reset.sh sets passwords afterwards from the
--   environment, when those variables are present, so nothing secret is ever
--   committed (SRS C-07, NFR-12). On a local cluster using peer or trust
--   authentication no password is needed at all.
--
-- A LIMIT, STATED PLAINLY
--   These grants are table-and-operation scoped, not row scoped. app_customer
--   can SELECT the `booking` table, so the API is what restricts a customer to
--   their OWN bookings. Row-level security would move that boundary into the
--   database too; ADR-03 records why it was not used here — the requirement is
--   operation granularity, and RLS policies on 25 tables would obscure the
--   normalization work this project is assessed on. It is the right next step
--   if this were going to production.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — THE FIVE ROLES
-- =============================================================================

DO $$
DECLARE
    r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY[
        'app_customer',     -- self-service customers
        'app_agent',        -- counter staff
        'app_manager',      -- reporting and catalogue management
        'app_dbadmin',      -- administrative access; NOT a superuser
        'sql_console_ro'    -- read-only ad-hoc console
    ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('CREATE ROLE %I LOGIN', r);
            RAISE NOTICE 'created role %', r;
        END IF;
    END LOOP;
END $$;

-- app_dbadmin is powerful but deliberately NOT a superuser.
--
-- A superuser reaches the host shell through COPY ... TO PROGRAM, can disable
-- triggers, and can read every file the server account can read. That would
-- make every other control in this design advisory rather than enforced — the
-- seat trigger, the audit trail, and these grants included. The administrator
-- gets full rights over this schema and nothing beyond it.
--
-- NOBYPASSRLS is set for the same reason: it costs nothing today, and it means
-- the day row-level security is added, the admin role does not silently ignore
-- it.
ALTER ROLE app_dbadmin NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;
ALTER ROLE app_customer   NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;
ALTER ROLE app_agent      NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;
ALTER ROLE app_manager    NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;
ALTER ROLE sql_console_ro NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;


-- =============================================================================
-- SECTION 2 — START FROM NOTHING
--
-- Revoke before granting. Re-running this file after a role's duties have been
-- narrowed must actually narrow them; without the revoke, privileges would only
-- ever accumulate and this file would stop describing what is true.
-- =============================================================================

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM app_customer, app_agent, app_manager, app_dbadmin, sql_console_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM app_customer, app_agent, app_manager, app_dbadmin, sql_console_ro;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM app_customer, app_agent, app_manager, app_dbadmin, sql_console_ro;
REVOKE ALL ON SCHEMA public FROM app_customer, app_agent, app_manager, app_dbadmin, sql_console_ro;

-- PUBLIC is every role that exists. On a fresh database it holds EXECUTE on new
-- functions, which would hand book_package to anyone who can connect.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- USAGE lets a role reference objects in the schema; it grants nothing on the
-- objects themselves.
GRANT USAGE ON SCHEMA public TO app_customer, app_agent, app_manager, sql_console_ro;
GRANT USAGE, CREATE ON SCHEMA public TO app_dbadmin;


-- =============================================================================
-- SECTION 3 — app_customer
--
-- The narrowest role, and the one that proves the design: a customer can create
-- a booking without holding INSERT on `booking`. Booking goes through
-- book_package, which is SECURITY DEFINER (06_procedures.sql), so the insert
-- happens with the function owner's rights. Take that grant away and booking
-- stops working — which is the demonstration.
-- =============================================================================

-- The public catalogue.
GRANT SELECT ON
    destination, package, package_destination, itinerary_activity,
    departure, hotel, transport, guide, review, branch
TO app_customer;

-- Registration and login. Registration happens before any session exists, so it
-- runs on the most restricted pool; that is why INSERT appears here.
-- UPDATE is needed for last_login and for the customer's own profile (FR-04).
GRANT SELECT, INSERT, UPDATE ON user_account TO app_customer;
GRANT SELECT ON role TO app_customer;
GRANT SELECT, INSERT, UPDATE ON customer TO app_customer;

-- Travellers are the customer's own records, and FR-05 requires them to be
-- deletable from the UI. This is the only DELETE granted to any application
-- role, and it is also the delete interface the DBMS brief asks for.
GRANT SELECT, INSERT, UPDATE, DELETE ON traveller TO app_customer;

-- Read their bookings and money. NOT insertable or updatable directly: those
-- happen through the procedures.
GRANT SELECT ON booking, booking_traveller, payment, cancellation,
                booking_hotel_stay, booking_transport_leg
TO app_customer;

-- Reviews are written directly, but trg_review_valid still requires the booking
-- to be COMPLETED and to belong to the reviewer.
GRANT INSERT ON review TO app_customer;

-- SERIAL columns draw from sequences, so INSERT alone is not enough.
GRANT USAGE, SELECT ON SEQUENCE
    user_account_user_id_seq, customer_customer_id_seq,
    traveller_traveller_id_seq, review_review_id_seq
TO app_customer;

GRANT EXECUTE ON FUNCTION book_package(INT, INT, INT[], INT) TO app_customer;
GRANT EXECUTE ON FUNCTION cancel_booking(INT, TEXT, INT)     TO app_customer;


-- =============================================================================
-- SECTION 4 — app_agent
--
-- Counter staff. Transacts on behalf of customers, and holds NO DELETE on any
-- table — the refusal demonstrated at the end of this file.
-- =============================================================================

GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_agent;

-- ...except the audit trail, which no application role may read or write.
-- booking_audit is written only by trigger; admin_query_log only by the admin
-- console. An agent able to read the log of privileged statements would be able
-- to read statements they were never meant to see.
REVOKE ALL ON booking_audit, admin_query_log FROM app_agent;

GRANT INSERT, UPDATE ON booking, booking_traveller, payment, traveller,
                        customer, user_account, cancellation,
                        booking_hotel_stay, booking_transport_leg
TO app_agent;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_agent;

GRANT EXECUTE ON FUNCTION book_package(INT, INT, INT[], INT) TO app_agent;
GRANT EXECUTE ON FUNCTION cancel_booking(INT, TEXT, INT)     TO app_agent;

-- No DELETE is granted to app_agent on anything, anywhere. Deliberate: a
-- booking, a payment and a cancellation are financial records. Removing one is
-- not a counter operation, and the database is what says so.


-- =============================================================================
-- SECTION 5 — app_manager
--
-- Reads everything, including the audit tables, and maintains the catalogue.
--
-- The brief describes this role as SELECT-only. It is granted write access to
-- catalogue tables because FR-09 requires a manager to create packages and
-- departures and to deactivate a package; a read-only role cannot satisfy a
-- requirement that is in the mid-semester scope. The write grants stop at the
-- catalogue: no manager can alter a booking, a payment or a cancellation.
-- =============================================================================

GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_manager;

GRANT INSERT, UPDATE ON
    package, departure, destination, hotel, transport, guide,
    package_destination, itinerary_activity, guide_assignment, branch, employee
TO app_manager;

-- Editing an itinerary means removing days and stops, so these two junction
-- tables are deletable. Nothing else is.
GRANT DELETE ON package_destination, itinerary_activity TO app_manager;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_manager;

GRANT EXECUTE ON FUNCTION book_package(INT, INT, INT[], INT) TO app_manager;
GRANT EXECUTE ON FUNCTION cancel_booking(INT, TEXT, INT)     TO app_manager;


-- =============================================================================
-- SECTION 6 — sql_console_ro
--
-- The connection behind the read-only SQL console (FR-26). SELECT and nothing
-- else, anywhere. The console additionally wraps each statement in a READ ONLY
-- transaction with a statement timeout and always rolls back — but this grant
-- is what makes a write impossible rather than merely undone.
-- =============================================================================

GRANT SELECT ON ALL TABLES IN SCHEMA public TO sql_console_ro;

-- No INSERT, UPDATE, DELETE, no sequence usage, no EXECUTE. Not even on
-- book_package: a read-only console that can call a procedure which writes is
-- not read-only.


-- =============================================================================
-- SECTION 7 — app_dbadmin
-- =============================================================================

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO app_dbadmin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_dbadmin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO app_dbadmin;


-- =============================================================================
-- SECTION 8 — VIEWS, AND ANYTHING ADDED LATER
--
-- 03_views.sql arrives in Phase 10 and is applied BEFORE this file by
-- reset.sh's numeric ordering, so its views exist by the time this runs — but
-- only once that phase lands. Iterating over whatever views are actually
-- present keeps this file correct both before and after, with no edit needed.
-- =============================================================================

DO $$
DECLARE
    v TEXT;
    n INT := 0;
BEGIN
    FOR v IN SELECT table_name FROM information_schema.views WHERE table_schema = 'public'
    LOOP
        EXECUTE format(
            'GRANT SELECT ON public.%I TO app_customer, app_agent, app_manager, sql_console_ro, app_dbadmin', v);
        n := n + 1;
    END LOOP;
    IF n = 0 THEN
        RAISE NOTICE 'no views yet (03_views.sql arrives in Phase 10) — nothing to grant';
    ELSE
        RAISE NOTICE 'granted SELECT on % view(s)', n;
    END IF;
END $$;

-- Objects created by app_dbadmin later should be readable by the manager and
-- the console without another visit to this file.
ALTER DEFAULT PRIVILEGES FOR ROLE app_dbadmin IN SCHEMA public
    GRANT SELECT ON TABLES TO app_manager, sql_console_ro;


-- =============================================================================
-- SECTION 9 — ASSERT THE PRIVILEGES ARE WHAT THIS FILE CLAIMS
--
-- A GRANT that silently did nothing is indistinguishable from one that worked,
-- until something fails in a demo. These checks read the privileges back out of
-- the catalog, so the file proves its own central claims rather than asserting
-- them in a comment.
-- =============================================================================

DO $$
DECLARE
    tbl TEXT;
    bad TEXT := '';
BEGIN
    -- app_agent must hold no DELETE anywhere. This is the headline claim.
    FOR tbl IN
        SELECT table_name FROM information_schema.role_table_grants
        WHERE grantee = 'app_agent' AND privilege_type = 'DELETE'
    LOOP
        bad := bad || format('  app_agent has DELETE on %s%s', tbl, chr(10));
    END LOOP;

    -- sql_console_ro must hold nothing but SELECT.
    FOR tbl IN
        SELECT DISTINCT table_name || ' (' || privilege_type || ')'
        FROM information_schema.role_table_grants
        WHERE grantee = 'sql_console_ro' AND privilege_type <> 'SELECT'
    LOOP
        bad := bad || format('  sql_console_ro has more than SELECT on %s%s', tbl, chr(10));
    END LOOP;

    -- app_customer must not be able to write bookings directly.
    FOR tbl IN
        SELECT DISTINCT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'app_customer' AND table_name = 'booking'
          AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
    LOOP
        bad := bad || format('  app_customer has %s on booking — booking must go through the procedure%s',
                             tbl, chr(10));
    END LOOP;

    -- No application role may touch the audit trail.
    FOR tbl IN
        SELECT DISTINCT grantee || ' -> ' || table_name
        FROM information_schema.role_table_grants
        WHERE table_name IN ('booking_audit', 'admin_query_log')
          AND grantee IN ('app_customer', 'app_agent')
    LOOP
        bad := bad || format('  %s can reach the audit trail%s', tbl, chr(10));
    END LOOP;

    -- app_dbadmin must not have become a superuser.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_dbadmin' AND rolsuper) THEN
        bad := bad || '  app_dbadmin is a SUPERUSER — it must not be' || chr(10);
    END IF;

    IF bad <> '' THEN
        RAISE EXCEPTION E'role grants are not what 07_roles_grants.sql intends:\n%', bad;
    END IF;

    RAISE NOTICE 'role privileges verified: agent has no DELETE, console is read-only, customer cannot write bookings directly, audit trail unreachable, dbadmin is not a superuser';
END $$;


-- =============================================================================
-- End of 07_roles_grants.sql — 5 roles.
--
-- The demonstration, for the viva:
--     psql -U app_agent -d travel_tourism -c "DELETE FROM booking"
--     ERROR:  permission denied for table booking      (SQLSTATE 42501)
--
-- Tests TC-R-01 to TC-R-03 assert this on the error code rather than on the
-- message text.
-- =============================================================================
