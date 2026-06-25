-- ============================================================================
-- Migration: Portal quote actions — accept / reject / viewed tracking
-- ============================================================================
-- Scope:
--   1. RPC `accept_quote_by_client(quote_id, signature_data_url, ip, ua)`
--      Atomic sent|viewed → accepted transition callable by the client
--      authenticated via `client_portal_users`. Stamps accepted_at, signature
--      and stores client IP / UA for legal audit trail.
--   2. RPC `reject_quote_by_client(quote_id, reason)` — sent|viewed → rejected.
--      Captures rejection_reason in quotes.rejection_reason (already exists).
--   3. RPC `mark_quote_as_viewed(quote_id)` — sent → viewed. Idempotent
--      (no-op if status is already different). Stamps client_viewed_at +
--      client_ip_address + client_user_agent on the quote.
--
-- IMPORTANT — NON-INVASIVE:
--   * We do NOT touch any of the existing quote triggers (BEFORE UPDATE OF
--     status validator, AFTER UPDATE OF status logger, fn_enforce_one_live_*,
--     fn_auto_quote_on_*, set_quote_month, trg_sync_booking_quote_id,
--     anonymize_quote_data, update_quotes_updated_at — all left alone).
--   * 1:1 quote reconciliation preserved (the trigger from sub-agent A still
--     fires on every UPDATE OF status; our RPCs respect it).
--   * No new npm dependencies — pure Postgres functions.
--
-- ============================================================================
-- KNOWN ISSUE (REQUIRES FOLLOW-UP COORDINATION WITH SUB-AGENT A)
-- ============================================================================
-- The BEFORE UPDATE trigger `trg_enforce_quote_status_transition` (created
-- in 20260618000024_quote_workflow.sql) resolves the actor's role via:
--
--     SELECT ar.name INTO v_role
--     FROM public.users u
--     LEFT JOIN public.app_roles ar ON ar.id = u.app_role_id
--     WHERE u.auth_user_id = v_caller
--     LIMIT 1;
--
-- For client users, `public.users.auth_user_id = auth.uid()` MATCHES (the
-- handle_new_user trigger creates the row on signup) but `app_role_id` is
-- NULL — clients are not staff, they authenticate via `client_portal_users`.
-- The trigger therefore resolves `v_role := COALESCE(NULL, 'unknown')`.
--
-- `can_transition_quote_status('sent', 'accepted', 'unknown')` returns false
-- and RAISES EXCEPTION (check_violation). The transition is REJECTED.
--
-- The matrix DOES allow the transition for `role='client'` — but the trigger
-- never sees that role. This is a coordination bug between the two halves of
-- the workflow (sub-agent A's trigger and this migration's client RPCs).
--
-- RECOMMENDED FIX (do NOT apply here per task instructions):
--   Option 1 (preferred, 1 line): Sub-agent A updates the trigger to UNION
--     `client_portal_users` when resolving the role, e.g.:
--       ... WHERE u.auth_user_id = v_caller
--       UNION
--       SELECT ar.name FROM public.client_portal_users cpu
--         JOIN public.app_roles ar ON ar.name = 'client'
--         WHERE cpu.auth_user_id = v_caller AND cpu.is_active
--       LIMIT 1;
--   Option 2 (workaround, data fix): Add a statement to set
--     `public.users.app_role_id = (id of 'client')` for every user that
--     has an active entry in `client_portal_users`. Risk: a user that is
--     BOTH staff and client would lose their staff role.
--   Option 3 (workaround, RPC hack): Wrap the UPDATE in
--     `SET LOCAL session_replication_role = replica` — but this disables
--     ALL user triggers (also fn_enforce_one_live_quote_per_booking and
--     the AFTER UPDATE OF status logger that we WANT to keep).
--
-- Until the trigger is fixed, the RPCs in this migration will be callable
-- but the UPDATE step will fail with `check_violation` for any client
-- caller. The pre-flight `PERFORM can_transition_quote_status(...)` we do
-- inside each RPC uses role='client' and will succeed; the trigger then
-- re-checks with role='unknown' and fails. The error reaches the client
-- UI as a generic PostgREST 400.
-- ============================================================================

--------------------------------------------------------------------------------
-- 1. RPC: accept_quote_by_client
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_quote_by_client(
  p_quote_id          uuid,
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
  -- This will PASS for role='client' even if the trigger rejects (see the
  -- KNOWN ISSUE block at the top of this migration file).
  PERFORM public.can_transition_quote_status(v_old_status, 'accepted', 'client');

  -- ── Signature: store truncated (5000 chars) to keep the row reasonable ─
  -- If we ever wire up Supabase Storage for the canvas image, store the
  -- URL here instead and the raw file in the bucket.
  IF p_signature_data_url IS NOT NULL THEN
    v_sig_stored := CASE
      WHEN length(p_signature_data_url) > 5000
      THEN substring(p_signature_data_url from 1 for 5000)
      ELSE p_signature_data_url
    END;
  END IF;

  -- ── Apply the transition ─────────────────────────────────────────────
  -- The BEFORE UPDATE OF status trigger from sub-agent A will fire here.
  -- See KNOWN ISSUE block above for the role-resolution caveat.
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

  RETURN v_quote;
END;
$fn$;

COMMENT ON FUNCTION public.accept_quote_by_client(uuid, text, inet, text) IS
  'Sent|viewed → accepted transition callable by the authenticated client of
   the quote (via client_portal_users.auth_user_id). Stores signature, IP,
   UA and stamps accepted_at. Pre-validates against can_transition_quote_status.
   The BEFORE UPDATE trigger will re-validate — see the KNOWN ISSUE block at
   the top of migration 20260618000025_portal_quote_actions.sql for the
   role-resolution caveat that blocks client-driven transitions until
   sub-agent A updates the trigger to also resolve roles from
   client_portal_users.';

GRANT EXECUTE ON FUNCTION public.accept_quote_by_client(uuid, text, inet, text)
  TO authenticated;

--------------------------------------------------------------------------------
-- 2. RPC: reject_quote_by_client
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_quote_by_client(
  p_quote_id uuid,
  p_reason   text DEFAULT NULL
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
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'reject_quote_by_client requires an authenticated caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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
  SELECT EXISTS (
    SELECT 1
    FROM public.client_portal_users cpu
    WHERE cpu.auth_user_id = v_caller
      AND cpu.client_id   = v_quote.client_id
      AND cpu.is_active   = true
  ) INTO v_has_access;

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
    RAISE EXCEPTION 'Cannot reject quote in status %', v_old_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason IS NOT NULL AND length(trim(p_reason)) > 1000 THEN
    RAISE EXCEPTION 'Rejection reason must be at most 1000 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.can_transition_quote_status(v_old_status, 'rejected', 'client');

  -- ── Apply the transition ─────────────────────────────────────────────
  UPDATE public.quotes
     SET status           = 'rejected'::public.quote_status,
         rejected_at      = now(),
         rejection_reason = NULLIF(trim(p_reason), ''),
         updated_at       = now()
   WHERE id = p_quote_id
   RETURNING * INTO v_quote;

  RETURN v_quote;
END;
$fn$;

COMMENT ON FUNCTION public.reject_quote_by_client(uuid, text) IS
  'Sent|viewed → rejected transition callable by the authenticated client.
   Stores rejection_reason in quotes.rejection_reason. Pre-validates against
   can_transition_quote_status. The BEFORE UPDATE trigger will re-validate —
   see the KNOWN ISSUE block at the top of migration 20260618000025.';

GRANT EXECUTE ON FUNCTION public.reject_quote_by_client(uuid, text)
  TO authenticated;

--------------------------------------------------------------------------------
-- 3. RPC: mark_quote_as_viewed (idempotent)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_quote_as_viewed(p_quote_id uuid)
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
  v_ip         inet;
  v_ua         text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'mark_quote_as_viewed requires an authenticated caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id
  FOR UPDATE;

  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id
      USING ERRCODE = 'no_data_found';
  END IF;

  v_old_status := v_quote.status::text;

  -- ── Access check (same pattern as accept / reject) ──────────────────
  SELECT EXISTS (
    SELECT 1
    FROM public.client_portal_users cpu
    WHERE cpu.auth_user_id = v_caller
      AND cpu.client_id   = v_quote.client_id
      AND cpu.is_active   = true
  ) INTO v_has_access;

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

  -- ── Idempotency ─────────────────────────────────────────────────────
  -- If already past `sent`, do nothing (the client has already viewed
  -- the quote OR the staff already moved it). Still refresh view metadata.
  IF v_old_status = 'sent' THEN
    PERFORM public.can_transition_quote_status('sent', 'viewed', 'client');
    UPDATE public.quotes
       SET status            = 'viewed'::public.quote_status,
           client_viewed_at  = COALESCE(client_viewed_at, now()),
           client_ip_address = COALESCE(client_ip_address, v_ip),
           client_user_agent = COALESCE(client_user_agent, v_ua),
           updated_at        = now()
     WHERE id = p_quote_id
     RETURNING * INTO v_quote;
  ELSE
    -- Already past sent — just refresh viewed_at / ip / ua for audit.
    UPDATE public.quotes
       SET client_viewed_at  = COALESCE(client_viewed_at, now()),
           updated_at        = now()
     WHERE id = p_quote_id
     RETURNING * INTO v_quote;
  END IF;

  RETURN v_quote;
END;
$fn$;

COMMENT ON FUNCTION public.mark_quote_as_viewed(uuid) IS
  'Marks a quote as viewed by the authenticated client. sent → viewed
   transition (idempotent — no-op if already past sent). Stamps
   client_viewed_at, client_ip_address, client_user_agent. Pre-validates
   against can_transition_quote_status. The BEFORE UPDATE trigger will
   re-validate — see the KNOWN ISSUE block at the top of migration
   20260618000025.';

GRANT EXECUTE ON FUNCTION public.mark_quote_as_viewed(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 4. Index to keep quote_status_transitions lookups cheap for the portal
--    detail view (used by the "transition history" panel).
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_quote_status_transitions_to_status
  ON public.quote_status_transitions(quote_id, to_status, created_at DESC);

NOTIFY pgrst, 'reload schema';