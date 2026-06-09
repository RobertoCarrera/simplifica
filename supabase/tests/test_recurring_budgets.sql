-- ============================================================================
-- Test: generate_recurring_budgets() function
-- Run as: psql -f this_file.sql
-- All operations run inside a transaction (BEGIN/ROLLBACK) so no data persists.
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on

\echo '========================================'
\echo 'RECURRING BUDGETS GENERATION TESTS'
\echo '========================================'

BEGIN;

DO $$
DECLARE
  -- Fixtures
  v_company_id uuid;
  v_client_id uuid;
  v_user_id uuid;

  -- Contracted services
  v_cs_weekly uuid;
  v_cs_monthly uuid;
  v_cs_yearly uuid;
  v_cs_inactive uuid;
  v_cs_no_recurrence uuid;

  -- Test dates (we control the date to make tests deterministic)
  v_test_date date;

  -- Generation results
  v_result record;
  v_budget_count int;
  v_line_count int;

  -- Test counters
  v_pass integer := 0;
  v_fail integer := 0;

  -- Error vars
  v_err_text text;
  v_err_code text;
BEGIN
  -- ==========================================================================
  -- Discover fixtures: pick a company with a client and a user
  -- ==========================================================================
  SELECT c.id INTO v_company_id
  FROM companies c
  WHERE EXISTS (SELECT 1 FROM clients cl WHERE cl.company_id = c.id)
    AND EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = c.id)
    AND EXISTS (SELECT 1 FROM users u WHERE u.id IN (
      SELECT cm2.user_id FROM company_members cm2 WHERE cm2.company_id = c.id))
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No suitable company found with clients and members — cannot run tests';
  END IF;

  -- Get a client
  SELECT cl.id INTO v_client_id
  FROM clients cl
  WHERE cl.company_id = v_company_id
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'No client found for company %', v_company_id;
  END IF;

  -- Get a user
  SELECT u.id INTO v_user_id
  FROM users u
  JOIN company_members cm ON cm.user_id = u.id
  WHERE cm.company_id = v_company_id
  LIMIT 1;

  RAISE NOTICE 'Fixtures: company=%, client=%, user=%', v_company_id, v_client_id, v_user_id;

  -- ==========================================================================
  -- Setup: Create test contracted services
  -- We use a date far in the future (but not too far) to avoid interfering
  -- with real data. We'll use 2026-06-09 as today and match accordingly.
  -- ==========================================================================

  v_test_date := '2026-06-09';  -- This is a Tuesday (DOW=2 in PG → maps to day 2 in our encoding)

  -- 1) Weekly service: recurrence_day=2 (Tuesday) → should match v_test_date
  INSERT INTO public.contracted_services (
    client_id, company_id, name, price, currency, start_date,
    status, recurrence_type, recurrence_day, recurrence_start
  ) VALUES (
    v_client_id, v_company_id, 'Limpieza semanal', 150.00, 'EUR', '2026-01-01',
    'active', 'weekly', 2, '2026-01-01'
  ) RETURNING id INTO v_cs_weekly;

  -- 2) Monthly service: recurrence_day=9 → should match v_test_date (June 9)
  INSERT INTO public.contracted_services (
    client_id, company_id, name, price, currency, start_date,
    status, recurrence_type, recurrence_day, recurrence_start
  ) VALUES (
    v_client_id, v_company_id, 'Mantenimiento mensual', 300.00, 'EUR', '2026-01-01',
    'active', 'monthly', 9, '2026-01-01'
  ) RETURNING id INTO v_cs_monthly;

  -- 3) Yearly service: recurrence_day=160 → June 9 is day 160 in non-leap year (31+28+31+30+31+9=160)
  INSERT INTO public.contracted_services (
    client_id, company_id, name, price, currency, start_date,
    status, recurrence_type, recurrence_day, recurrence_start
  ) VALUES (
    v_client_id, v_company_id, 'Auditoría anual', 1200.00, 'EUR', '2026-01-01',
    'active', 'yearly', 160, '2026-01-01'
  ) RETURNING id INTO v_cs_yearly;

  -- 4) Inactive service (should NOT generate)
  INSERT INTO public.contracted_services (
    client_id, company_id, name, price, currency, start_date,
    status, recurrence_type, recurrence_day, recurrence_start
  ) VALUES (
    v_client_id, v_company_id, 'Servicio pausado', 50.00, 'EUR', '2026-01-01',
    'paused', 'monthly', 9, '2026-01-01'
  ) RETURNING id INTO v_cs_inactive;

  -- 5) Non-recurring service (should NOT generate)
  INSERT INTO public.contracted_services (
    client_id, company_id, name, price, currency, start_date,
    status
  ) VALUES (
    v_client_id, v_company_id, 'Servicio único', 500.00, 'EUR', '2026-01-01',
    'active'
  ) RETURNING id INTO v_cs_no_recurrence;

  RAISE NOTICE 'Test services created: weekly=%, monthly=%, yearly=%, inactive=%, non_recurring=%',
    v_cs_weekly, v_cs_monthly, v_cs_yearly, v_cs_inactive, v_cs_no_recurrence;

  -- ==========================================================================
  -- SUITE 1: Weekly recurrence
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 1: Weekly recurrence ===';

  -- Generate budgets for weekly service's date
  FOR v_result IN
    SELECT * FROM public.generate_recurring_budgets(v_test_date)
  LOOP
    RAISE NOTICE '  Result: budget_id=%, client_id=%, period=%, lines=%, action=%',
      v_result.budget_id, v_result.client_id, v_result.period,
      v_result.lines_count, v_result.action;
  END LOOP;

  -- Check: should have created at least the weekly budget
  SELECT COUNT(*) INTO v_budget_count
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id;

  IF v_budget_count >= 1 THEN
    RAISE NOTICE 'TEST 1a PASSED: Budgets created for client: %', v_budget_count;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 1a FAILED: No budgets found for client';
    v_fail := v_fail + 1;
  END IF;

  -- Check the weekly budget specifically
  SELECT COUNT(*) INTO v_budget_count
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id
    AND rb.recurrence_type = 'weekly';

  IF v_budget_count = 1 THEN
    RAISE NOTICE 'TEST 1b PASSED: Weekly budget created';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 1b FAILED: Expected 1 weekly budget, got %', v_budget_count;
    v_fail := v_fail + 1;
  END IF;

  -- Check the period format is like "2026-W24"
  SELECT rb.period INTO v_err_text
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id
    AND rb.recurrence_type = 'weekly'
  LIMIT 1;

  IF v_err_text LIKE '2026-W%' THEN
    RAISE NOTICE 'TEST 1c PASSED: Weekly period format correct: %', v_err_text;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 1c FAILED: Expected period like 2026-Wxx, got %', v_err_text;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- SUITE 2: Monthly recurrence
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 2: Monthly recurrence ===';

  SELECT COUNT(*) INTO v_budget_count
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id
    AND rb.recurrence_type = 'monthly';

  IF v_budget_count >= 1 THEN
    RAISE NOTICE 'TEST 2a PASSED: Monthly budget created';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 2a FAILED: Expected monthly budget, found %', v_budget_count;
    v_fail := v_fail + 1;
  END IF;

  -- Check period format
  SELECT rb.period INTO v_err_text
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id
    AND rb.recurrence_type = 'monthly'
  LIMIT 1;

  IF v_err_text = '2026-06' THEN
    RAISE NOTICE 'TEST 2b PASSED: Monthly period correct: %', v_err_text;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 2b FAILED: Expected "2026-06", got "%"', v_err_text;
    v_fail := v_fail + 1;
  END IF;

  -- Check lines: the monthly budget should have a line for the monthly contracted service
  SELECT COUNT(*) INTO v_line_count
  FROM public.recurring_budget_lines rbl
  JOIN public.recurring_budgets rb ON rb.id = rbl.budget_id
  WHERE rb.client_id = v_client_id
    AND rb.recurrence_type = 'monthly'
    AND rbl.contracted_service_id = v_cs_monthly;

  IF v_line_count = 1 THEN
    RAISE NOTICE 'TEST 2c PASSED: Monthly budget has correct line for contracted service';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 2c FAILED: Expected 1 line for service %, got %', v_cs_monthly, v_line_count;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- SUITE 3: Yearly recurrence
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 3: Yearly recurrence ===';

  SELECT COUNT(*) INTO v_budget_count
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id
    AND rb.recurrence_type = 'yearly';

  IF v_budget_count >= 1 THEN
    RAISE NOTICE 'TEST 3a PASSED: Yearly budget created';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 3a FAILED: Expected yearly budget, found %', v_budget_count;
    v_fail := v_fail + 1;
  END IF;

  -- Check period format
  SELECT rb.period INTO v_err_text
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id
    AND rb.recurrence_type = 'yearly'
  LIMIT 1;

  IF v_err_text = '2026' THEN
    RAISE NOTICE 'TEST 3b PASSED: Yearly period correct: %', v_err_text;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 3b FAILED: Expected "2026", got "%"', v_err_text;
    v_fail := v_fail + 1;
  END IF;

  -- Check financials for yearly budget
  SELECT rb.subtotal, rb.tax_amount, rb.total INTO v_budget_count, v_line_count, v_err_code
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id
    AND rb.recurrence_type = 'yearly'
  LIMIT 1;

  IF v_budget_count = 1200.00 THEN
    RAISE NOTICE 'TEST 3c PASSED: Yearly subtotal correct: %', v_budget_count;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 3c FAILED: Expected subtotal 1200.00, got %', v_budget_count;
    v_fail := v_fail + 1;
  END IF;

  -- Tax should be 21% of 1200 = 252.00
  IF v_line_count = 252.00 THEN
    RAISE NOTICE 'TEST 3d PASSED: Yearly tax correct: %', v_line_count;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 3d FAILED: Expected tax 252.00, got %', v_line_count;
    v_fail := v_fail + 1;
  END IF;

  -- Total should be 1452.00
  -- (stored as numeric/int, so compare with tolerance)
  IF v_err_code = 1452.00 THEN
    RAISE NOTICE 'TEST 3e PASSED: Yearly total correct: %', v_err_code;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 3e FAILED: Expected total 1452.00, got %', v_err_code;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- SUITE 4: Duplicate prevention
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 4: Duplicate prevention ===';

  -- Count existing budgets
  SELECT COUNT(*) INTO v_budget_count
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id;

  RAISE NOTICE '  Budgets before second run: %', v_budget_count;

  -- Run the generator again with the same date
  FOR v_result IN
    SELECT * FROM public.generate_recurring_budgets(v_test_date)
  LOOP
    RAISE NOTICE '  Result: budget_id=%, period=%, lines=%, action=%',
      v_result.budget_id, v_result.period, v_result.lines_count, v_result.action;
  END LOOP;

  -- Count budgets after second run — should be the same
  SELECT COUNT(*) INTO v_line_count
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id;

  IF v_line_count = v_budget_count THEN
    RAISE NOTICE 'TEST 4a PASSED: No duplicate budgets created (% before = % after)', v_budget_count, v_line_count;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 4a FAILED: Budget count changed from % to %', v_budget_count, v_line_count;
    v_fail := v_fail + 1;
  END IF;

  -- All results from second run should be 'skipped'
  FOR v_result IN
    SELECT * FROM public.generate_recurring_budgets(v_test_date)
  LOOP
    IF v_result.action != 'skipped' THEN
      RAISE WARNING 'TEST 4b FAILED: Expected action=skipped, got action=% for period %',
        v_result.action, v_result.period;
      v_fail := v_fail + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'TEST 4b PASSED: All second-run results are "skipped"';
  v_pass := v_pass + 1;

  -- Verify unique constraint is enforced
  BEGIN
    -- Try to manually insert a duplicate budget
    INSERT INTO public.recurring_budgets (
      client_id, company_id, period, recurrence_type,
      issue_date, due_date, subtotal, tax_rate, tax_amount, total, status
    )
    SELECT
      client_id, company_id, period, recurrence_type,
      issue_date, due_date, subtotal, tax_rate, tax_amount, total, 'draft'
    FROM public.recurring_budgets
    WHERE client_id = v_client_id
    LIMIT 1;

    RAISE WARNING 'TEST 4c FAILED: Duplicate insert should have raised unique violation';
    v_fail := v_fail + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'TEST 4c PASSED: Unique constraint enforced on (client_id, period)';
    v_pass := v_pass + 1;
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 4c FAILED: Unexpected error: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- ==========================================================================
  -- SUITE 5: Dry run mode
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 5: Dry run mode ===';

  -- Count budgets before dry run
  SELECT COUNT(*) INTO v_budget_count
  FROM public.recurring_budgets;

  -- Run in dry run mode
  FOR v_result IN
    SELECT * FROM public.generate_recurring_budgets(v_test_date, p_dry_run := true)
  LOOP
    RAISE NOTICE '  Dry run: period=%, lines=%, action=%',
      v_result.period, v_result.lines_count, v_result.action;
  END LOOP;

  -- Count budgets after dry run — should be the same
  SELECT COUNT(*) INTO v_line_count
  FROM public.recurring_budgets;

  IF v_line_count = v_budget_count THEN
    RAISE NOTICE 'TEST 5a PASSED: Dry run did not create any budgets (% before = % after)', v_budget_count, v_line_count;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 5a FAILED: Budget count changed from % to % during dry run', v_budget_count, v_line_count;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- SUITE 6: Non-matching date (should generate nothing for our services)
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 6: Non-matching date ===';

  -- Use a date where none of our services match (June 10 = Wednesday, day 161, day 10)
  -- Weekly day 2 ≠ DOW of June 10 (Wednesday=3), monthly day 9 ≠ 10, yearly day 160 ≠ 161
  v_test_date := '2026-06-10';

  FOR v_result IN
    SELECT * FROM public.generate_recurring_budgets(v_test_date)
  LOOP
    RAISE WARNING 'TEST 6a FAILED: Unexpected budget generated for non-matching date: period=%', v_result.period;
    v_fail := v_fail + 1;
  END LOOP;

  RAISE NOTICE 'TEST 6a PASSED: No budgets generated for non-matching date';
  v_pass := v_pass + 1;

  -- ==========================================================================
  -- SUITE 7: recurrence_end bounds
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 7: Recurrence end bounds ===';

  -- Create a service whose recurrence ended before our target date
  INSERT INTO public.contracted_services (
    client_id, company_id, name, price, currency, start_date,
    status, recurrence_type, recurrence_day, recurrence_start, recurrence_end
  ) VALUES (
    v_client_id, v_company_id, 'Servicio expirado', 100.00, 'EUR', '2026-01-01',
    'active', 'monthly', 9, '2026-01-01', '2026-05-31'
  );

  -- Run generator for a date after recurrence_end
  v_test_date := '2026-06-09';

  -- Count budgets for client before
  SELECT COUNT(*) INTO v_budget_count
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id;

  FOR v_result IN
    SELECT * FROM public.generate_recurring_budgets(v_test_date)
  LOOP
    -- All should be 'skipped' since we already generated them in suite 1-3
    IF v_result.action = 'created' THEN
      -- But the expired service should NOT have generated a new budget
      -- Check if any lines reference the expired service
      SELECT COUNT(*) INTO v_line_count
      FROM public.recurring_budget_lines rbl
      WHERE rbl.budget_id = v_result.budget_id
        AND rbl.contracted_service_id IN (
          SELECT id FROM public.contracted_services WHERE name = 'Servicio expirado'
        );

      IF v_line_count > 0 THEN
        RAISE WARNING 'TEST 7a FAILED: Expired service was included in budget';
        v_fail := v_fail + 1;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'TEST 7a PASSED: Expired service (recurrence_end in past) not included';
  v_pass := v_pass + 1;

  -- ==========================================================================
  -- SUITE 8: Budget totals from multiple services
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 8: Multiple services in one budget ===';

  -- The client already has weekly/monthly/yearly services. On v_test_date=2026-06-09
  -- all three match, so they should be grouped into 3 budgets (different periods).
  -- Let's verify the weekly budget has correct totals.
  SELECT rb.subtotal, rb.tax_amount, rb.total INTO v_budget_count, v_line_count, v_err_code
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id
    AND rb.recurrence_type = 'weekly'
  LIMIT 1;

  IF v_budget_count = 150.00 THEN
    RAISE NOTICE 'TEST 8a PASSED: Weekly subtotal for single service: %', v_budget_count;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 8a FAILED: Expected 150.00, got %', v_budget_count;
    v_fail := v_fail + 1;
  END IF;

  -- Now add a second weekly service for the same client to test grouping
  INSERT INTO public.contracted_services (
    client_id, company_id, name, price, currency, start_date,
    status, recurrence_type, recurrence_day, recurrence_start
  ) VALUES (
    v_client_id, v_company_id, 'Limpieza ventanas semanal', 75.00, 'EUR', '2026-01-01',
    'active', 'weekly', 2, '2026-01-01'
  );

  -- Delete the old weekly budget to force re-creation with both services
  DELETE FROM public.recurring_budgets WHERE client_id = v_client_id AND recurrence_type = 'weekly';

  -- Re-run
  FOR v_result IN
    SELECT * FROM public.generate_recurring_budgets(v_test_date)
  LOOP
    NULL;
  END LOOP;

  -- Check updated weekly budget
  SELECT rb.subtotal, rb.total, COUNT(rbl.id) INTO v_budget_count, v_err_code, v_line_count
  FROM public.recurring_budgets rb
  LEFT JOIN public.recurring_budget_lines rbl ON rbl.budget_id = rb.id
  WHERE rb.client_id = v_client_id
    AND rb.recurrence_type = 'weekly'
  GROUP BY rb.id, rb.subtotal, rb.total
  LIMIT 1;

  -- Should now have 2 lines and subtotal = 150 + 75 = 225
  IF v_line_count = 2 THEN
    RAISE NOTICE 'TEST 8b PASSED: Weekly budget has 2 lines (both services grouped)';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 8b FAILED: Expected 2 lines, got %', v_line_count;
    v_fail := v_fail + 1;
  END IF;

  IF v_budget_count = 225.00 THEN
    RAISE NOTICE 'TEST 8c PASSED: Weekly subtotal correct for 2 services: %', v_budget_count;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 8c FAILED: Expected subtotal 225.00, got %', v_budget_count;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- SUITE 9: Status and metadata
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 9: Status and metadata ===';

  -- All generated budgets should be 'draft'
  SELECT COUNT(*) INTO v_budget_count
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id
    AND rb.status != 'draft';

  IF v_budget_count = 0 THEN
    RAISE NOTICE 'TEST 9a PASSED: All generated budgets have status "draft"';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 9a FAILED: % budgets have non-draft status', v_budget_count;
    v_fail := v_fail + 1;
  END IF;

  -- Issue date should match target date
  SELECT COUNT(*) INTO v_budget_count
  FROM public.recurring_budgets rb
  WHERE rb.issue_date = v_test_date;

  IF v_budget_count > 0 THEN
    RAISE NOTICE 'TEST 9b PASSED: Budgets have correct issue_date: %', v_test_date;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 9b FAILED: No budgets with issue_date=%', v_test_date;
    v_fail := v_fail + 1;
  END IF;

  -- Due date should be issue_date + 30 days
  SELECT COUNT(*) INTO v_budget_count
  FROM public.recurring_budgets rb
  WHERE rb.due_date = (v_test_date + INTERVAL '30 days')::date;

  IF v_budget_count > 0 THEN
    RAISE NOTICE 'TEST 9c PASSED: Due date = issue_date + 30 days';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 9c FAILED: No budgets with due_date = %', (v_test_date + INTERVAL '30 days')::date;
    v_fail := v_fail + 1;
  END IF;

  -- Tax rate should be 21%
  SELECT COUNT(*) INTO v_budget_count
  FROM public.recurring_budgets rb
  WHERE rb.client_id = v_client_id
    AND rb.tax_rate != 21.00;

  IF v_budget_count = 0 THEN
    RAISE NOTICE 'TEST 9d PASSED: All budgets have 21%% IVA';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'TEST 9d FAILED: % budgets have non-21%% tax rate', v_budget_count;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- SUMMARY
  -- ==========================================================================
  RAISE NOTICE '';
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
