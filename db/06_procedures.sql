-- =============================================================================
-- VoyageX — Travel and Tourism Management System
-- 06_procedures.sql · Stored procedures: book_package, cancel_booking
--
-- Phase 4 of docs/project_plan.md
-- Traces to SRS FR-10, FR-11, FR-12, FR-15, FR-18, FR-19 · NFR-02
--          use_cases.md UC-07 (incl. exception flows E1-E3), UC-10
--          ADR-02, ADR-05
--
-- These two functions are where the system's correctness lives. Everything the
-- API does around them is transport.
-- =============================================================================


-- =============================================================================
-- book_package — create a booking, atomically                    (SRS FR-10)
--
--   book_package(customer_id, departure_id, traveller_ids[])          -> booking_id
--   book_package(customer_id, departure_id, traveller_ids[], emp_id)  -> booking_id
--
-- The fourth argument defaults to NULL, so the three-argument signature named
-- in docs/architecture.md and docs/contribution_record.md remains exactly as
-- specified. NULL means the customer booked online themselves; a value means an
-- agent booked on their behalf (SRS FR-15).
--
-- ---------------------------------------------------------------------------
-- THE CONCURRENCY GUARANTEE — the reason this is a stored procedure at all
--
-- "Is there a seat?" and "take the seat" must be one indivisible step. Split
-- them and two customers both read 1 and both book.
--
-- SELECT ... FOR UPDATE takes a row-level exclusive lock on the departure and
-- holds it until the transaction commits. A second transaction reaching the
-- same line BLOCKS there. When the first commits, the second is released and —
-- this is the part that matters — under READ COMMITTED it re-reads the row it
-- just waited for, seeing the seat count the first transaction left behind, not
-- the value it would have read when it started.
--
--     T1: SELECT ... FOR UPDATE  -> available = 1, lock held
--     T2: SELECT ... FOR UPDATE  -> blocks
--     T1: check 1 >= 1, INSERT booking, trigger sets available = 0
--     T1: COMMIT                 -> lock released
--     T2:                        -> wakes, RE-READS available = 0
--     T2: check 0 >= 1 fails     -> INSUFFICIENT_SEATS, rolls back
--
-- Exactly one booking exists and available_seats is 0, never -1.
-- Verified by test TC-C-01 and reproducible by hand per docs/concurrency_demo.md.
-- ---------------------------------------------------------------------------
-- =============================================================================

-- SECURITY DEFINER, deliberately, and with search_path pinned.
--
-- app_customer holds no INSERT on booking, payment or booking_traveller
-- (07_roles_grants.sql). Without SECURITY DEFINER a customer calling this
-- function would be refused by those very grants, and the only way to make
-- booking work would be to grant direct INSERT on booking — which is exactly
-- the access this design exists to withhold. "Booking only through the
-- procedure" is not a convention here; it is what the grants enforce.
--
-- SET search_path is not optional on a SECURITY DEFINER function. Without it a
-- caller can create a schema of their own, put a malicious `booking` table or
-- operator in it, prepend it to search_path, and have this function execute
-- against that object with the owner's privileges. Pinning search_path to
-- public and pg_temp closes that. pg_temp is listed last so a temporary object
-- cannot shadow a real one.
CREATE OR REPLACE FUNCTION book_package(
    p_customer_id             INT,
    p_departure_id            INT,
    p_traveller_ids           INT[],
    p_booked_by_employee_id   INT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_seats_needed   INT;
    v_distinct_ids   INT;
    v_owned          INT;
    v_available      INT;
    v_price          NUMERIC(10,2);
    v_dep_status     VARCHAR(12);
    v_total          NUMERIC(10,2);
    v_booking_id     INT;
BEGIN
    -- ---- 1. Validate the request before taking any lock ---------------------
    -- Cheap checks first: holding a row lock while validating input would
    -- block other bookings for no reason.

    v_seats_needed := COALESCE(array_length(p_traveller_ids, 1), 0);

    IF v_seats_needed = 0 THEN
        RAISE EXCEPTION 'NO_TRAVELLERS: a booking needs at least one traveller'
            USING ERRCODE = 'check_violation';
    END IF;

    -- The same traveller twice would consume two seats for one person and
    -- then violate the composite primary key on booking_traveller — after the
    -- seats had already been taken. Catch it first.
    SELECT count(DISTINCT t) INTO v_distinct_ids
      FROM unnest(p_traveller_ids) AS t;

    IF v_distinct_ids <> v_seats_needed THEN
        RAISE EXCEPTION 'DUPLICATE_TRAVELLER: traveller list contains repeats'
            USING ERRCODE = 'check_violation';
    END IF;

    -- A customer may only book travellers on their own account. Without this,
    -- a crafted request could attach someone else's traveller records to a
    -- booking. The API checks too; this is the check that cannot be bypassed.
    SELECT count(*) INTO v_owned
      FROM traveller
     WHERE traveller_id = ANY (p_traveller_ids)
       AND customer_id  = p_customer_id;

    IF v_owned <> v_seats_needed THEN
        RAISE EXCEPTION
            'TRAVELLER_NOT_OWNED: one or more travellers do not belong to customer %',
            p_customer_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- ---- 2. THE LOCK --------------------------------------------------------
    SELECT available_seats, price, status
      INTO v_available, v_price, v_dep_status
      FROM departure
     WHERE departure_id = p_departure_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DEPARTURE_NOT_FOUND: departure % does not exist', p_departure_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- ---- 3. The seat check --------------------------------------------------
    -- ORDER MATTERS HERE, and not for a cosmetic reason.
    --
    -- The seat trigger sets a departure to FULL when the last seat goes. If the
    -- status check came first, the loser of a race for the final seat would be
    -- told DEPARTURE_NOT_AVAILABLE — technically true, but it hides the actual
    -- cause and contradicts the documented exception flow (UC-07 E2) and the
    -- concurrency test, both of which expect INSUFFICIENT_SEATS.
    --
    -- So: seats first. A FULL departure has 0 seats and fails here naturally,
    -- with the error that describes what really happened.
    IF v_available < v_seats_needed THEN
        RAISE EXCEPTION
            'INSUFFICIENT_SEATS: % seat(s) requested but % remain on departure %',
            v_seats_needed, v_available, p_departure_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Only genuinely unsellable states reach this point (UC-07 E3).
    IF v_dep_status NOT IN ('SCHEDULED', 'FULL') THEN
        RAISE EXCEPTION
            'DEPARTURE_NOT_AVAILABLE: departure % is %', p_departure_id, v_dep_status
            USING ERRCODE = 'check_violation';
    END IF;

    -- ---- 4. Create the booking ---------------------------------------------
    -- Priced from the DEPARTURE, never from package.base_price: the functional
    -- dependency is departure_id -> price (ADR-05, normalization.md).
    v_total := v_price * v_seats_needed;

    INSERT INTO booking (customer_id, departure_id, booked_by_employee_id,
                         num_travellers, total_amount, status)
    VALUES (p_customer_id, p_departure_id, p_booked_by_employee_id,
            v_seats_needed, v_total, 'CONFIRMED')
    RETURNING booking_id INTO v_booking_id;

    -- trg_booking_seats has now decremented available_seats and may have
    -- flipped the departure to FULL. This procedure does not touch the seat
    -- count itself — one writer, one place (ADR-02).

    -- ---- 5. Attach the travellers ------------------------------------------
    INSERT INTO booking_traveller (booking_id, traveller_id)
    SELECT v_booking_id, t
      FROM unnest(p_traveller_ids) AS t;

    -- ---- 6. Raise the money owed -------------------------------------------
    -- A PENDING payment for the full amount. Balance due is derived from these
    -- rows in v_booking_summary; it is never stored on booking.
    INSERT INTO payment (booking_id, amount, status, installment_no)
    VALUES (v_booking_id, v_total, 'PENDING', 1);

    RETURN v_booking_id;
END;
$$;

COMMENT ON FUNCTION book_package(INT, INT, INT[], INT) IS
'Creates a CONFIRMED booking atomically under a SELECT ... FOR UPDATE lock on the departure. Raises INSUFFICIENT_SEATS rather than overselling (SRS FR-10 to FR-13, NFR-02).';


-- =============================================================================
-- cancel_booking — cancel and refund                       (SRS FR-18, FR-19)
--
--   cancel_booking(booking_id, reason, employee_id)  -> void
--
-- employee_id is the agent processing the cancellation, or NULL when the
-- customer cancelled it themselves.
--
-- REFUND SCALE (agency policy, SRS FR-18). Boundaries are the part that gets
-- implemented wrongly, so they are stated explicitly:
--
--     days remaining > 30   -> 100%     (31 days: full refund)
--     15 <= days <= 30      ->  50%     (exactly 30: 50%, not 100%)
--      7 <= days <= 14      ->  25%     (exactly 15: 50%. exactly 14: 25%)
--     days < 7              ->   0%     (exactly 7: 25%. exactly 6: nothing)
--
-- Test TC-U-02 asserts the boundaries at 30, 15 and 7, not the middles.
-- =============================================================================

-- SECURITY DEFINER for the same reason as book_package: a customer may cancel
-- their booking without holding UPDATE on booking or INSERT on cancellation.
CREATE OR REPLACE FUNCTION cancel_booking(
    p_booking_id   INT,
    p_reason       TEXT,
    p_employee_id  INT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_status        VARCHAR(12);
    v_total         NUMERIC(10,2);
    v_start_date    DATE;
    v_end_date      DATE;
    v_days_left     INT;
    v_refund_pct    NUMERIC(5,4);
    v_refund        NUMERIC(10,2);
    v_penalty       NUMERIC(10,2);
BEGIN
    -- ---- 1. Lock the booking ------------------------------------------------
    -- FOR UPDATE on the booking, not on the departure: two concurrent
    -- cancellations of the SAME booking are what must be serialised here.
    SELECT b.status, b.total_amount, d.start_date, d.end_date
      INTO v_status, v_total, v_start_date, v_end_date
      FROM booking b
      JOIN departure d ON d.departure_id = b.departure_id
     WHERE b.booking_id = p_booking_id
     FOR UPDATE OF b;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'BOOKING_NOT_FOUND: booking % does not exist', p_booking_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- A finished trip cannot be cancelled (UC-10 E2).
    IF v_status = 'COMPLETED' OR v_end_date < CURRENT_DATE THEN
        RAISE EXCEPTION
            'DEPARTURE_COMPLETED: booking % is for a departure that ended on %',
            p_booking_id, v_end_date
            USING ERRCODE = 'check_violation';
    END IF;

    -- Note what is deliberately NOT here: a check for "already cancelled".
    -- The UNIQUE constraint on cancellation.booking_id enforces that at step 3,
    -- and letting it do so is the point (UC-10 E1). A check-then-insert in code
    -- has a window between the two steps in which a double-submitted form can
    -- slip through; a unique index has no such window.

    -- ---- 2. Work out the refund --------------------------------------------
    v_days_left := v_start_date - CURRENT_DATE;

    v_refund_pct := CASE
                      WHEN v_days_left > 30 THEN 1.00
                      WHEN v_days_left >= 15 THEN 0.50
                      WHEN v_days_left >=  7 THEN 0.25
                      ELSE 0.00
                    END;

    -- round() to 2 places on NUMERIC is exact. Computing money in floating
    -- point would produce refunds that do not reconcile against the total.
    v_refund  := round(v_total * v_refund_pct, 2);
    v_penalty := v_total - v_refund;

    -- ---- 3. Record the cancellation ----------------------------------------
    -- FIRST, before the status update. If this booking has already been
    -- cancelled, the unique violation aborts the transaction here — before any
    -- seat has been restored. Doing it the other way round would credit seats
    -- on a doomed transaction.
    INSERT INTO cancellation (booking_id, processed_by, reason,
                              refund_amount, penalty_amount)
    VALUES (p_booking_id, p_employee_id, p_reason, v_refund, v_penalty);

    -- ---- 4. Change the status, and let the triggers do their work -----------
    -- This single UPDATE fires both triggers:
    --   trg_booking_seats -> restores the seats IF the booking was CONFIRMED,
    --                        and returns a FULL departure to SCHEDULED
    --   trg_booking_audit -> appends the status change to booking_audit
    -- Neither is invoked from here. That is the design (ADR-02).
    UPDATE booking
       SET status = 'CANCELLED'
     WHERE booking_id = p_booking_id;

    -- ---- 5. Record the refund ----------------------------------------------
    -- Only when there is money to return: payment.amount carries a CHECK that
    -- it be positive, so a zero-refund cancellation writes no payment row.
    -- The cancellation row still records refund_amount = 0 and the full penalty,
    -- so the zero refund is explained rather than merely absent (UC-10 A1).
    IF v_refund > 0 THEN
        INSERT INTO payment (booking_id, amount, mode, transaction_ref,
                             status, installment_no)
        VALUES (p_booking_id, v_refund, NULL,
                -- A booking can be cancelled at most once, so this reference is
                -- unique by construction and satisfies uq_payment_transaction_ref.
                'REFUND-' || p_booking_id,
                'REFUNDED', 1);
    END IF;
END;
$$;

COMMENT ON FUNCTION cancel_booking(INT, TEXT, INT) IS
'Cancels a booking, computes the refund from the days-remaining scale, records the cancellation and lets the triggers restore seats and write the audit row (SRS FR-18, FR-19).';


-- =============================================================================
-- End of 06_procedures.sql — 2 stored procedures.
-- Next: 03_views.sql and 04_indexes.sql (Phase 10), 07_roles_grants.sql (Phase 5).
-- =============================================================================
