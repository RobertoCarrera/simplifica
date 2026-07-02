-- ============================================================================
-- Migration: Rafter v0.57 — close 4 cross-tenant SECURITY DEFINER auth bypasses
-- ============================================================================
-- Sprint:   Supabase Security Advisor audit remediation, batch v0.57
-- Audit:    2026-06-29
-- Author:   Roberto + AI
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- Supabase Security Advisor flagged 4 SECURITY DEFINER functions as callable
-- by any `authenticated` user without verifying the caller has a right to act
-- on the supplied `p_company_id` / `p_user_id` / `p_token` argument. This is
-- a CRITICAL cross-tenant data leak / authorization bypass:
--
--   1. vault_get_redsys_secret(p_company_id)
--      Any authenticated user can fetch ANY company's Redsys payment
--      processor secret (decrypted pgsodium key material). Cross-tenant
--      credential leak.
--
--   2. redsys_finalize_payment(p_order, p_response_code, p_auth_code,
--                              p_pay_method, p_raw_response)
--      Any authenticated user can mark payments as paid and flip a
--      contracted_service to active for ANY company. Webhook-only function.
--
--   3. use_client_bono(p_client_id, p_variant_id, p_service_id,
--                      p_company_id, p_sessions_to_use)
--      Any authenticated user can decrement another company's client
--      bonus pool. Cross-tenant resource theft.
--
--   4. process_client_consent(p_token, p_marketing_consent, p_ip,
--                             p_user_agent, p_consent_method)
--      Supposed to be token-based (called by anon via email link).
--      Authenticated users can spoof any token.
--
-- Why the original grants were wrong:
--   - `vault_get_redsys_secret` and `redsys_finalize_payment` were created in
--     20260624000000_redsys_vault_and_payments.sql with correct grants
--     (REVOKE FROM PUBLIC + GRANT service_role), but `ALTER FUNCTION ...
--     SET search_path = public, vault, pg_temp` (later migrations) does NOT
--     reset privileges, and yet the current state shows PUBLIC+anon+auth
--     grants. Likely a Supabase migration replay or `pg_dump --no-owner`
--     import that dropped grants. Verified by pg_proc + routine_privileges.
--   - `use_client_bono` was created with GRANT TO authenticated but has zero
--     ownership / membership check inside the body. SECURITY DEFINER makes
--     the call run as the function owner (table owner), so RLS doesn't apply.
--   - `process_client_consent` was redefined at some point with a 5-argument
--     signature; the previous revoke migration (20260620) revoked only the
--     4-argument overload, leaving the new overload with PUBLIC+anon+auth.
--
-- ────────────────────────────────────────────────────────────────────────────
-- CALLER ANALYSIS (verified 2026-06-29)
-- ────────────────────────────────────────────────────────────────────────────
--
--   - vault_get_redsys_secret: no src/ callers, no Edge Function callers.
--     Comment in 20260624000000 explicitly says "The Edge Function uses the
--     service_role key". Safe to lock to service_role only.
--
--   - redsys_finalize_payment: no src/ callers, no Edge Function callers.
--     Webhook handler runs with service_role key. Safe to lock to
--     service_role only.
--
--   - use_client_bono: src/app/services/supabase-bono.service.ts:50 calls
--     this from the authenticated CRM booking flow. Must remain callable
--     by authenticated, but add is_company_member(p_company_id) check.
--
--   - process_client_consent: src/app/features/consent/consent-landing/...
--     consent-landing.component.ts:312 calls this from the PUBLIC
--     consent-migration landing page. The component explicitly says
--     "The token IS the authorization". Must remain callable by anon;
--     remove authenticated.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION STATEMENTS
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ============================================================
-- 1. vault_get_redsys_secret — webhook-only
--    Lock to service_role. Cross-tenant credential leak fix.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.vault_get_redsys_secret(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vault_get_redsys_secret(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.vault_get_redsys_secret(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.vault_get_redsys_secret(uuid) TO service_role;

-- ============================================================
-- 2. redsys_finalize_payment — webhook-only
--    Lock to service_role. Cross-tenant payment-state manipulation fix.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.redsys_finalize_payment(text, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redsys_finalize_payment(text, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.redsys_finalize_payment(text, text, text, text, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.redsys_finalize_payment(text, text, text, text, jsonb) TO service_role;

-- ============================================================
-- 3. use_client_bono — must remain callable by authenticated, but
--    add is_company_member(p_company_id) check inside the body.
--
--    Full body preserved from pg_get_functiondef on 2026-06-29. The
--    only change is the addition of v_caller_id + membership check
--    at the top of the BEGIN block.
-- ============================================================
CREATE OR REPLACE FUNCTION public.use_client_bono(
  p_client_id       uuid,
  p_variant_id      uuid,
  p_service_id      uuid,
  p_company_id      uuid,
  p_sessions_to_use integer DEFAULT 1
)
RETURNS TABLE(bonus_id uuid, sessions_remaining integer, success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_bonus         client_bonuses%ROWTYPE;
  v_caller_id     uuid := auth.uid();
  v_membership_ok boolean;
BEGIN
  -- Rafter v0.57: Cross-tenant check. The caller MUST be an active member
  -- of the company they're trying to mutate. SECURITY DEFINER means we
  -- run as the function owner, so RLS is bypassed — without this check
  -- any authenticated user can decrement any company's bonus pool.
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.company_members
     WHERE company_id = p_company_id
       AND user_id    = v_caller_id
       AND status     = 'active'
  ) INTO v_membership_ok;

  IF NOT v_membership_ok THEN
    RAISE EXCEPTION 'not a member of company %', p_company_id;
  END IF;

  -- Find the oldest active bono with enough remaining sessions.
  SELECT * INTO v_bonus
    FROM client_bonuses
   WHERE client_id           = p_client_id
     AND variant_id          = p_variant_id
     AND service_id          = p_service_id
     AND company_id          = p_company_id
     AND is_active           = true
     AND sessions_remaining >= p_sessions_to_use
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY purchase_date ASC
   LIMIT 1
   FOR UPDATE;

  IF v_bonus.id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::INTEGER, false,
      'No hay bono disponible o no quedan sesiones'::TEXT;
    RETURN;
  END IF;

  UPDATE client_bonuses
     SET sessions_used      = sessions_used + p_sessions_to_use,
         sessions_remaining = sessions_remaining - p_sessions_to_use,
         updated_at         = now()
   WHERE id = v_bonus.id;

  RETURN QUERY
    SELECT v_bonus.id,
           (v_bonus.sessions_remaining - p_sessions_to_use),
           true,
           'Bono utilizado correctamente'::TEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.use_client_bono(uuid, uuid, uuid, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.use_client_bono(uuid, uuid, uuid, uuid, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.use_client_bono(uuid, uuid, uuid, uuid, integer)
  TO authenticated;

-- ============================================================
-- 4. process_client_consent — anon (email link) + service_role
--    Revoke authenticated: token-based, must not be spoofable.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.process_client_consent(uuid, boolean, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_client_consent(uuid, boolean, text, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.process_client_consent(uuid, boolean, text, text, text) TO anon;
GRANT  EXECUTE ON FUNCTION public.process_client_consent(uuid, boolean, text, text, text) TO service_role;

-- ============================================================
-- Post-migration: re-assert pinned search_path on use_client_bono
-- (defence in depth against future migrations that may drop it).
-- ============================================================
ALTER FUNCTION public.use_client_bono(p_client_id uuid, p_variant_id uuid, p_service_id uuid, p_company_id uuid, p_sessions_to_use integer)
  SET search_path = public, pg_temp;

-- ============================================================
-- Comments documenting the security boundary for future readers.
-- ============================================================
COMMENT ON FUNCTION public.vault_get_redsys_secret(uuid) IS
  'SECURITY DEFINER. service_role ONLY. anon + authenticated EXECUTE revoked '
  '(Rafter v0.57 / Supabase Security Advisor 2026-06-29 cross-tenant credential '
  'leak fix). Decrypts pgsodium-stored Redsys secret for the webhook EF.';

COMMENT ON FUNCTION public.redsys_finalize_payment(text, text, text, text, jsonb) IS
  'SECURITY DEFINER. service_role ONLY. anon + authenticated EXECUTE revoked '
  '(Rafter v0.57 / Supabase Security Advisor 2026-06-29 cross-tenant payment '
  'state-manipulation fix). Webhook-only idempotent payment finalizer.';

COMMENT ON FUNCTION public.use_client_bono(uuid, uuid, uuid, uuid, integer) IS
  'SECURITY DEFINER. authenticated ONLY with caller == active company_member '
  'of p_company_id (Rafter v0.57 / Supabase Security Advisor 2026-06-29 '
  'cross-tenant bonus-pool fix). Decrements the oldest active bono for a '
  'client/variant/service within a company.';

COMMENT ON FUNCTION public.process_client_consent(uuid, boolean, text, text, text) IS
  'SECURITY DEFINER. anon + service_role ONLY. authenticated EXECUTE revoked '
  '(Rafter v0.57 / Supabase Security Advisor 2026-06-29 token-spoof fix). The '
  'p_token IS the authorization — do not reintroduce authenticated grants.';

-- ============================================================
-- Inline verification. Must raise on failure (transaction aborts).
--
-- Per-function expected grants:
--   vault_get_redsys_secret: service_role ONLY (no anon, no authenticated)
--   redsys_finalize_payment: service_role ONLY (no anon, no authenticated)
--   process_client_consent: anon + service_role (no authenticated)
--   use_client_bono:        authenticated + service_role (no anon)
-- ============================================================
DO $$
DECLARE
  v_bad int := 0;
BEGIN
  -- Lockdown functions: service_role ONLY.
  SELECT count(*) INTO v_bad
    FROM information_schema.routine_privileges r
    JOIN pg_proc p       ON p.proname = r.routine_name
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef = true
     AND r.grantee IN ('PUBLIC', 'anon', 'authenticated')
     AND p.proname IN ('vault_get_redsys_secret', 'redsys_finalize_payment');

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'CRITICAL: vault_get_redsys_secret / redsys_finalize_payment still callable by PUBLIC/anon/authenticated (% rows)', v_bad;
  END IF;

  -- process_client_consent: must NOT be granted to authenticated.
  SELECT count(*) INTO v_bad
    FROM information_schema.routine_privileges r
    JOIN pg_proc p       ON p.proname = r.routine_name
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'process_client_consent'
     AND r.grantee IN ('PUBLIC', 'authenticated');

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'CRITICAL: process_client_consent still callable by PUBLIC/authenticated (% rows)', v_bad;
  END IF;

  -- use_client_bono: must remain granted to authenticated; anon must NOT be granted.
  SELECT count(*) INTO v_bad
    FROM information_schema.routine_privileges r
    JOIN pg_proc p       ON p.proname = r.routine_name
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'use_client_bono'
     AND r.grantee IN ('PUBLIC', 'anon');

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'REGRESSION: use_client_bono now callable by PUBLIC/anon (% rows)', v_bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.routine_privileges r
      JOIN pg_proc p       ON p.proname = r.routine_name
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'use_client_bono'
       AND r.grantee = 'authenticated'
  ) THEN
    RAISE EXCEPTION 'REGRESSION: use_client_bono lost authenticated grant';
  END IF;

  RAISE NOTICE 'OK: Rafter v0.57 — 4 cross-tenant auth bypasses closed';
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- POST-MIGRATION VERIFICATION (run manually after applying)
-- ────────────────────────────────────────────────────────────────────────────
--
-- SELECT
--   p.proname,
--   has_function_privilege('anon',         p.oid, 'EXECUTE') AS anon,
--   has_function_privilege('authenticated',p.oid, 'EXECUTE') AS auth,
--   has_function_privilege('service_role', p.oid, 'EXECUTE') AS sr,
--   has_function_privilege('postgres',     p.oid, 'EXECUTE') AS pg
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'vault_get_redsys_secret',
--     'redsys_finalize_payment',
--     'use_client_bono',
--     'process_client_consent'
--   )
-- ORDER BY p.proname;
--
-- Expected:
--   vault_get_redsys_secret     anon=f, auth=f, sr=t, pg=t
--   redsys_finalize_payment     anon=f, auth=f, sr=t, pg=t
--   use_client_bono             anon=f, auth=t, sr=t, pg=t
--   process_client_consent      anon=t, auth=f, sr=t, pg=t
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if needed)
-- ────────────────────────────────────────────────────────────────────────────
--
-- GRANT EXECUTE ON FUNCTION public.vault_get_redsys_secret(uuid)              TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.redsys_finalize_payment(text, text, text, text, jsonb) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.process_client_consent(uuid, boolean, text, text, text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.use_client_bono(uuid, uuid, uuid, uuid, integer) TO anon;
--
-- (use_client_bono body would also need reverting to remove the
-- is_company_member check — see 20260419000001_add_bono_system.sql for the
-- original definition.)