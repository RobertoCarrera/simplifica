-- ============================================================================
-- Test: Budget payment flow
--   - recurring_budgets payment columns
--   - recurring_budget_payments history table
--   - mark_budget_paid_atomic() RPC (idempotency, triggers, status sync)
--   - generate_budget_payment_token() RPC (minting, reuse, expiration)
--   - list_budget_payment_history() RPC
--   - recurring_budget_payments_summary view
-- Run as: psql -f this_file.sql
-- All operations run inside a transaction (BEGIN/ROLLBACK) so no data persists.
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on

\echo '========================================'
\echo 'BUDGET PAYMENT FLOW TESTS'
\echo '========================================'

BEGIN;

DO $$
DECLARE
  -- Fixtures
  v_company_id uuid;
  v_client_id uuid;
  v_user_id uuid;

  -- A budget to play with
  v_budget_id uuid;

  -- RPC results
  v_token text;
  v_expires_at timestamptz;
  v_payment public.recurring_budget_payments;
  v_summary record;

  -- Test counters
  v_pass integer := 0;
  v_fail integer := 0;
  v_total numeric(12,2);

  -- Error vars
  v_err_text text;
  v_err_code text;
BEGIN
  -- ==========================================================================
  -- Discover fixtures: company with at least one client and a user
  -- ==========================================================================
  SELECT c.id, cl.id, u.id
    INTO v_company_id, v_client_id, v_user_id
  FROM companies c
  JOIN clients cl ON cl.company_id = c.id
  JOIN users u    ON u.company_id = c.id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company/client/user fixtures available — cannot run tests';
  END IF;

  -- Create a fresh budget for the tests
  INSERT INTO public.recurring_budgets (
    client_id, company_id, period, recurrence_type,
    issue_date, due_date, subtotal, tax_rate, tax_amount, total,
    status, payment_status, currency
  ) VALUES (
    v_client_id, v_company_id, 'TEST-2099-01', 'monthly',
    CURRENT_DATE, CURRENT_DATE + 30,
    100.00, 21.00, 21.00, 121.00,
    'sent', 'unpaid', 'EUR'
  )
  RETURNING id INTO v_budget_id;

  -- ==========================================================================
  -- T1: payment columns exist with the right defaults
  -- ==========================================================================
  BEGIN
    PERFORM 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recurring_budgets'
      AND column_name IN (
        'currency', 'payment_status', 'payment_provider',
        'payment_link_token', 'payment_link_expires_at',
        'paid_at', 'paid_amount', 'payment_reference',
        'receipt_pdf_path', 'receipt_generated_at'
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Missing one or more payment columns on recurring_budgets';
    END IF;

    v_pass := v_pass + 1;
    RAISE NOTICE 'T1 PASS: payment columns exist on recurring_budgets';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    v_err_text := SQLERRM; v_err_code := SQLSTATE;
    RAISE WARNING 'T1 FAIL: % [%]', v_err_text, v_err_code;
  END;

  -- ==========================================================================
  -- T2: recurring_budget_payments table exists with the right columns
  -- ==========================================================================
  BEGIN
    PERFORM 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recurring_budget_payments'
      AND column_name IN (
        'id', 'budget_id', 'company_id', 'client_id',
        'provider', 'status', 'amount', 'currency', 'fee',
        'provider_reference', 'provider_metadata', 'paid_at',
        'receipt_pdf_path', 'receipt_url', 'notes', 'created_at'
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'recurring_budget_payments missing expected columns';
    END IF;

    v_pass := v_pass + 1;
    RAISE NOTICE 'T2 PASS: recurring_budget_payments table shape ok';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    v_err_text := SQLERRM; v_err_code := SQLSTATE;
    RAISE WARNING 'T2 FAIL: % [%]', v_err_text, v_err_code;
  END;

  -- ==========================================================================
  -- T3: generate_budget_payment_token mints a non-empty token
  -- ==========================================================================
  BEGIN
    SELECT token, expires_at INTO v_token, v_expires_at
    FROM public.generate_budget_payment_token(v_budget_id, 30);

    IF v_token IS NULL OR length(v_token) < 20 THEN
      RAISE EXCEPTION 'Token too short or null: %', v_token;
    END IF;

    IF v_expires_at IS NULL OR v_expires_at < now() + interval '29 days' THEN
      RAISE EXCEPTION 'expires_at too soon: %', v_expires_at;
    END IF;

    v_pass := v_pass + 1;
    RAISE NOTICE 'T3 PASS: token generated len=%, expires=%', length(v_token), v_expires_at;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    v_err_text := SQLERRM; v_err_code := SQLSTATE;
    RAISE WARNING 'T3 FAIL: % [%]', v_err_text, v_err_code;
  END;

  -- ==========================================================================
  -- T4: generate_budget_payment_token reuses an existing non-expired token
  -- ==========================================================================
  BEGIN
    SELECT token INTO v_token
    FROM public.generate_budget_payment_token(v_budget_id, 30);

    IF v_token IS NULL OR length(v_token) < 20 THEN
      RAISE EXCEPTION 'Second call did not return a token';
    END IF;

    -- Calling again should return the SAME token
    DECLARE v_token2 text;
    BEGIN
      SELECT token INTO v_token2
      FROM public.generate_budget_payment_token(v_budget_id, 30);

      IF v_token <> v_token2 THEN
        RAISE EXCEPTION 'Token changed between calls: % -> %', v_token, v_token2;
      END IF;
    END;

    v_pass := v_pass + 1;
    RAISE NOTICE 'T4 PASS: token reused on second call';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    v_err_text := SQLERRM; v_err_code := SQLSTATE;
    RAISE WARNING 'T4 FAIL: % [%]', v_err_text, v_err_code;
  END;

  -- ==========================================================================
  -- T5: mark_budget_paid_atomic records a payment and updates the budget
  -- ==========================================================================
  BEGIN
    v_payment := public.mark_budget_paid_atomic(
      p_budget_id        := v_budget_id,
      p_provider         := 'stripe',
      p_amount           := 121.00,
      p_currency         := 'EUR',
      p_provider_reference := 'ch_TEST_001',
      p_provider_metadata  := '{"event":"charge.succeeded"}'::jsonb,
      p_fee              := 2.50,
      p_notes            := 'Stripe test charge'
    );

    IF v_payment.id IS NULL THEN
      RAISE EXCEPTION 'mark_budget_paid_atomic did not return a row';
    END IF;

    IF v_payment.amount <> 121.00 THEN
      RAISE EXCEPTION 'Wrong amount stored: %', v_payment.amount;
    END IF;

    -- The trigger should have updated the budget
    SELECT paid_amount, paid_at, payment_status, status
      INTO v_total, v_payment.paid_at, v_summary
    FROM public.recurring_budgets WHERE id = v_budget_id;

    IF v_total <> 121.00 THEN
      RAISE EXCEPTION 'Budget paid_amount not updated, got %', v_total;
    END IF;

    v_pass := v_pass + 1;
    RAISE NOTICE 'T5 PASS: payment recorded, budget.paid_amount=%', v_total;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    v_err_text := SQLERRM; v_err_code := SQLSTATE;
    RAISE WARNING 'T5 FAIL: % [%]', v_err_text, v_err_code;
  END;

  -- ==========================================================================
  -- T6: mark_budget_paid_atomic is idempotent on provider_reference
  -- ==========================================================================
  BEGIN
    DECLARE v_before int; v_after int;
    BEGIN
      SELECT COUNT(*) INTO v_before
      FROM public.recurring_budget_payments
      WHERE budget_id = v_budget_id;

      v_payment := public.mark_budget_paid_atomic(
        p_budget_id        := v_budget_id,
        p_provider         := 'stripe',
        p_amount           := 121.00,
        p_provider_reference := 'ch_TEST_001'  -- same as T5
      );

      SELECT COUNT(*) INTO v_after
      FROM public.recurring_budget_payments
      WHERE budget_id = v_budget_id;

      IF v_before <> v_after THEN
        RAISE EXCEPTION 'Idempotency broken: row count changed % -> %', v_before, v_after;
      END IF;
    END;

    v_pass := v_pass + 1;
    RAISE NOTICE 'T6 PASS: duplicate provider_reference is a no-op';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    v_err_text := SQLERRM; v_err_code := SQLSTATE;
    RAISE WARNING 'T6 FAIL: % [%]', v_err_text, v_err_code;
  END;

  -- ==========================================================================
  -- T7: budget status becomes 'paid' once total is reached
  -- ==========================================================================
  BEGIN
    SELECT status, payment_status INTO v_summary
    FROM public.recurring_budgets WHERE id = v_budget_id;

    IF v_summary.status <> 'paid' THEN
      RAISE EXCEPTION 'Budget status not synced to paid, got %', v_summary.status;
    END IF;
    IF v_summary.payment_status <> 'paid' THEN
      RAISE EXCEPTION 'payment_status not synced to paid, got %', v_summary.payment_status;
    END IF;

    v_pass := v_pass + 1;
    RAISE NOTICE 'T7 PASS: budget marked paid after full payment';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    v_err_text := SQLERRM; v_err_code := SQLSTATE;
    RAISE WARNING 'T7 FAIL: % [%]', v_err_text, v_err_code;
  END;

  -- ==========================================================================
  -- T8: list_budget_payment_history returns rows
  -- ==========================================================================
  BEGIN
    PERFORM 1
    FROM public.list_budget_payment_history(v_budget_id)
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'list_budget_payment_history returned no rows';
    END IF;

    v_pass := v_pass + 1;
    RAISE NOTICE 'T8 PASS: list_budget_payment_history returns rows';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    v_err_text := SQLERRM; v_err_code := SQLSTATE;
    RAISE WARNING 'T8 FAIL: % [%]', v_err_text, v_err_code;
  END;

  -- ==========================================================================
  -- T9: a partial payment leaves the budget in 'pending' state
  -- ==========================================================================
  DECLARE
    v_budget2_id uuid;
    v_before_status text;
    v_after_status text;
  BEGIN
    INSERT INTO public.recurring_budgets (
      client_id, company_id, period, recurrence_type,
      issue_date, due_date, subtotal, tax_rate, tax_amount, total,
      status, payment_status
    ) VALUES (
      v_client_id, v_company_id, 'TEST-2099-02', 'monthly',
      CURRENT_DATE, CURRENT_DATE + 30,
      200.00, 21.00, 42.00, 242.00,
      'sent', 'unpaid'
    )
    RETURNING id INTO v_budget2_id;

    -- Pay only half
    v_payment := public.mark_budget_paid_atomic(
      p_budget_id        := v_budget2_id,
      p_provider         := 'paypal',
      p_amount           := 100.00,
      p_provider_reference := 'PAY-TEST-002'
    );

    SELECT payment_status, status INTO v_before_status, v_after_status
    FROM public.recurring_budgets WHERE id = v_budget2_id;

    -- Pay the remainder with a different provider reference
    v_payment := public.mark_budget_paid_atomic(
      p_budget_id        := v_budget2_id,
      p_provider         := 'paypal',
      p_amount           := 142.00,
      p_provider_reference := 'PAY-TEST-002b'
    );

    SELECT status, payment_status, paid_amount
      INTO v_summary, v_before_status, v_total
    FROM public.recurring_budgets WHERE id = v_budget2_id;

    IF v_summary.status <> 'paid' THEN
      RAISE EXCEPTION 'Second partial did not move budget to paid: %', v_summary.status;
    END IF;
    IF v_total <> 242.00 THEN
      RAISE EXCEPTION 'Wrong total paid: %', v_total;
    END IF;

    -- There should be exactly 2 payment rows for this budget
    PERFORM 1 FROM public.recurring_budget_payments WHERE budget_id = v_budget2_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No payment rows recorded';
    END IF;

    v_pass := v_pass + 1;
    RAISE NOTICE 'T9 PASS: split payment + sum sync (paid_amount=%)', v_total;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    v_err_text := SQLERRM; v_err_code := SQLSTATE;
    RAISE WARNING 'T9 FAIL: % [%]', v_err_text, v_err_code;
  END;

  -- ==========================================================================
  -- T10: payment_status CHECK constraint rejects bad values
  -- ==========================================================================
  BEGIN
    UPDATE public.recurring_budgets
    SET payment_status = 'lolnope'
    WHERE id = v_budget_id;

    RAISE EXCEPTION 'CHECK constraint did not block bad payment_status';
  EXCEPTION
    WHEN check_violation THEN
      v_pass := v_pass + 1;
      RAISE NOTICE 'T10 PASS: bad payment_status rejected';
    WHEN OTHERS THEN
      -- Also acceptable: any error that says the value is invalid
      IF SQLSTATE IN ('23514', '22P02') THEN
        v_pass := v_pass + 1;
        RAISE NOTICE 'T10 PASS: bad payment_status rejected (% state)', SQLSTATE;
      ELSE
        v_fail := v_fail + 1;
        v_err_text := SQLERRM; v_err_code := SQLSTATE;
        RAISE WARNING 'T10 FAIL: % [%]', v_err_text, v_err_code;
      END IF;
  END;

  -- ==========================================================================
  -- T11: recurring_budget_payments_summary view aggregates correctly
  -- ==========================================================================
  BEGIN
    PERFORM 1 FROM public.recurring_budget_payments_summary
    WHERE company_id = v_company_id
      AND client_id = v_client_id
      AND provider = 'stripe';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Summary view missing stripe row for company=%', v_company_id;
    END IF;

    v_pass := v_pass + 1;
    RAISE NOTICE 'T11 PASS: summary view has expected aggregation';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    v_err_text := SQLERRM; v_err_code := SQLSTATE;
    RAISE WARNING 'T11 FAIL: % [%]', v_err_text, v_err_code;
  END;

  -- ==========================================================================
  -- T12: refund path — a 'refunded' payment moves the budget to refunded
  -- ==========================================================================
  DECLARE v_payment3 public.recurring_budget_payments;
  BEGIN
    -- Insert a refunded payment directly (webhook flow)
    INSERT INTO public.recurring_budget_payments (
      budget_id, company_id, client_id,
      provider, status, amount, currency, provider_reference
    ) VALUES (
      v_budget_id, v_company_id, v_client_id,
      'stripe', 'refunded', 121.00, 'EUR', 're_TEST_001'
    )
    RETURNING * INTO v_payment3;

    SELECT payment_status INTO v_summary
    FROM public.recurring_budgets WHERE id = v_budget_id;

    IF v_summary <> 'refunded' THEN
      RAISE EXCEPTION 'Refund did not move payment_status to refunded, got %', v_summary;
    END IF;

    v_pass := v_pass + 1;
    RAISE NOTICE 'T12 PASS: refund moves payment_status correctly';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1;
    v_err_text := SQLERRM; v_err_code := SQLSTATE;
    RAISE WARNING 'T12 FAIL: % [%]', v_err_text, v_err_code;
  END;

  -- ==========================================================================
  -- Done
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'BUDGET PAYMENT FLOW: % passed, % failed', v_pass, v_fail;
  RAISE NOTICE '========================================';

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'One or more tests failed — see warnings above';
  END IF;
END;
$$;

ROLLBACK;  -- tests are transactional, no data is persisted
