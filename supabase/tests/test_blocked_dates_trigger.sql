-- ============================================================================
-- Test: professional_blocked_dates trigger validation
-- Run as: psql -f this_file.sql
-- All operations run inside a transaction (BEGIN/ROLLBACK) so no data persists.
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on

\echo '========================================'
\echo 'TRIGGER VALIDATION TESTS'
\echo '========================================'

BEGIN;

-- Grab a real professional, company, and service for test fixtures
DO $$
DECLARE
  v_professional_id uuid;
  v_company_id uuid;
  v_service_id uuid;
  v_booking_id uuid;
  v_blocked_date_id uuid;
  v_test_start timestamptz;
  v_test_end timestamptz;
  v_conflict_id uuid;
  v_err_text text;
  v_err_code text;
  v_pass integer := 0;
  v_fail integer := 0;
BEGIN
  -- Pick a professional that has services
  SELECT p.id, p.company_id INTO v_professional_id, v_company_id
  FROM professionals p
  WHERE EXISTS (SELECT 1 FROM professional_services ps WHERE ps.professional_id = p.id)
  LIMIT 1;

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'No professional with services found — cannot run tests';
  END IF;

  SELECT s.id INTO v_service_id
  FROM services s
  JOIN professional_services ps ON ps.service_id = s.id
  WHERE ps.professional_id = v_professional_id
  LIMIT 1;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'No service found for professional — cannot run tests';
  END IF;

  RAISE NOTICE 'Test fixtures: professional=%, company=%, service=%', v_professional_id, v_company_id, v_service_id;

  -- ==========================================================================
  -- TEST 1: Blocked Date — INSERT should FAIL
  -- ==========================================================================
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 1: Creating booking on blocked date → should RAISE EXCEPTION';

  -- Create a professional blocked date covering tomorrow
  INSERT INTO professional_blocked_dates (professional_id, company_id, start_date, end_date, all_day, reason)
  VALUES (v_professional_id, v_company_id, CURRENT_DATE + 1, CURRENT_DATE + 1, true, 'Test: vacaciones')
  RETURNING id INTO v_blocked_date_id;

  RAISE NOTICE '  Created blocked date: %', v_blocked_date_id;

  v_test_start := (CURRENT_DATE + 1)::timestamptz + TIME '09:00';
  v_test_end   := (CURRENT_DATE + 1)::timestamptz + TIME '10:00';

  BEGIN
    INSERT INTO bookings (professional_id, company_id, service_id, start_time, end_time, status, customer_name, source, session_type)
    VALUES (v_professional_id, v_company_id, v_service_id, v_test_start, v_test_end, 'confirmed', 'Test Customer', 'admin', 'presencial')
    RETURNING id INTO v_booking_id;

    RAISE WARNING 'TEST 1 FAILED: Insert succeeded but should have raised an exception';
    v_fail := v_fail + 1;
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    IF v_err_text LIKE 'BlockedDateConflict%' THEN
      RAISE NOTICE 'TEST 1 PASSED: Got expected error: %', v_err_text;
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'TEST 1 FAILED: Wrong error message: %', v_err_text;
      v_fail := v_fail + 1;
    END IF;
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 1 FAILED: Unexpected exception: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- ==========================================================================
  -- TEST 1b: Booking OUTSIDE blocked date — INSERT should SUCCEED
  -- ==========================================================================
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 1b: Creating booking outside blocked date → should SUCCEED';

  v_test_start := (CURRENT_DATE + 2)::timestamptz + TIME '09:00';
  v_test_end   := (CURRENT_DATE + 2)::timestamptz + TIME '10:00';

  BEGIN
    INSERT INTO bookings (professional_id, company_id, service_id, start_time, end_time, status, customer_name, source, session_type)
    VALUES (v_professional_id, v_company_id, v_service_id, v_test_start, v_test_end, 'confirmed', 'Test Customer', 'admin', 'presencial')
    RETURNING id INTO v_booking_id;

    RAISE NOTICE 'TEST 1b PASSED: Booking outside block created: %', v_booking_id;
    v_pass := v_pass + 1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 1b FAILED: Insert outside block raised exception: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- ==========================================================================
  -- TEST 2: UPDATE reasignar a fecha bloqueada — should FAIL
  -- ==========================================================================
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 2: Reassigning booking to blocked date → should RAISE EXCEPTION';

  BEGIN
    UPDATE bookings
    SET start_time = (CURRENT_DATE + 1)::timestamptz + TIME '11:00',
        end_time   = (CURRENT_DATE + 1)::timestamptz + TIME '12:00'
    WHERE id = v_booking_id;

    RAISE WARNING 'TEST 2 FAILED: Update succeeded but should have raised an exception';
    v_fail := v_fail + 1;
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    IF v_err_text LIKE 'BlockedDateConflict%' THEN
      RAISE NOTICE 'TEST 2 PASSED: Got expected error: %', v_err_text;
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'TEST 2 FAILED: Wrong error message: %', v_err_text;
      v_fail := v_fail + 1;
    END IF;
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 2 FAILED: Unexpected exception: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- ==========================================================================
  -- TEST 3: Double-booking — INSERT should FAIL
  -- ==========================================================================
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 3: Double-booking (overlapping time, same professional) → should RAISE EXCEPTION';

  -- Create a second booking at the same time as the one from test 1b (day 2, 9:00-10:00)
  v_test_start := (CURRENT_DATE + 2)::timestamptz + TIME '09:00';
  v_test_end   := (CURRENT_DATE + 2)::timestamptz + TIME '10:00';

  BEGIN
    INSERT INTO bookings (professional_id, company_id, service_id, start_time, end_time, status, customer_name, source, session_type)
    VALUES (v_professional_id, v_company_id, v_service_id, v_test_start, v_test_end, 'confirmed', 'Test Customer', 'admin', 'presencial')
    RETURNING id INTO v_conflict_id;

    RAISE WARNING 'TEST 3 FAILED: Double-booking insert succeeded but should have raised an exception';
    v_fail := v_fail + 1;
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    IF v_err_text LIKE 'DoubleBookingConflict%' THEN
      RAISE NOTICE 'TEST 3 PASSED: Got expected error: %', v_err_text;
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'TEST 3 FAILED: Wrong error message: %', v_err_text;
      v_fail := v_fail + 1;
    END IF;
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 3 FAILED: Unexpected exception on double-booking: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- ==========================================================================
  -- TEST 3b: Non-overlapping booking — INSERT should SUCCEED
  -- ==========================================================================
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 3b: Non-overlapping booking (different time) → should SUCCEED';

  v_test_start := (CURRENT_DATE + 2)::timestamptz + TIME '11:00';
  v_test_end   := (CURRENT_DATE + 2)::timestamptz + TIME '12:00';

  BEGIN
    INSERT INTO bookings (professional_id, company_id, service_id, start_time, end_time, status, customer_name, source, session_type)
    VALUES (v_professional_id, v_company_id, v_service_id, v_test_start, v_test_end, 'confirmed', 'Test Customer', 'admin', 'presencial')
    RETURNING id INTO v_conflict_id;

    RAISE NOTICE 'TEST 3b PASSED: Non-overlapping booking created: %', v_conflict_id;
    v_pass := v_pass + 1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 3b FAILED: Non-overlapping insert raised exception: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- ==========================================================================
  -- TEST 4: UPDATE non-date-change should skip trigger (no-op UPDATE)
  -- ==========================================================================
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 4: UPDATE without changing professional/date → should succeed (trigger skips)';

  BEGIN
    UPDATE bookings
    SET status = 'confirmed'  -- status already 'confirmed', so no real change
    WHERE id = v_booking_id;

    RAISE NOTICE 'TEST 4 PASSED: No-op update did not trigger rejection';
    v_pass := v_pass + 1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 4 FAILED: Sibling update raised exception: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- ==========================================================================
  -- SUMMARY
  -- ==========================================================================
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RESULTS: % passed, % failed', v_pass, v_fail;
  RAISE NOTICE '========================================';

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'TESTS FAILED: % failures', v_fail;
  END IF;
END;
$$;

-- Always rollback so no test data is committed to the database
ROLLBACK;

\echo 'Done (rolled back, no data persisted).'
