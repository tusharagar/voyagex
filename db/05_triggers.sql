-- =============================================================================
-- VoyageX — Travel and Tourism Management System
-- 05_triggers.sql · Business rules enforced inside the database
--
-- Phase 4 of docs/project_plan.md
-- Traces to SRS FR-13 (seat decrement), FR-18 (seat restore), FR-21 (guide
-- overlap), FR-28 (audit trail) · ADR-02 · use_cases.md UC-07, UC-10
--
-- WHY THIS LOGIC IS HERE AND NOT IN THE APPLICATION
--   These rules protect invariants that must hold for EVERY writer, not only
--   for callers that go through the Express API: a psql session, the seed
--   script, a future mobile backend. A rule the caller can bypass is not an
--   invariant. ADR-02 records this decision together with its costs — the logic
--   cannot be unit-tested in isolation, and it is split across two languages.
--
-- THE DIVISION OF LABOUR, which is easy to get wrong:
--   * book_package() decides WHETHER a booking may happen. It holds the row
--     lock and performs the seat check.
--   * These triggers maintain the CONSEQUENCES of a booking that has already
--     been allowed — the seat count, the departure status, the audit row.
--   * The CHECK constraints in 02_constraints.sql are the backstop: if a
--     trigger here is ever wrong, the transaction aborts rather than leaving a
--     corrupt seat count behind.
--   Keeping the decision and the consequence in separate places is deliberate.
--   It means a booking inserted directly with SQL, bypassing the procedure,
--   still cannot oversell: the UPDATE below serialises on the departure row and
--   chk_departure_seats_non_negative rejects the result.
-- =============================================================================


-- =============================================================================
-- HELPER — who is acting?
--
-- Triggers need to record WHO changed a booking, but PostgreSQL only knows
-- which database role connected (app_agent, app_customer), not which
-- application user that request belonged to. The API therefore sets a
-- transaction-local GUC before it writes:
--
--     SET LOCAL voyagex.actor_user_id = '42';
--
-- SET LOCAL scopes the value to the current transaction, so it cannot leak
-- between requests that share a pooled connection — which a plain SET would do,
-- and which would silently misattribute audit rows.
--
-- Returns NULL when unset: a direct psql write is recorded as "unknown actor"
-- rather than failing. An audit trail that refuses to record anything it cannot
-- fully attribute records nothing at all.
-- =============================================================================
CREATE OR REPLACE FUNCTION voyagex_current_actor()
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_raw TEXT;
BEGIN
    -- true = missing_ok: returns NULL instead of raising when the GUC is unset.
    v_raw := NULLIF(current_setting('voyagex.actor_user_id', true), '');
    IF v_raw IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN v_raw::INT;
EXCEPTION
    WHEN invalid_text_representation THEN
        -- A malformed value must not abort the caller's booking.
        RETURN NULL;
END;
$$;

COMMENT ON FUNCTION voyagex_current_actor() IS
'Application user id for the current transaction, from the voyagex.actor_user_id GUC set by the API. NULL when unset (e.g. a direct psql write).';


-- =============================================================================
-- TRIGGER 1 — SEAT INVENTORY                               (SRS FR-13, FR-18)
--
-- Seats are consumed by CONFIRMED bookings only. A PENDING booking holds no
-- seats, which is what makes the transition rules below asymmetric.
--
-- Transitions handled:
--   INSERT  ... status = 'CONFIRMED'          -> decrement
--   UPDATE  anything     -> 'CONFIRMED'       -> decrement   (agent confirms a
--                                                             pending booking)
--   UPDATE  'CONFIRMED'  -> 'CANCELLED'       -> restore
--   UPDATE  'CONFIRMED'  -> 'COMPLETED'       -> no change: the trip happened,
--                                                the seats were genuinely used
--   UPDATE  'PENDING'    -> 'CANCELLED'       -> no change: no seats were ever
--                                                taken, so returning them would
--                                                invent inventory and could
--                                                breach available_seats <=
--                                                total_seats
--
-- That last case is the one a naive "on cancel, add the seats back"
-- implementation gets wrong.
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_booking_seats_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- ---- a new booking that already holds seats -----------------------------
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'CONFIRMED' THEN
            UPDATE departure
               SET available_seats = available_seats - NEW.num_travellers,
                   -- Mark the departure FULL the moment the last seat goes.
                   -- Only SCHEDULED flips: a CANCELLED or COMPLETED departure
                   -- keeps its status.
                   status = CASE
                              WHEN available_seats - NEW.num_travellers = 0
                                   AND status = 'SCHEDULED' THEN 'FULL'
                              ELSE status
                            END
             WHERE departure_id = NEW.departure_id;
        END IF;
        RETURN NEW;
    END IF;

    -- ---- status changed on an existing booking ------------------------------
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN

        -- becoming CONFIRMED: take the seats
        IF NEW.status = 'CONFIRMED' AND OLD.status <> 'CONFIRMED' THEN
            UPDATE departure
               SET available_seats = available_seats - NEW.num_travellers,
                   status = CASE
                              WHEN available_seats - NEW.num_travellers = 0
                                   AND status = 'SCHEDULED' THEN 'FULL'
                              ELSE status
                            END
             WHERE departure_id = NEW.departure_id;

        -- leaving CONFIRMED for CANCELLED: give the seats back
        ELSIF OLD.status = 'CONFIRMED' AND NEW.status = 'CANCELLED' THEN
            UPDATE departure
               SET available_seats = available_seats + OLD.num_travellers,
                   -- A departure that was FULL is sellable again. CANCELLED and
                   -- COMPLETED departures are left alone.
                   status = CASE
                              WHEN status = 'FULL' THEN 'SCHEDULED'
                              ELSE status
                            END
             WHERE departure_id = OLD.departure_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- AFTER, not BEFORE: the booking row must exist before its consequences are
-- applied, and an AFTER trigger cannot silently alter the row being written.
CREATE TRIGGER trg_booking_seats
    AFTER INSERT OR UPDATE ON booking
    FOR EACH ROW
    EXECUTE FUNCTION trg_booking_seats_fn();

COMMENT ON FUNCTION trg_booking_seats_fn() IS
'Maintains departure.available_seats and the SCHEDULED/FULL status. Only CONFIRMED bookings consume seats (SRS FR-13, FR-18).';


-- =============================================================================
-- TRIGGER 2 — AUDIT TRAIL                                       (SRS FR-28)
--
-- Every change of booking.status is recorded in booking_audit. The application
-- never writes to that table, and 07_roles_grants.sql grants no INSERT on it to
-- any application role — which is what makes the trail worth reading.
--
-- Creation is deliberately NOT logged here. booking.booking_date already
-- records when a booking came into existence, so logging the insert as well
-- would duplicate a fact the schema holds. The trail covers transitions;
-- booking_date covers the origin. Together they are complete.
--
-- booking_audit.booking_id carries no foreign key (see 01_schema.sql): a trail
-- that can be erased by deleting what it describes is not a trail.
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_booking_audit_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- IS DISTINCT FROM rather than <> so that a NULL on either side still
    -- counts as a change; <> would evaluate to NULL and skip the row.
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO booking_audit (booking_id, old_status, new_status, changed_by)
        VALUES (NEW.booking_id, OLD.status, NEW.status, voyagex_current_actor());
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_booking_audit
    AFTER UPDATE ON booking
    FOR EACH ROW
    EXECUTE FUNCTION trg_booking_audit_fn();

COMMENT ON FUNCTION trg_booking_audit_fn() IS
'Appends a booking_audit row on every booking.status change. Written only by this trigger (SRS FR-28, NFR-06).';


-- =============================================================================
-- TRIGGER 3 — GUIDE DOUBLE-BOOKING                              (SRS FR-21)
--
-- UNIQUE (guide_id, departure_id) in 02_constraints.sql stops the same guide
-- being assigned to one departure twice. It cannot stop a guide being assigned
-- to two DIFFERENT departures whose dates overlap, because that requires
-- comparing date ranges ACROSS ROWS — something no table constraint can do.
--
-- daterange(start, end, '[]') is inclusive at both ends, so a tour ending on
-- the 17th and another starting on the 17th DO overlap. That is the intended
-- reading: a guide cannot be in two places on the same day.
--
-- (A PostgreSQL EXCLUDE constraint with GiST could express this declaratively,
-- but only over columns of the same table; the dates live on `departure`, not
-- on `guide_assignment`, so a trigger is the available mechanism.)
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_guide_no_overlap_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_start        DATE;
    v_end          DATE;
    v_clash_id     INT;
    v_clash_start  DATE;
    v_clash_end    DATE;
BEGIN
    SELECT start_date, end_date
      INTO v_start, v_end
      FROM departure
     WHERE departure_id = NEW.departure_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DEPARTURE_NOT_FOUND: departure % does not exist', NEW.departure_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT d.departure_id, d.start_date, d.end_date
      INTO v_clash_id, v_clash_start, v_clash_end
      FROM guide_assignment ga
      JOIN departure d ON d.departure_id = ga.departure_id
     WHERE ga.guide_id = NEW.guide_id
       -- On UPDATE, do not let a row clash with itself.
       AND ga.assignment_id IS DISTINCT FROM NEW.assignment_id
       AND daterange(d.start_date, d.end_date, '[]')
           && daterange(v_start, v_end, '[]')
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION
            'GUIDE_DOUBLE_BOOKED: guide % is already assigned to departure % (% to %), which overlaps % to %',
            NEW.guide_id, v_clash_id, v_clash_start, v_clash_end, v_start, v_end
            USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- BEFORE, not AFTER: the offending row should never reach the table.
CREATE TRIGGER trg_guide_no_overlap
    BEFORE INSERT OR UPDATE ON guide_assignment
    FOR EACH ROW
    EXECUTE FUNCTION trg_guide_no_overlap_fn();

COMMENT ON FUNCTION trg_guide_no_overlap_fn() IS
'Rejects a guide assignment overlapping another assignment for the same guide, compared as inclusive date ranges (SRS FR-21).';


-- =============================================================================
-- End of 05_triggers.sql — 3 triggers, 4 functions.
-- Next: 06_procedures.sql (book_package, cancel_booking).
-- =============================================================================
