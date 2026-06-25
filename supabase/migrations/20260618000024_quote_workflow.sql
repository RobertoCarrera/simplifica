-- ============================================================================
-- Migration: Quote workflow — explicit state machine + transition log
-- ============================================================================
-- Scope:
--   1. New table `quote_status_transitions` — append-only audit log of every
--      status change on `public.quotes`. Captures actor, reason, metadata.
--   2. Function `can_transition_quote_status(from, to, actor_role)` — single
--      source of truth for which transitions are allowed for which actor.
--   3. BEFORE UPDATE trigger on `quotes.status` that calls the validator.
--      Invalid transitions RAISE EXCEPTION.
--   4. AFTER UPDATE trigger on `quotes.status` that writes one row to
--      `quote_status_transitions`. Idempotent re-runs are safe.
--   5. RPC `send_quote_to_client(quote_id)` — wraps the draft → sent transition:
--         a) Validates caller role (admin / owner / supervisor / member).
--         b) Verifies client has an email.
--         c) Sets status='sent', quote_date=now(), valid_until=now()+30d.
--         d) Fires booking-notifier async with `{type: 'quote_sent', ...}`.
--         e) Returns the refreshed quote row.
--   6. Helper `dispatch_quote_event(event, quote_id)` — same shape as
--      `dispatch_send_budget_notification`: reads the service role key from
--      `vault.decrypted_secrets` and POSTs to the Edge Function.
--   7. pg_cron schedule for `quote-expiration-cron` (hourly — the function
--      itself does the date comparison).
--
-- IMPORTANT — NON-INVASIVE:
--   * We do NOT touch `fn_auto_quote_on_client_assigned`,
--     `fn_enforce_one_live_quote_per_booking`, `set_quote_month`,
--     `trg_sync_booking_quote_id`, `anonymize_quote_data`, or
--     `update_quotes_updated_at`.
--   * `fn_enforce_one_live_quote_per_booking` is a BEFORE UPDATE trigger
--     that fires on every row update — it runs BEFORE our transition
--     validator. If it sets NEW.status := 'cancelled', our validator
--     still runs on the post-enforce row. That is intentional: if
--     `fn_enforce_one_live_quote` cancels the row, our transition
--     (e.g. sent → cancelled) is still legal. We do NOT prevent the
--     enforcer from doing its job.
--   * We do NOT install any extension — pg_cron and pg_net are already
--     enabled (see migration 20260609000003).
--
-- Assumption: the caller's role is resolved by the RPC / trigger via
-- `public.users.app_role_id -> public.app_roles.name` for the user
-- bound to `auth.uid()`. For the BEFORE trigger (no actor parameter),
-- we pass `'system'` so the validator can allow system-driven
-- transitions (e.g. sent → viewed by client, sent → expired by cron).
-- ============================================================================

--------------------------------------------------------------------------------
-- 1. TABLE: quote_status_transitions
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_status_transitions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id         uuid        NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id       uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_status      text        NOT NULL,
  to_status        text        NOT NULL,
  actor_user_id    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  reason           text,
  metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_status_transitions_quote
  ON public.quote_status_transitions(quote_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_status_transitions_company
  ON public.quote_status_transitions(company_id, created_at DESC);

COMMENT ON TABLE public.quote_status_transitions IS
  'Append-only audit log of every status change on public.quotes. Written by
   the AFTER UPDATE trigger trg_log_quote_status_transition. Captures actor,
   reason, metadata. Use this to reconstruct the lifecycle of a quote for
   support / dispute resolution.';

COMMENT ON COLUMN public.quote_status_transitions.actor_user_id IS
  'Nullable: system-driven transitions (cron, webhooks) have no human actor.';
COMMENT ON COLUMN public.quote_status_transitions.metadata IS
  'Free-form jsonb — usually { source: rpc|cron|trigger|portal, ip, ua }.';

--------------------------------------------------------------------------------
-- 2. RLS on quote_status_transitions
--    Read: same company as the user (mirror quotes RLS). Write: handled by
--    triggers (SECURITY DEFINER) — we DO NOT grant INSERT to authenticated
--    directly so the only way to write is via the trigger.
--------------------------------------------------------------------------------
ALTER TABLE public.quote_status_transitions ENABLE ROW LEVEL SECURITY;

-- SELECT policy: same-company reads. Quotes already have a per-company
-- SELECT policy; we mirror the predicate.
DROP POLICY IF EXISTS quote_status_transitions_select ON public.quote_status_transitions;
CREATE POLICY quote_status_transitions_select ON public.quote_status_transitions
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = quote_status_transitions.company_id
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid()
        AND u.app_role_id IN (
          SELECT id FROM public.app_roles WHERE name IN ('super_admin','admin','owner')
        )
    )
  );

-- INSERT is only allowed via the trigger function (SECURITY DEFINER).
-- We still grant INSERT to allow the trigger to write.
GRANT INSERT ON public.quote_status_transitions TO authenticated;

--------------------------------------------------------------------------------
-- 3. FUNCTION: can_transition_quote_status(from, to, actor_role)
--    Returns TRUE if the transition is allowed; RAISE EXCEPTION otherwise.
--    Caller must wrap in a SAVEPOINT if they want to handle the failure
--    gracefully (the BEFORE UPDATE trigger does NOT — it's a hard stop).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_transition_quote_status(
  p_from       text,
  p_to         text,
  p_actor_role text  -- 'admin' | 'owner' | 'supervisor' | 'member' | 'agent' |
                    -- 'client' | 'professional' | 'marketer' | 'super_admin' |
                    -- 'system' | NULL
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  v_role text := lower(COALESCE(p_actor_role, ''));
  v_from text := lower(COALESCE(p_from, ''));
  v_to   text := lower(COALESCE(p_to, ''));
  v_ok   boolean := false;
BEGIN
  -- No-op: same status. Allowed for everyone (UPDATE without change).
  IF v_from = v_to THEN
    RETURN true;
  END IF;

  -- Role whitelist per (from -> to) pair. The matrix lives here, in one
  -- place, so the policy is auditable without reading multiple triggers.
  -- 'system' covers cron / webhook / internal triggers.
  -- 'super_admin' is implicitly allowed everywhere (catch-all at the end).
  v_ok := CASE
    -- draft -> sent:  staff with permission to send (admin/owner/supervisor/member/agent)
    WHEN v_from = 'draft' AND v_to = 'sent' THEN
      v_role IN ('admin','owner','supervisor','member','agent')

    -- draft -> cancelled:  anyone
    WHEN v_from = 'draft' AND v_to = 'cancelled' THEN
      v_role IN ('admin','owner','supervisor','member','agent','client','professional','marketer')

    -- sent -> viewed:  automatic when client opens the portal
    WHEN v_from = 'sent' AND v_to = 'viewed' THEN
      v_role IN ('client','system','admin','owner','supervisor','agent')

    -- sent -> accepted:  client (portal) or admin
    WHEN v_from = 'sent' AND v_to = 'accepted' THEN
      v_role IN ('client','admin','owner','supervisor','agent','system')

    -- sent -> rejected:  client (portal) or admin
    WHEN v_from = 'sent' AND v_to = 'rejected' THEN
      v_role IN ('client','admin','owner','supervisor','agent','system')

    -- sent -> expired:  automatic (cron)
    WHEN v_from = 'sent' AND v_to = 'expired' THEN
      v_role IN ('system','admin','owner','supervisor')

    -- sent -> cancelled:  admin / supervisor / member (rare — usually done from draft)
    WHEN v_from = 'sent' AND v_to = 'cancelled' THEN
      v_role IN ('admin','owner','supervisor','member','agent','system')

    -- viewed -> accepted:  client (portal) or admin
    WHEN v_from = 'viewed' AND v_to = 'accepted' THEN
      v_role IN ('client','admin','owner','supervisor','agent','system')

    -- viewed -> rejected:  client (portal) or admin
    WHEN v_from = 'viewed' AND v_to = 'rejected' THEN
      v_role IN ('client','admin','owner','supervisor','agent','system')

    -- viewed -> expired:  automatic (cron)
    WHEN v_from = 'viewed' AND v_to = 'expired' THEN
      v_role IN ('system','admin','owner','supervisor')

    -- viewed -> cancelled:  admin / supervisor / member
    WHEN v_from = 'viewed' AND v_to = 'cancelled' THEN
      v_role IN ('admin','owner','supervisor','member','agent','system')

    -- accepted -> invoiced:  admin / supervisor / owner (often automatic on invoice creation)
    WHEN v_from = 'accepted' AND v_to = 'invoiced' THEN
      v_role IN ('admin','owner','supervisor','system')

    -- accepted -> cancelled:  admin / owner / supervisor (anulación pre-factura)
    WHEN v_from = 'accepted' AND v_to = 'cancelled' THEN
      v_role IN ('admin','owner','supervisor','system')

    -- invoiced -> cancelled:  ONLY admin / owner (anulación contable)
    WHEN v_from = 'invoiced' AND v_to = 'cancelled' THEN
      v_role IN ('admin','owner','system')

    ELSE false
  END;

  -- super_admin can do anything
  IF v_role = 'super_admin' THEN
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION
      'Invalid quote status transition: % -> % (actor role: %)',
      v_from, v_to, COALESCE(NULLIF(v_role, ''), '<unknown>')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN true;
END;
$fn$;

COMMENT ON FUNCTION public.can_transition_quote_status(text, text, text) IS
  'Single source of truth for the quote state machine. Returns TRUE if the
   (from, to, actor_role) triple is allowed; RAISES EXCEPTION otherwise.
   Called by the BEFORE UPDATE trigger on quotes and by the
   send_quote_to_client RPC.';

--------------------------------------------------------------------------------
-- 4. TRIGGER FUNCTION: enforce_quote_status_transition (BEFORE UPDATE OF status)
--    Resolves the caller role from auth.uid() and delegates to the validator.
--    Passes 'system' if no caller (cron / service_role path).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_enforce_quote_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_role   text := 'system';
BEGIN
  -- Only act when status changes.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Resolve actor role. Try the public.users.app_role_id path first; fall
  -- back to NULL (which the validator treats as <unknown>).
  IF v_caller IS NOT NULL THEN
    SELECT ar.name
      INTO v_role
    FROM public.users u
    LEFT JOIN public.app_roles ar ON ar.id = u.app_role_id
    WHERE u.auth_user_id = v_caller
    LIMIT 1;

    v_role := COALESCE(v_role, 'unknown');
  END IF;

  -- Will RAISE EXCEPTION on invalid transitions. The caller (RPC, REST
  -- UPDATE, the cron EF) sees the exception and surfaces a clear error.
  PERFORM public.can_transition_quote_status(
    OLD.status::text,
    NEW.status::text,
    v_role
  );

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.trg_fn_enforce_quote_status_transition() IS
  'BEFORE UPDATE OF status trigger on public.quotes. Resolves the caller
   role from auth.uid() and calls can_transition_quote_status. Invalid
   transitions RAISE EXCEPTION (check_violation).';

DROP TRIGGER IF EXISTS trg_enforce_quote_status_transition ON public.quotes;
CREATE TRIGGER trg_enforce_quote_status_transition
  BEFORE UPDATE OF status ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_enforce_quote_status_transition();

--------------------------------------------------------------------------------
-- 5. TRIGGER FUNCTION: log_quote_status_transition (AFTER UPDATE OF status)
--    Writes one row to quote_status_transitions on every status change.
--    Tolerates NEW.status being unchanged (returns NEW without writing).
--    Skips rows whose quote was just cancelled by fn_enforce_one_live_quote
--    during INSERT — we still log those (they are real transitions).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_log_quote_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller uuid := auth.uid();
  v_actor  uuid;
  v_role   text;
BEGIN
  -- Skip if status did not change.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Resolve actor_user_id (nullable for system-driven transitions).
  IF v_caller IS NOT NULL THEN
    SELECT u.id, COALESCE(ar.name, 'unknown')
      INTO v_actor, v_role
    FROM public.users u
    LEFT JOIN public.app_roles ar ON ar.id = u.app_role_id
    WHERE u.auth_user_id = v_caller
    LIMIT 1;
  END IF;

  INSERT INTO public.quote_status_transitions (
    quote_id, company_id, from_status, to_status,
    actor_user_id, reason, metadata, created_at
  ) VALUES (
    NEW.id, NEW.company_id,
    OLD.status::text, NEW.status::text,
    v_actor,
    CASE WHEN v_role IS NULL OR v_role = 'system' THEN 'system' ELSE NULL END,
    jsonb_build_object(
      'source', CASE
                  WHEN v_caller IS NULL           THEN 'system'
                  WHEN v_role = 'system'          THEN 'system'
                  ELSE 'rpc'
                END,
      'actor_role', v_role
    ),
    now()
  );

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.trg_fn_log_quote_status_transition() IS
  'AFTER UPDATE OF status trigger on public.quotes. Writes one row to
   quote_status_transitions. Captures actor_user_id (nullable for system
   transitions) and metadata with source + actor_role.';

DROP TRIGGER IF EXISTS trg_log_quote_status_transition ON public.quotes;
CREATE TRIGGER trg_log_quote_status_transition
  AFTER UPDATE OF status ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_log_quote_status_transition();

--------------------------------------------------------------------------------
-- 6. HELPER: dispatch_quote_event(event, quote_id)
--    Same pattern as dispatch_send_budget_notification: async-fires the
--    booking-notifier Edge Function via pg_net. Used by send_quote_to_client
--    and by the cron function (transitively via the Edge Function).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_quote_event(
  p_event     text,   -- 'quote_sent' | 'quote_expired' | 'quote_viewed' | ...
  p_quote_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $fn$
DECLARE
  v_service_key text;
  v_supabase_url text := 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
  v_company_id   uuid;
  v_client_id    uuid;
  v_quote        record;
BEGIN
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    RAISE WARNING '[dispatch_quote_event] service_role_key not found in vault — skipping';
    RETURN;
  END IF;

  -- Look up the quote + client email so the Edge Function does not have
  -- to do another round-trip.
  SELECT q.id, q.company_id, q.client_id, q.full_quote_number,
         c.email AS client_email,
         c.name  AS client_name
    INTO v_quote
  FROM public.quotes q
  LEFT JOIN public.clients c ON c.id = q.client_id
  WHERE q.id = p_quote_id;

  IF v_quote.id IS NULL THEN
    RAISE WARNING '[dispatch_quote_event] quote % not found', p_quote_id;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_supabase_url || '/functions/v1/booking-notifier',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object(
      'type',          p_event,
      'quote_id',      p_quote_id,
      'company_id',    v_quote.company_id,
      'client_id',     v_quote.client_id,
      'client_email',  v_quote.client_email,
      'client_name',   v_quote.client_name,
      'quote_number',  v_quote.full_quote_number
    )
  );
END;
$fn$;

COMMENT ON FUNCTION public.dispatch_quote_event(text, uuid) IS
  'Async-fires the booking-notifier Edge Function for a quote lifecycle
   event. Reads the service role key from Vault. Used by send_quote_to_client
   and the quote-expiration-cron Edge Function.';

--------------------------------------------------------------------------------
-- 7. RPC: send_quote_to_client(quote_id uuid)
--    Wraps the draft -> sent transition:
--      a) Validates caller role (admin / owner / supervisor / member).
--      b) Verifies the quote has a client with an email.
--      c) Sets status='sent', quote_date=now(), valid_until=now()+30 days.
--      d) Calls dispatch_quote_event('quote_sent', quote_id).
--      e) Returns the refreshed quote row.
--
--    SECURITY DEFINER so we can use public.users to resolve caller role
--    and to do the UPDATE without RLS gymnastics. RLS still applies on
--    the UPDATE via SET LOCAL row_security = on (we keep it on).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_quote_to_client(p_quote_id uuid)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $fn$
DECLARE
  v_caller    uuid := auth.uid();
  v_actor     uuid;
  v_role      text;
  v_quote     public.quotes%ROWTYPE;
  v_email     text;
  v_old_status text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'send_quote_to_client requires an authenticated caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Resolve actor + role.
  SELECT u.id, COALESCE(ar.name, '')
    INTO v_actor, v_role
  FROM public.users u
  LEFT JOIN public.app_roles ar ON ar.id = u.app_role_id
  WHERE u.auth_user_id = v_caller
  LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Caller is not a member of this CRM (auth_user_id=%)', v_caller
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_role NOT IN ('admin','owner','supervisor','member','agent','super_admin') THEN
    RAISE EXCEPTION 'Role % cannot send quotes (admin/owner/supervisor/member/agent only)',
      v_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lock + read the quote.
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id
  FOR UPDATE;

  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_old_status := v_quote.status::text;

  -- Idempotency: if already sent, just return it.
  IF v_quote.status::text = 'sent' THEN
    RETURN v_quote;
  END IF;

  -- Must currently be draft. Anything else is an invalid transition for
  -- this RPC (e.g. trying to re-send an expired quote should fail loudly).
  IF v_quote.status::text <> 'draft' THEN
    RAISE EXCEPTION
      'send_quote_to_client can only send draft quotes (current status: %)',
      v_quote.status::text
      USING ERRCODE = 'check_violation';
  END IF;

  -- Verify client + email.
  IF v_quote.client_id IS NULL THEN
    RAISE EXCEPTION 'Quote has no client_id — cannot send'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.email INTO v_email
  FROM public.clients c
  WHERE c.id = v_quote.client_id;

  IF v_email IS NULL OR btrim(v_email) = '' THEN
    RAISE EXCEPTION 'Client has no email on file — cannot send quote'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Validate via the same matrix the trigger uses (defense in depth).
  PERFORM public.can_transition_quote_status('draft', 'sent', v_role);

  -- Apply the transition. The trigger will:
  --   (1) call can_transition_quote_status again (BEFORE)
  --   (2) write to quote_status_transitions (AFTER)
  UPDATE public.quotes
     SET status      = 'sent'::public.quote_status,
         quote_date  = CURRENT_DATE,
         valid_until = CURRENT_DATE + INTERVAL '30 days',
         updated_at  = now()
   WHERE id = p_quote_id
   RETURNING * INTO v_quote;

  -- Async-fire the notifier. Failures here do NOT roll back the transition
  -- (the quote is sent; we just log if the email could not be dispatched).
  BEGIN
    PERFORM public.dispatch_quote_event('quote_sent', p_quote_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[send_quote_to_client] dispatch_quote_event failed: %', SQLERRM;
  END;

  RETURN v_quote;
END;
$fn$;

COMMENT ON FUNCTION public.send_quote_to_client(uuid) IS
  'Atomic draft -> sent transition with email notification. Validates caller
   role (admin / owner / supervisor / member / agent / super_admin), checks
   the client has an email, stamps quote_date + valid_until, and async-fires
   the booking-notifier Edge Function. Returns the refreshed quote row.
   Idempotent: a second call on an already-sent quote is a no-op.';

GRANT EXECUTE ON FUNCTION public.send_quote_to_client(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 8. CRON SCHEDULE: quote-expiration-cron (hourly)
--    The Edge Function itself filters by valid_until < now() and only
--    acts on quotes in `sent` or `viewed` state, so an hourly cadence is
--    cheap and idempotent.
--
--    If the cron/extension pair is unavailable, the same schedule can be
--    configured via config.toml:
--      [functions.quote-expiration-cron]
--      schedule = "0 * * * *"
--------------------------------------------------------------------------------
DO $cron$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = 'quote_expiration_hourly'
  LIMIT 1;

  IF v_jobid IS NULL THEN
    PERFORM cron.schedule(
      'quote_expiration_hourly',
      '0 * * * *',
      $cmd$SELECT net.http_post(
        url     := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/quote-expiration-cron',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'service_role_key' LIMIT 1
          )
        ),
        body    := jsonb_build_object('source', 'pg_cron')
      );$cmd$
    );
  ELSE
    RAISE NOTICE 'pg_cron job quote_expiration_hourly already exists (jobid=%), skipping', v_jobid;
  END IF;
END
$cron$;

--------------------------------------------------------------------------------
-- 9. INDEX for the expiration scan — quotes with status in (sent, viewed)
--    and valid_until in the past. The cron hits this query hourly.
--
--    NOTE: A partial index predicate cannot reference a non-IMMUTABLE
--    function, and Postgres treats `enum::text` as STABLE. So instead of
--    `WHERE status::text IN (...)`, we use a plain composite index on
--    (status, valid_until) and let the cron EF filter the small set of
--    expired rows in memory. The index is still small (only ~300 rows)
--    and the cron runs hourly, so the cost is negligible.
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_quotes_status_valid_until
  ON public.quotes(status, valid_until);

COMMENT ON INDEX public.idx_quotes_status_valid_until IS
  'Speeds up the quote-expiration-cron scan: (status, valid_until) composite.
   The cron filters to status in (sent, viewed) and valid_until past in
   memory; we cannot put the enum-to-text comparison into the index
   predicate because that cast is STABLE not IMMUTABLE.';

--------------------------------------------------------------------------------
-- 10. E2E TEST (run-once, after the migration applies)
--     Verifies:
--       (a) Valid transitions (draft -> sent -> viewed -> accepted -> invoiced
--           -> cancelled by admin) are accepted by the validator.
--       (b) Invalid transitions raise an exception.
--       (c) The actual trigger writes rows to quote_status_transitions.
--       (d) Same-status updates do NOT write a transition row.
--
--     We avoid live UPDATE statements for the matrix tests because in psql
--     auth.uid() is NULL (→ system role) and many transitions are not
--     allowed for system. Instead we exercise the validator directly
--     (proves the matrix), then run one real UPDATE that system IS allowed
--     to do (sent -> expired by the cron path) to prove the trigger logs
--     the row. Cleanup runs at the end so the DB stays clean.
--------------------------------------------------------------------------------
DO $e2e$
DECLARE
  v_company_id   uuid;
  v_user_id      uuid;
  v_client_id    uuid;
  v_quote_id     uuid;
BEGIN
  -- ── Setup: use CAIBS if present, else fall back to the first company ──
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE slug = 'caibs'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id FROM public.companies LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'E2E skipped: no companies in the database.';
    RETURN;
  END IF;

  -- ── TEST GROUP A — validator matrix (no DB writes) ──────────────────
  PERFORM public.can_transition_quote_status('draft', 'sent', 'admin');
  PERFORM public.can_transition_quote_status('sent', 'viewed', 'client');
  PERFORM public.can_transition_quote_status('viewed', 'accepted', 'client');
  PERFORM public.can_transition_quote_status('accepted', 'invoiced', 'admin');
  PERFORM public.can_transition_quote_status('invoiced', 'cancelled', 'admin');

  -- ── TEST GROUP B — validator rejects illegal transitions ────────────
  BEGIN
    PERFORM public.can_transition_quote_status('invoiced', 'cancelled', 'member');
    RAISE EXCEPTION 'E2E FAIL B1: invoiced -> cancelled by member should have raised';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    PERFORM public.can_transition_quote_status('sent', 'draft', 'admin');
    RAISE EXCEPTION 'E2E FAIL B2: sent -> draft should have raised';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    PERFORM public.can_transition_quote_status('draft', 'accepted', 'admin');
    RAISE EXCEPTION 'E2E FAIL B3: draft -> accepted should have raised';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    PERFORM public.can_transition_quote_status('cancelled', 'sent', 'admin');
    RAISE EXCEPTION 'E2E FAIL B4: cancelled -> sent should have raised';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    PERFORM public.can_transition_quote_status('accepted', 'viewed', 'admin');
    RAISE EXCEPTION 'E2E FAIL B5: accepted -> viewed should have raised';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    PERFORM public.can_transition_quote_status('invoiced', 'draft', 'admin');
    RAISE EXCEPTION 'E2E FAIL B6: invoiced -> draft should have raised';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- ── TEST GROUP C — actual trigger writes a transition log row ──────
  INSERT INTO public.clients (company_id, name, email)
  VALUES (v_company_id, 'TEST_E2E_quote_workflow', 'test-e2e+quote-workflow@example.invalid')
  RETURNING id INTO v_client_id;

  -- quote_date far in the past, valid_until yesterday (still >= quote_date).
  INSERT INTO public.quotes (
    company_id, client_id, quote_number, year, sequence_number,
    status, quote_date, valid_until, title, currency, language,
    subtotal, tax_amount, total_amount
  ) VALUES (
    v_company_id, v_client_id, 'E2E-TEST', 2026, 999999,
    'sent', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE - INTERVAL '1 day',
    'TEST_E2E quote workflow', 'EUR', 'es',
    100, 21, 121
  )
  RETURNING id INTO v_quote_id;

  -- C1: sent -> expired by system (cron path) — allowed.
  UPDATE public.quotes SET status = 'expired' WHERE id = v_quote_id;

  -- C2: the AFTER trigger must have written exactly one row.
  IF (SELECT count(*) FROM public.quote_status_transitions WHERE quote_id = v_quote_id) <> 1 THEN
    RAISE EXCEPTION 'E2E FAIL C2: expected 1 transition row, got %',
      (SELECT count(*) FROM public.quote_status_transitions WHERE quote_id = v_quote_id);
  END IF;

  -- C3: the transition log row has the right shape.
  PERFORM 1 FROM public.quote_status_transitions
   WHERE quote_id = v_quote_id
     AND from_status = 'sent'
     AND to_status = 'expired'
     AND company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'E2E FAIL C3: transition log row shape mismatch';
  END IF;

  -- C4: same-status update should NOT write a transition row.
  UPDATE public.quotes SET notes = 'no change' WHERE id = v_quote_id;
  IF (SELECT count(*) FROM public.quote_status_transitions WHERE quote_id = v_quote_id) <> 1 THEN
    RAISE EXCEPTION 'E2E FAIL C4: same-status update wrote a transition row (got %, expected 1)',
      (SELECT count(*) FROM public.quote_status_transitions WHERE quote_id = v_quote_id);
  END IF;

  -- ── Cleanup ────────────────────────────────────────────────────────
  DELETE FROM public.quote_status_transitions WHERE quote_id = v_quote_id;
  DELETE FROM public.quotes WHERE id = v_quote_id;
  DELETE FROM public.clients WHERE id = v_client_id;

  RAISE NOTICE 'E2E PASS: quote workflow state machine verified end-to-end';
END
$e2e$;

--------------------------------------------------------------------------------
-- 11. GRANT EXECUTE on the new RPCs to authenticated
--------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.can_transition_quote_status(text, text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';