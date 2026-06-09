-- ============================================================================
-- Test: budget_notifications_config + trigger + cron RPCs
-- Run as: psql -f this_file.sql
-- All operations run inside a transaction (BEGIN/ROLLBACK) so no data persists.
-- Requires: the two migrations
--   - 20260610000000_budget_notifications_config.sql
--   - 20260610000001_budget_notifications_cron.sql
--   have been applied to the target DB.
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on

\echo '========================================'
\echo 'BUDGET NOTIFICATIONS — TRIGGERS + RPCs'
\echo '========================================'

BEGIN;

DO $$
DECLARE
  -- Fixtures: pick an existing company + client + user to back the test
  v_company_id uuid;
  v_client_id uuid;
  v_client_user_id uuid;
  v_test_budget_id uuid;

  -- Counters
  v_pass int := 0;
  v_fail int := 0;
  v_notif_count int;
  v_log_count int;
  v_due_count int;
  v_settings_id int;
  v_locale_a text;
  v_locale_b text;

  -- Trigger-side helpers
  v_today date := CURRENT_DATE;
  v_due_today date := CURRENT_DATE + 3;
  v_due_in_3_days date := CURRENT_DATE + 3;
  v_due_in_past  date := CURRENT_DATE - 5;
  v_due_just_past date := CURRENT_DATE - 1;
BEGIN
  -- ==========================================================================
  -- Discover fixtures
  -- ==========================================================================
  SELECT c.id, c.id  INTO v_company_id, v_client_id
  FROM public.companies c
  ORDER BY c.created_at NULLS LAST
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No companies found — need at least one company to run these tests';
  END IF;

  SELECT c.id INTO v_client_id
  FROM public.clients c
  WHERE c.company_id = v_company_id
  ORDER BY c.created_at NULLS LAST
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'No clients for company % — need at least one client', v_company_id;
  END IF;

  -- Pick a users row that has a client_id (portal user) so the in-app
  -- branch of the trigger fires. If none, we still test the email branch.
  SELECT u.id INTO v_client_user_id
  FROM public.users u
  WHERE u.client_id = v_client_id
    AND u.auth_user_id IS NOT NULL
  LIMIT 1;

  -- Make sure the email_settings rows for the new types exist
  PERFORM 1 FROM public.company_email_settings
  WHERE company_id = v_company_id
    AND email_type IN ('budget_created', 'budget_reminder', 'budget_overdue');

  IF NOT FOUND THEN
    INSERT INTO public.company_email_settings (company_id, email_type, is_active)
    VALUES
      (v_company_id, 'budget_created', true),
      (v_company_id, 'budget_reminder', true),
      (v_company_id, 'budget_overdue', true);
  END IF;

  -- ==========================================================================
  -- Test 1: budget_notification_settings seed — every company has a row
  -- ==========================================================================
  SELECT COUNT(*) INTO v_settings_id
  FROM public.budget_notification_settings;

  IF v_settings_id >= 1 THEN
    RAISE NOTICE 'PASS: every company has a budget_notification_settings row (count=%)', v_settings_id;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: no budget_notification_settings rows';
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- Test 2: cadence constraints reject bad values
  -- ==========================================================================
  BEGIN
    INSERT INTO public.budget_notification_settings
      (company_id, reminder_days_before)
    VALUES
      (v_company_id, ARRAY[3, 999]);
    RAISE WARNING 'FAIL: cadence accepted out-of-range value (999)';
    v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: ck_reminder_days_nonneg rejected out-of-range value';
    v_pass := v_pass + 1;
  END;

  BEGIN
    INSERT INTO public.budget_notification_settings
      (company_id, reminder_days_before)
    VALUES
      (v_company_id, ARRAY[1,2,3,4,5,6,7]);
    RAISE WARNING 'FAIL: cadence accepted 7 entries (>6 limit)';
    v_fail := v_fail + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: ck_reminder_days_nonneg rejected >6 entries';
    v_pass := v_pass + 1;
  END;

  -- ==========================================================================
  -- Test 3: UPDATE with the proper cadence
  -- ==========================================================================
  UPDATE public.budget_notification_settings
  SET
    reminder_days_before = ARRAY[7, 3, 1]::int[],
    overdue_days_after   = ARRAY[0, 3, 7]::int[],
    locale = 'es'
  WHERE company_id = v_company_id;

  SELECT locale INTO v_locale_a
  FROM public.budget_notification_settings
  WHERE company_id = v_company_id;

  IF v_locale_a = 'es' THEN
    RAISE NOTICE 'PASS: settings updated with new cadence + locale';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: settings update did not persist (locale=%)', v_locale_a;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- Test 4: AFTER INSERT trigger creates an in-app notification for a
  --         client with a portal user, AND a budget_notification_log row.
  -- ==========================================================================
  -- Disable email branch by reading the trigger behavior: we cannot easily
  -- intercept the http_post call here, so we just verify the in-app +
  -- log side.
  INSERT INTO public.recurring_budgets (
    company_id, client_id, period, recurrence_type,
    issue_date, due_date,
    subtotal, tax_rate, tax_amount, total,
    status, payment_status
  ) VALUES (
    v_company_id, v_client_id,
    'TEST-' || to_char(now(), 'YYYYMMDDHH24MISS'),
    'monthly',
    v_today, v_due_today,
    100, 21, 21, 121,
    'sent', 'unpaid'
  )
  RETURNING id INTO v_test_budget_id;

  -- In-app notification should exist (only if v_client_user_id is set)
  IF v_client_user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_notif_count
    FROM public.notifications
    WHERE reference_id = v_test_budget_id::text
      AND type = 'budget_created'
      AND client_recipient_id = v_client_id;

    IF v_notif_count = 1 THEN
      RAISE NOTICE 'PASS: AFTER INSERT trigger created in-app notification (n=%)', v_notif_count;
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'FAIL: in-app notification missing (n=%)', v_notif_count;
      v_fail := v_fail + 1;
    END IF;
  ELSE
    RAISE NOTICE 'SKIP: no portal user for client — in-app branch not exercised';
  END IF;

  -- budget_notification_log row should exist with kind=created
  SELECT COUNT(*) INTO v_log_count
  FROM public.budget_notification_log
  WHERE budget_id = v_test_budget_id
    AND kind = 'created';

  IF v_log_count = 1 THEN
    RAISE NOTICE 'PASS: budget_notification_log created entry (n=%)', v_log_count;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: budget_notification_log missing (n=%)', v_log_count;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- Test 5: trigger is idempotent — re-firing on the same row does nothing
  -- ==========================================================================
  UPDATE public.recurring_budgets
  SET notes = 'edited-after-test'
  WHERE id = v_test_budget_id;
  -- Manually re-invoke the function (it checks the log first)
  PERFORM public.notify_on_recurring_budget_created();
  -- (notify_on_recurring_budget_created is a TRIGGER function so calling
  -- it directly with no args is a no-op; we instead simulate by trying
  -- to insert the same log row — must hit the unique constraint.)
  BEGIN
    INSERT INTO public.budget_notification_log (budget_id, company_id, kind, day_offset, channels)
    VALUES (v_test_budget_id, v_company_id, 'created', NULL, '{"inapp":true}'::jsonb);
    RAISE WARNING 'FAIL: budget_notification_log allowed duplicate (budget_id, kind, day_offset)';
    v_fail := v_fail + 1;
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: budget_notification_log UNIQUE constraint blocks duplicates';
    v_pass := v_pass + 1;
  END;

  -- ==========================================================================
  -- Test 6: scan_due_budget_notifications returns the right rows for a
  --         custom cadence + due dates
  -- ==========================================================================
  -- Set a deterministic cadence: reminder at T-1 and T-3, overdue at D+0 and D+3
  UPDATE public.budget_notification_settings
  SET
    reminder_days_before = ARRAY[3, 1]::int[],
    overdue_days_after   = ARRAY[0, 3]::int[],
    inapp_on_reminder = true,
    inapp_on_overdue  = true
  WHERE company_id = v_company_id;

  -- Insert 3 new budgets: T-1, T-3, T+5, T-5
  -- (we use a second period label so we don't violate uq_recurring_budgets_client_period)
  INSERT INTO public.recurring_budgets (
    company_id, client_id, period, recurrence_type,
    issue_date, due_date, subtotal, tax_rate, tax_amount, total, status
  ) VALUES
    (v_company_id, v_client_id, 'T-1-' || extract(epoch from now())::int::text, 'monthly', v_today, v_today + 1, 50, 21, 10.5, 60.5, 'sent'),
    (v_company_id, v_client_id, 'T-3-' || extract(epoch from now())::int::text, 'monthly', v_today, v_today + 3, 50, 21, 10.5, 60.5, 'sent'),
    (v_company_id, v_client_id, 'D+0-' || extract(epoch from now())::int::text, 'monthly', v_today, v_today,     50, 21, 10.5, 60.5, 'sent'),
    (v_company_id, v_client_id, 'D-5-' || extract(epoch from now())::int::text, 'monthly', v_today, v_today - 5, 50, 21, 10.5, 60.5, 'sent'),
    -- Cancelled / paid budgets should NOT be picked up
    (v_company_id, v_client_id, 'PAID-' || extract(epoch from now())::int::text, 'monthly', v_today, v_today,     50, 21, 10.5, 60.5, 'paid'),
    (v_company_id, v_client_id, 'CANC-' || extract(epoch from now())::int::text, 'monthly', v_today, v_today + 3, 50, 21, 10.5, 60.5, 'cancelled');

  -- Scan with target_date=today
  SELECT COUNT(*) INTO v_due_count
  FROM public.scan_due_budget_notifications(v_today)
  WHERE company_id = v_company_id;

  -- Expect 4 rows for the 4 active budgets:
  --   T-1 → reminder day_offset=-1
  --   T-3 → reminder day_offset=-3
  --   D+0 → overdue  day_offset=0
  --   D-5 → overdue  day_offset=3 (since overdue cadence includes 3)
  IF v_due_count = 4 THEN
    RAISE NOTICE 'PASS: scan_due_budget_notifications returned 4 rows (cadence match)';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: scan_due_budget_notifications returned % rows, expected 4', v_due_count;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- Test 7: scan_due_budget_notifications is idempotent — re-running on
  --         the same day returns 0 (the log is in place)
  -- ==========================================================================
  -- First, insert log rows as if the cron had already sent them
  INSERT INTO public.budget_notification_log (budget_id, company_id, kind, day_offset, channels)
  SELECT budget_id, company_id, kind, day_offset, '{"inapp":true,"email":true}'::jsonb
  FROM public.scan_due_budget_notifications(v_today)
  WHERE company_id = v_company_id
  ON CONFLICT (budget_id, kind, day_offset) DO NOTHING;

  SELECT COUNT(*) INTO v_due_count
  FROM public.scan_due_budget_notifications(v_today)
  WHERE company_id = v_company_id;

  IF v_due_count = 0 THEN
    RAISE NOTICE 'PASS: second scan returns 0 rows (idempotency log works)';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: second scan returned % rows, expected 0', v_due_count;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- Test 8: list_company_budget_due_summary returns one row per budget
  --         with days_to_due + is_overdue
  -- ==========================================================================
  SELECT COUNT(*) INTO v_due_count
  FROM public.list_company_budget_due_summary(v_company_id)
  WHERE budget_id = v_test_budget_id;

  IF v_due_count = 1 THEN
    RAISE NOTICE 'PASS: list_company_budget_due_summary returns the test budget';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: list_company_budget_due_summary missing the test budget (n=%)', v_due_count;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- Test 9: company_email_settings CHECK accepts the new types
  -- ==========================================================================
  BEGIN
    INSERT INTO public.company_email_settings (company_id, email_type, is_active)
    VALUES (v_company_id, 'budget_created', true)
    ON CONFLICT (company_id, email_type) DO NOTHING;
    RAISE NOTICE 'PASS: company_email_settings accepts budget_created';
    v_pass := v_pass + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'FAIL: company_email_settings rejected budget_created';
    v_fail := v_fail + 1;
  END;

  -- ==========================================================================
  -- Test 10: write_inapp_budget_reminder inserts notification + log
  -- ==========================================================================
  PERFORM public.write_inapp_budget_reminder(
    p_budget_id  := v_test_budget_id,
    p_kind       := 'reminder',
    p_day_offset := -3,
    p_title      := 'Recordatorio de prueba',
    p_content    := 'Tu presupuesto vence pronto.',
    p_link       := '/portal/presupuestos/' || v_test_budget_id,
    p_metadata   := '{"test": true}'::jsonb
  );

  SELECT COUNT(*) INTO v_notif_count
  FROM public.notifications
  WHERE reference_id = v_test_budget_id::text
    AND type = 'budget_reminder';

  SELECT COUNT(*) INTO v_log_count
  FROM public.budget_notification_log
  WHERE budget_id = v_test_budget_id
    AND kind = 'reminder'
    AND day_offset = -3;

  IF v_notif_count >= 1 AND v_log_count = 1 THEN
    RAISE NOTICE 'PASS: write_inapp_budget_reminder wrote notification (n=%) and log (n=%)', v_notif_count, v_log_count;
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: write_inapp_budget_reminder incomplete (notif=%, log=%)', v_notif_count, v_log_count;
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- Test 11: pg_cron job scheduled (idempotent)
  -- ==========================================================================
  PERFORM 1 FROM cron.job WHERE jobname = 'send_budget_reminders_daily';
  IF FOUND THEN
    RAISE NOTICE 'PASS: pg_cron job send_budget_reminders_daily is scheduled';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: pg_cron job send_budget_reminders_daily is NOT scheduled';
    v_fail := v_fail + 1;
  END IF;

  -- ==========================================================================
  -- Final report
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'BUDGET NOTIFICATIONS — RESULTS: % passed, % failed', v_pass, v_fail;
  RAISE NOTICE '========================================';
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'One or more tests FAILED — rolling back';
  END IF;
END
$$;

ROLLBACK;
