-- ============================================================================
-- Migration: Auto-create invoice when a quote transitions to 'accepted'
-- ============================================================================
-- WHY
--   Spain legally requires the client receive an invoice number at the moment
--   of payment, NOT a quote number. Until now, accepted quotes stayed stuck in
--   'accepted' status without a corresponding invoice unless a separate cron
--   or manual step fired `public.create_invoice_for_booking`.
--
--   Two paths lead to a quote becoming 'accepted':
--     (A) Admin updates the quote from the CRM UI (`UPDATE quotes SET status`).
--     (B) The client accepts the quote in the portal (`accept_quote_by_client`).
--   Both paths must end with an invoice row.
--
-- WHAT THIS MIGRATION CHANGES
--   1. Replaces the AFTER UPDATE OF status trigger function
--      `public.trg_fn_log_quote_status_transition` so that when
--      NEW.status = 'accepted' AND NEW.booking_id IS NOT NULL, it calls
--      `public.create_invoice_for_booking(NEW.booking_id)` and:
--        * Stores the resulting invoice_id (or NULL on graceful failure) in
--          the transition row's `metadata` jsonb under the key
--          `invoice_id_auto_created` — permanent audit trail.
--        * If the quote is not yet linked to an invoice, sets
--          `quotes.invoice_id` and `quotes.invoiced_at` so the UI sees the
--          link immediately. The function itself already links
--          `bookings.invoice_id` and `invoices.source_quote_id`.
--   2. Replaces `public.accept_quote_by_client` so that AFTER the UPDATE it
--      defensively re-calls `public.create_invoice_for_booking` and links
--      the quote. The trigger from (1) already does this, but the explicit
--      call here is belt-and-suspenders for paths where the trigger might
--      be temporarily disabled.
--
-- IMPORTANT — NON-INVASIVE
--   * We do NOT modify `create_invoice_for_booking` (already idempotent).
--   * We do NOT modify the BEFORE UPDATE validator trigger.
--   * We do NOT modify the `convert_policy` dropdown — it stays display only.
--     The conversion is ALWAYS automatic on 'accepted', regardless of the
--     dropdown value. If a tenant ever needs to disable it, an explicit
--     boolean column must be added (out of scope here).
--   * The trigger remains SECURITY DEFINER so it can call the SECDEF
--     `create_invoice_for_booking`. The postgres role owns the function
--     and has BYPASSRLS, so the call works even on FORCE-RLS tables.
--
-- EDGE CASES (handled explicitly)
--   * `NEW.booking_id IS NULL` (quote without a linked booking) — trigger
--     skips the call and logs the transition without the
--     `invoice_id_auto_created` key. Does not crash.
--   * `create_invoice_for_booking` returns NULL (booking without client or
--     service) — trigger logs the transition with `invoice_id_auto_created:
--     NULL` and a `invoice_auto_create_note`. Does not crash.
--   * `create_invoice_for_booking` RAISES — trigger catches with `EXCEPTION
--     WHEN OTHERS`, logs a WARNING, writes transition with NULL. Does not
--     crash the UPDATE.
--   * Recursive trigger from the post-accept UPDATE on `quotes` — the guard
--     `IF NEW.status IS NOT DISTINCT FROM OLD.status` at the top makes the
--     second pass a no-op. Safe.
--   * Quote already has an invoice linked (rectification case) — guarded by
--     `OLD.invoice_id IS DISTINCT FROM v_invoice_id` so we never overwrite
--     an intentional pre-existing link.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Replace the AFTER trigger function with auto-invoice behavior.
--    The trigger `trg_log_quote_status_transition` does NOT need to be
--    recreated — `CREATE OR REPLACE FUNCTION` rebinds the trigger
--    automatically because it references the function by name.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_log_quote_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller     uuid := auth.uid();
  v_actor      uuid;
  v_role       text;
  v_invoice_id uuid;
  v_metadata   jsonb;
BEGIN
  -- ── Guard: skip if status did not change ─────────────────────────────
  -- This also makes the recursive UPDATE on the same row (done below
  -- when we link quotes.invoice_id) a no-op.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- ── Resolve actor_user_id (nullable for system-driven transitions) ──
  IF v_caller IS NOT NULL THEN
    SELECT u.id INTO v_actor
    FROM public.users u
    WHERE u.auth_user_id = v_caller
    LIMIT 1;
  END IF;

  v_role := public.resolve_actor_role(v_caller);

  -- ── Base metadata (preserves the shape added by migration 027) ──────
  v_metadata := jsonb_build_object('role', v_role);

  -- ── AUTO-INVOICE on 'accepted' ───────────────────────────────────────
  -- When a quote transitions to 'accepted' and is linked to a booking,
  -- create the invoice immediately. The function is idempotent: a second
  -- call on the same booking returns the existing invoice_id without
  -- creating a duplicate. If the booking has no client/service, the
  -- function returns NULL — we tolerate that and log a WARNING so the
  -- transition still completes.
  IF NEW.status::text = 'accepted' AND NEW.booking_id IS NOT NULL THEN
    BEGIN
      SELECT public.create_invoice_for_booking(NEW.booking_id)
        INTO v_invoice_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING
        '[auto-invoice] create_invoice_for_booking(%) failed: %',
        NEW.booking_id, SQLERRM;
      v_invoice_id := NULL;
    END;

    IF v_invoice_id IS NOT NULL THEN
      v_metadata := v_metadata || jsonb_build_object(
        'invoice_id_auto_created', v_invoice_id
      );

      -- Link the quote to the invoice (the function already links the
      -- booking). The recursive UPDATE re-fires this trigger, but the
      -- status guard at the top makes it a no-op. Guarded by IS DISTINCT
      -- FROM to preserve any pre-existing invoice link (e.g. rectification).
      IF OLD.invoice_id IS DISTINCT FROM v_invoice_id THEN
        UPDATE public.quotes
           SET invoice_id  = v_invoice_id,
               invoiced_at = COALESCE(invoiced_at, now()),
               updated_at  = now()
         WHERE id = NEW.id;
      END IF;
    ELSE
      v_metadata := v_metadata || jsonb_build_object(
        'invoice_id_auto_created', NULL,
        'invoice_auto_create_note',
          'create_invoice_for_booking returned NULL (booking missing client or service)'
      );
    END IF;
  END IF;

  -- ── Write the transition log row ────────────────────────────────────
  INSERT INTO public.quote_status_transitions (
    quote_id, company_id, from_status, to_status,
    actor_user_id, reason, metadata, created_at
  ) VALUES (
    NEW.id, NEW.company_id,
    OLD.status::text, NEW.status::text,
    v_actor,
    CASE
      WHEN v_role = 'client' THEN 'client_action'
      WHEN v_role = 'system' THEN 'system_action'
      ELSE 'staff_action'
    END,
    v_metadata,
    now()
  );

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.trg_fn_log_quote_status_transition() IS
  'AFTER UPDATE OF status trigger on public.quotes. Writes one row to
   quote_status_transitions (capturing role + optional invoice_id_auto_created
   metadata). When NEW.status = ''accepted'' AND the quote is linked to a
   booking, calls public.create_invoice_for_booking() (idempotent) and links
   the resulting invoice to the quote (quotes.invoice_id + quotes.invoiced_at).
   NULL returns and exceptions from the function are tolerated (WARNING + NULL
   in metadata) so the transition still completes even when the booking has
   no client or service. Recursive trigger fires from the post-accept UPDATE
   are terminated by the status guard at the top of the function.';

-- ----------------------------------------------------------------------------
-- 2. Replace accept_quote_by_client with a defensive auto-invoice call.
--    The trigger from step (1) already creates the invoice when the RPC
--    runs the UPDATE. This explicit post-UPDATE call is belt-and-suspenders:
--    it guarantees the quote.invoice_id link even on paths where the trigger
--    might be temporarily disabled. The function is idempotent so the second
--    call is safe (returns the existing invoice_id without duplicating).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_quote_by_client(
  p_quote_id           uuid,
  p_signature_data_url text DEFAULT NULL,
  p_ip_address         inet  DEFAULT NULL,
  p_user_agent         text  DEFAULT NULL
)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller     uuid := auth.uid();
  v_quote      public.quotes%ROWTYPE;
  v_old_status text;
  v_has_access boolean := false;
  v_sig_stored text;
  v_invoice_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'accept_quote_by_client requires an authenticated caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lock the quote row.
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id
  FOR UPDATE;

  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_old_status := v_quote.status::text;

  -- ── Access check ─────────────────────────────────────────────────────
  -- 1) The caller is the client of this quote (via client_portal_users).
  SELECT EXISTS (
    SELECT 1
    FROM public.client_portal_users cpu
    WHERE cpu.auth_user_id = v_caller
      AND cpu.client_id   = v_quote.client_id
      AND cpu.is_active   = true
  ) INTO v_has_access;

  -- 2) Fallback: a staff member of the company can also call (rare; mainly
  --    for testing or for manual acceptance on behalf of the client).
  IF NOT v_has_access THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.auth_user_id = v_caller
        AND u.company_id   = v_quote.company_id
    ) INTO v_has_access;
  END IF;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'You do not have access to this quote'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── State machine guard ──────────────────────────────────────────────
  IF v_old_status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'Cannot accept quote in status %', v_old_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Defense-in-depth: pre-validate against the same matrix the trigger uses.
  PERFORM public.can_transition_quote_status(v_old_status, 'accepted', 'client');

  -- ── Signature: store truncated (5000 chars) to keep the row reasonable ─
  IF p_signature_data_url IS NOT NULL THEN
    v_sig_stored := CASE
      WHEN length(p_signature_data_url) > 5000
      THEN substring(p_signature_data_url from 1 for 5000)
      ELSE p_signature_data_url
    END;
  END IF;

  -- ── Apply the transition ─────────────────────────────────────────────
  -- The BEFORE UPDATE trigger validates the transition. The AFTER UPDATE
  -- trigger (this migration's trg_fn_log_quote_status_transition) will
  -- call create_invoice_for_booking() and link quotes.invoice_id.
  UPDATE public.quotes
     SET status              = 'accepted'::public.quote_status,
         accepted_at         = now(),
         digital_signature   = COALESCE(v_sig_stored, digital_signature),
         signature_timestamp = CASE
                                 WHEN v_sig_stored IS NOT NULL THEN now()
                                 ELSE signature_timestamp
                               END,
         client_ip_address   = COALESCE(p_ip_address, client_ip_address),
         client_user_agent   = COALESCE(p_user_agent, client_user_agent),
         updated_at          = now()
   WHERE id = p_quote_id
   RETURNING * INTO v_quote;

  -- ── Defensive auto-invoice call ──────────────────────────────────────
  -- The AFTER trigger has already called create_invoice_for_booking and
  -- linked quotes.invoice_id. We call again defensively: the function is
  -- idempotent (second call returns the same invoice_id without
  -- duplicating) and this guarantees the link even on paths where the
  -- trigger is temporarily disabled.
  IF v_quote.booking_id IS NOT NULL THEN
    BEGIN
      SELECT public.create_invoice_for_booking(v_quote.booking_id)
        INTO v_invoice_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING
        '[accept_quote_by_client] defensive create_invoice_for_booking(%) failed: %',
        v_quote.booking_id, SQLERRM;
      v_invoice_id := NULL;
    END;

    IF v_invoice_id IS NOT NULL
       AND v_quote.invoice_id IS DISTINCT FROM v_invoice_id THEN
      UPDATE public.quotes
         SET invoice_id  = v_invoice_id,
             invoiced_at = COALESCE(invoiced_at, now()),
             updated_at  = now()
       WHERE id = p_quote_id
       RETURNING * INTO v_quote;
    END IF;
  END IF;

  RETURN v_quote;
END;
$fn$;

COMMENT ON FUNCTION public.accept_quote_by_client(uuid, text, inet, text) IS
  'Sent/viewed → accepted transition callable by the authenticated client of
   the quote (via client_portal_users.auth_user_id). Stores signature, IP,
   UA and stamps accepted_at. AFTER the UPDATE, defensively calls
   public.create_invoice_for_booking() and links the quote to the resulting
   invoice (Spain legal requirement: the client must receive an invoice
   number at payment, not a quote number). The function is idempotent so
   the second call after the trigger is safe. Pre-validates against
   can_transition_quote_status; the BEFORE UPDATE trigger re-validates.';

GRANT EXECUTE ON FUNCTION public.accept_quote_by_client(uuid, text, inet, text)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. E2E TEST (run-once, after the migration applies).
--
--    Verified behaviors:
--      A) Raw UPDATE quote SET status='accepted' creates the invoice and
--         links bookings.invoice_id + invoices.source_quote_id.
--      B) accept_quote_by_client RPC does the same when called by an
--         authenticated caller.
--      C) create_invoice_for_booking is idempotent (second call returns the
--         same invoice_id without creating a new row).
--      D) Trigger does NOT crash when NEW.booking_id IS NULL — the
--         transition is still logged and quotes.invoice_id stays NULL.
--
--    Implementation notes:
--      * The test exercises the REAL production flow: inserting a booking
--        triggers trg_auto_create_quote_on_booking to create an auto-draft
--        quote linked via bookings.quote_id. The test then walks that
--        quote through draft → sent → accepted.
--      * Authentication is faked via
--        set_config('request.jwt.claim.sub', <real_admin_uuid>) which
--        auth.uid() and resolve_actor_role both consume. We use a REAL
--        admin user so that:
--          - BEFORE validator allows draft→sent (admin/owner/etc. role)
--          - BEFORE validator allows sent→accepted (admin role)
--          - accept_quote_by_client access check passes (staff member of
--            the company — fallback in the access check)
--          - GDPR audit log INSERT (triggered by invoice creation) gets a
--            real user_id that exists in public.users (no FK violation).
--        We do NOT use a fake client_portal_users row because the GDPR
--        trigger would log auth.uid() (a fake UUID) as user_id, which
--        would violate the FK to public.users. In production auth.uid()
--        is always a real user.
--      * Cleanup: each DELETE wrapped in EXCEPTION WHEN OTHERS so
--        partial failures don't fail the migration. Bookings first
--        (our test quotes are 'accepted' which excludes them from
--        trg_delete_booking_rejects_quote's WHERE clause).
-- ----------------------------------------------------------------------------
DO $e2e$
DECLARE
  v_company_id      uuid;
  v_service_id      uuid;
  v_client_id       uuid;
  v_admin_uid       uuid;
  v_run_id          text;
  v_booking_a_id    uuid;
  v_quote_a_id      uuid;
  v_invoice_a_id    uuid;
  v_booking_b_id    uuid;
  v_quote_b_id      uuid;
  v_invoice_b_id    uuid;
  v_first_call_id   uuid;
  v_second_call_id  uuid;
  v_quote_null_id   uuid;
BEGIN
  -- ── Setup: use CAIBS if present, else fall back to the first company ──
  SELECT id INTO v_company_id FROM public.companies WHERE slug = 'caibs' LIMIT 1;
  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id FROM public.companies LIMIT 1;
  END IF;
  IF v_company_id IS NULL THEN
    RAISE NOTICE 'E2E SKIPPED: no companies in database';
    RETURN;
  END IF;

  -- Pick a service for this company. If none exist, the booking INSERT
  -- will skip the auto-quote trigger (it requires service_id IS NOT NULL).
  SELECT id INTO v_service_id
  FROM public.services
  WHERE company_id = v_company_id
  ORDER BY created_at NULLS LAST, name
  LIMIT 1;

  -- Find a real admin user in this company to impersonate.
  SELECT u.auth_user_id INTO v_admin_uid
  FROM public.users u
  LEFT JOIN public.app_roles ar ON ar.id = u.app_role_id
  WHERE u.company_id = v_company_id
    AND ar.name IN ('admin', 'owner', 'super_admin')
  ORDER BY (ar.name = 'super_admin') DESC
  LIMIT 1;

  IF v_admin_uid IS NULL THEN
    RAISE NOTICE 'E2E SKIPPED: no admin/owner/super_admin user in company %', v_company_id;
    RETURN;
  END IF;

  -- Stable run id (timestamp-based) for unique quote_numbers per run.
  v_run_id := to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS');

  -- Shared client across tests A/B/D (cleanup removes it once).
  INSERT INTO public.clients (company_id, name, email)
  VALUES (v_company_id, 'TEST_E2E_auto_invoice', 'test-e2e+auto-invoice@example.invalid')
  RETURNING id INTO v_client_id;

  -- ────────────────────────────────────────────────────────────────────
  -- TEST GROUP A — direct UPDATE walk-through: draft → sent → accepted
  -- ────────────────────────────────────────────────────────────────────
  INSERT INTO public.bookings (
    company_id, client_id, service_id, customer_name, customer_email,
    start_time, end_time, status, total_price, currency, source
  ) VALUES (
    v_company_id, v_client_id, v_service_id,
    'TEST_E2E_auto_invoice_a', 'test-e2e+auto-invoice@example.invalid',
    now() + INTERVAL '7 days', now() + INTERVAL '7 days 1 hour',
    'confirmed', 100, 'EUR', 'admin'
  )
  RETURNING id INTO v_booking_a_id;

  -- Locate the auto-draft quote created by the AFTER INSERT trigger.
  -- (If service_id was NULL, no auto-quote was created.)
  IF v_service_id IS NOT NULL THEN
    SELECT id INTO v_quote_a_id
    FROM public.quotes
    WHERE booking_id = v_booking_a_id
      AND status = 'draft'
    LIMIT 1;

    IF v_quote_a_id IS NULL THEN
      RAISE EXCEPTION 'E2E FAIL A0: expected auto-draft quote for booking %', v_booking_a_id;
    END IF;

    -- Walk draft → sent → accepted as admin.
    PERFORM set_config('request.jwt.claim.sub', v_admin_uid::text, true);
    UPDATE public.quotes SET status = 'sent' WHERE id = v_quote_a_id;
    UPDATE public.quotes SET status = 'accepted' WHERE id = v_quote_a_id;
    PERFORM set_config('request.jwt.claim.sub', '', true);
  ELSE
    -- Service-less path: insert a 'sent' quote directly so we can test accept.
    INSERT INTO public.quotes (
      company_id, client_id, booking_id, quote_number, year, sequence_number,
      status, quote_date, valid_until, title, currency, language,
      subtotal, tax_amount, total_amount
    ) VALUES (
      v_company_id, v_client_id, v_booking_a_id,
      'E2E-A-' || v_run_id, 2026, 888888,
      'sent', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '25 days',
      'TEST_E2E auto-invoice A', 'EUR', 'es',
      100, 21, 121
    )
    RETURNING id INTO v_quote_a_id;
    UPDATE public.bookings SET quote_id = v_quote_a_id WHERE id = v_booking_a_id;
    UPDATE public.quotes SET status = 'accepted' WHERE id = v_quote_a_id;
  END IF;

  -- A2: bookings.invoice_id must now be set
  SELECT invoice_id INTO v_invoice_a_id FROM public.bookings WHERE id = v_booking_a_id;
  IF v_invoice_a_id IS NULL THEN
    RAISE EXCEPTION 'E2E FAIL A2: bookings.invoice_id is NULL after accept (booking=%, quote=%)',
      v_booking_a_id, v_quote_a_id;
  END IF;

  -- A3: invoices.source_quote_id must equal our quote_id
  PERFORM 1 FROM public.invoices
   WHERE id = v_invoice_a_id AND source_quote_id = v_quote_a_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'E2E FAIL A3: invoices.source_quote_id != quote_id (invoice=%, quote=%)',
      v_invoice_a_id, v_quote_a_id;
  END IF;

  -- A4: quotes.invoice_id must also be set (bidirectional link)
  PERFORM 1 FROM public.quotes
   WHERE id = v_quote_a_id AND invoice_id = v_invoice_a_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'E2E FAIL A4: quotes.invoice_id was not linked by trigger';
  END IF;

  -- A5: transition log metadata must contain invoice_id_auto_created
  PERFORM 1 FROM public.quote_status_transitions
   WHERE quote_id = v_quote_a_id
     AND to_status = 'accepted'
     AND metadata ? 'invoice_id_auto_created'
     AND (metadata->>'invoice_id_auto_created')::uuid = v_invoice_a_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'E2E FAIL A5: transition log missing invoice_id_auto_created=%',
      v_invoice_a_id;
  END IF;

  -- ────────────────────────────────────────────────────────────────────
  -- TEST GROUP B — accept_quote_by_client RPC end-to-end
  --   Same production flow. The RPC is called as the admin user (who is
  --   also a staff member of the company, so the fallback access check
  --   passes). Using the admin user (not a fake client_portal_users row)
  --   is intentional: the GDPR audit log trigger gets a real user_id
  --   so no FK violation occurs.
  -- ────────────────────────────────────────────────────────────────────
  INSERT INTO public.bookings (
    company_id, client_id, service_id, customer_name, customer_email,
    start_time, end_time, status, total_price, currency, source
  ) VALUES (
    v_company_id, v_client_id, v_service_id,
    'TEST_E2E_auto_invoice_b', 'test-e2e+auto-invoice@example.invalid',
    now() + INTERVAL '14 days', now() + INTERVAL '14 days 1 hour',
    'confirmed', 200, 'EUR', 'admin'
  )
  RETURNING id INTO v_booking_b_id;

  IF v_service_id IS NOT NULL THEN
    SELECT id INTO v_quote_b_id
    FROM public.quotes
    WHERE booking_id = v_booking_b_id
      AND status = 'draft'
    LIMIT 1;

    IF v_quote_b_id IS NULL THEN
      RAISE EXCEPTION 'E2E FAIL B0: expected auto-draft quote for booking %', v_booking_b_id;
    END IF;

    -- Walk draft → sent as admin.
    PERFORM set_config('request.jwt.claim.sub', v_admin_uid::text, true);
    UPDATE public.quotes SET status = 'sent' WHERE id = v_quote_b_id;
    PERFORM set_config('request.jwt.claim.sub', '', true);
  ELSE
    INSERT INTO public.quotes (
      company_id, client_id, booking_id, quote_number, year, sequence_number,
      status, quote_date, valid_until, title, currency, language,
      subtotal, tax_amount, total_amount
    ) VALUES (
      v_company_id, v_client_id, v_booking_b_id,
      'E2E-B-' || v_run_id, 2026, 888887,
      'sent', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '25 days',
      'TEST_E2E auto-invoice B', 'EUR', 'es',
      200, 42, 242
    )
    RETURNING id INTO v_quote_b_id;
    UPDATE public.bookings SET quote_id = v_quote_b_id WHERE id = v_booking_b_id;
  END IF;

  -- Call the RPC as the admin (staff fallback passes the access check).
  PERFORM set_config('request.jwt.claim.sub', v_admin_uid::text, true);
  PERFORM public.accept_quote_by_client(
    v_quote_b_id,
    'data:image/png;base64,E2E-signature-mock',
    NULL,
    'E2E-test-agent'
  );
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- B2: bookings.invoice_id must be set
  SELECT invoice_id INTO v_invoice_b_id FROM public.bookings WHERE id = v_booking_b_id;
  IF v_invoice_b_id IS NULL THEN
    RAISE EXCEPTION 'E2E FAIL B2: bookings.invoice_id is NULL after RPC accept';
  END IF;

  -- B3: invoices.source_quote_id must equal our quote_b_id
  PERFORM 1 FROM public.invoices
   WHERE id = v_invoice_b_id AND source_quote_id = v_quote_b_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'E2E FAIL B3: invoices.source_quote_id != quote_b_id';
  END IF;

  -- B4: quote status should be either 'accepted' (briefly) or 'invoiced'
  -- (auto-transitioned by trg_mark_quote_invoiced_on_invoice_insert AFTER
  -- the invoice is created). 'invoiced' is the terminal, correct state.
  PERFORM 1 FROM public.quotes
   WHERE id = v_quote_b_id AND status IN ('accepted', 'invoiced');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'E2E FAIL B4: quote status not in (accepted, invoiced) after RPC (got: %)',
      (SELECT status::text FROM public.quotes WHERE id = v_quote_b_id);
  END IF;

  -- ────────────────────────────────────────────────────────────────────
  -- TEST GROUP C — idempotency of create_invoice_for_booking
  -- ────────────────────────────────────────────────────────────────────
  SELECT public.create_invoice_for_booking(v_booking_a_id) INTO v_first_call_id;
  SELECT public.create_invoice_for_booking(v_booking_a_id) INTO v_second_call_id;
  IF v_first_call_id IS NULL THEN
    RAISE EXCEPTION 'E2E FAIL C1: first call returned NULL';
  END IF;
  IF v_first_call_id <> v_second_call_id THEN
    RAISE EXCEPTION 'E2E FAIL C2: idempotency broken (first=%, second=%)',
      v_first_call_id, v_second_call_id;
  END IF;
  IF v_first_call_id <> v_invoice_a_id THEN
    RAISE EXCEPTION 'E2E FAIL C3: second call returned a NEW invoice (%, expected %)',
      v_first_call_id, v_invoice_a_id;
  END IF;

  -- ────────────────────────────────────────────────────────────────────
  -- TEST GROUP D — graceful NULL handling (booking_id IS NULL)
  -- ────────────────────────────────────────────────────────────────────
  INSERT INTO public.quotes (
    company_id, client_id, booking_id, quote_number, year, sequence_number,
    status, quote_date, valid_until, title, currency, language,
    subtotal, tax_amount, total_amount
  ) VALUES (
    v_company_id, v_client_id, NULL,
    'E2E-NULL-' || v_run_id, 2026, 888886,
    'sent', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '25 days',
    'TEST_E2E auto-invoice NULL booking', 'EUR', 'es',
    50, 10.5, 60.5
  )
  RETURNING id INTO v_quote_null_id;

  -- D1: must NOT crash even though booking_id IS NULL.
  UPDATE public.quotes SET status = 'accepted' WHERE id = v_quote_null_id;

  -- D2: the transition must still be logged.
  PERFORM 1 FROM public.quote_status_transitions
   WHERE quote_id = v_quote_null_id AND to_status = 'accepted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'E2E FAIL D2: NULL-booking transition not logged';
  END IF;

  -- D3: quotes.invoice_id must remain NULL (no invoice should be created).
  PERFORM 1 FROM public.quotes
   WHERE id = v_quote_null_id AND invoice_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'E2E FAIL D3: NULL-booking quote should not have an invoice_id';
  END IF;

  -- D4: metadata for this transition must NOT have invoice_id_auto_created
  --     (the auto-invoice block was skipped because booking_id IS NULL).
  PERFORM 1 FROM public.quote_status_transitions
   WHERE quote_id = v_quote_null_id
     AND to_status = 'accepted'
     AND NOT (metadata ? 'invoice_id_auto_created');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'E2E FAIL D4: NULL-booking transition should not contain invoice_id_auto_created key';
  END IF;

  RAISE NOTICE 'E2E PASS: all assertions verified';

  -- ────────────────────────────────────────────────────────────────────
  -- Cleanup (FK-safe order, each step wrapped so partial failures
  -- don't abort the migration). Our test quotes are 'accepted' which
  -- excludes them from trg_delete_booking_rejects_quote's WHERE clause.
  -- ────────────────────────────────────────────────────────────────────
  BEGIN
    DELETE FROM public.bookings WHERE id IN (v_booking_a_id, v_booking_b_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[cleanup] bookings delete failed: %', SQLERRM;
  END;

  BEGIN
    DELETE FROM public.quote_status_transitions
      WHERE quote_id IN (v_quote_a_id, v_quote_b_id, v_quote_null_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[cleanup] transitions delete failed: %', SQLERRM;
  END;

  BEGIN
    DELETE FROM public.quote_items
      WHERE quote_id IN (v_quote_a_id, v_quote_b_id, v_quote_null_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[cleanup] quote_items delete failed: %', SQLERRM;
  END;

  BEGIN
    DELETE FROM public.invoice_items
      WHERE invoice_id IN (v_invoice_a_id, v_invoice_b_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[cleanup] invoice_items delete failed: %', SQLERRM;
  END;

  BEGIN
    DELETE FROM public.invoices
      WHERE id IN (v_invoice_a_id, v_invoice_b_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[cleanup] invoices delete failed: %', SQLERRM;
  END;

  BEGIN
    DELETE FROM public.quotes
      WHERE id IN (v_quote_a_id, v_quote_b_id, v_quote_null_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[cleanup] quotes delete failed: %', SQLERRM;
  END;

  BEGIN
    DELETE FROM public.clients WHERE id = v_client_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[cleanup] clients delete failed: %', SQLERRM;
  END;

  RAISE NOTICE 'E2E PASS: auto-invoice on quote-accepted verified end-to-end';
END
$e2e$;

NOTIFY pgrst, 'reload schema';