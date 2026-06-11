-- ─────────────────────────────────────────────────────────────────────────────
-- Fix complete_onboarding RPC + bulk backfill (10 jun 2026)
-- Project: simplifica (ref: ufutyjbqfjrlzkprvyvs)
--
-- ROOT CAUSE (discovered 2026-06-10):
--   The original `public.complete_onboarding(p_user_id uuid)` RPC, deployed on
--   2026-04-21, has a SYNTAX BUG that has caused it to fail on EVERY invocation
--   since deployment. The bug is at the `RETURNING jsonb_build_object(...)`
--   clause: PostgreSQL's `RETURNING` only allows column names, not expressions.
--   The correct pattern is to use a variable or to use `COALESCE` in a CTE.
--
--   On the frontend side, the call site
--   (src/app/features/auth/complete-profile/complete-profile.component.ts:637-646)
--   wraps the RPC in a try/catch that ONLY does `console.warn` on failure.
--   This means the bug went silently undetected for ~7 weeks.
--
--   IMPACT:
--     - 100% of users who completed the onboarding flow via the UI have
--       `onboarding_completed = false` in the DB, because the RPC always failed.
--     - Owners/admins (role != 'member') get redirected by OwnerAdminGuard
--       to /complete-profile?from=incomplete on every navigation to
--       Presupuestos / RGPD / Servicios. This is exactly what the user
--       'gestio@caibs.es' (Miriam, owner of CAIBS) hit on 2026-06-10.
--     - Other users with the same symptom likely exist in the DB.
--
--   FIX:
--     1. Re-create the RPC with correct syntax + row-found detection.
--     2. Backfill: mark onboarding_completed=true for any owner/admin who
--        already has at least one verified MFA factor AND has logged in.
--        This covers everyone who actually completed the flow (they have MFA
--        configured as required by the UI). We DO NOT touch member-role users
--        because the guard bypasses onboarding for them.
--     3. Document the bug and the backfill so it is auditable.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Re-create the RPC with correct syntax ────────────────────────────────
-- Use a variable + RETURNING INTO, then build the response explicitly.
-- Also detect row-not-found and return a distinguishable result so the
-- frontend can react.

CREATE OR REPLACE FUNCTION public.complete_onboarding(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_rows_affected int;
BEGIN
  UPDATE public.users
  SET onboarding_completed = true,
      updated_at = now()
  WHERE auth_user_id = p_user_id
  RETURNING id INTO v_user_id;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    -- Distinguishable error response — frontend should NOT treat as success
    RETURN jsonb_build_object(
      'success', false,
      'error', 'no_user_found',
      'message', format('No public.users row found with auth_user_id = %s', p_user_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'onboarding_completed', true
  );
END;
$$;

-- Ensure the function is callable by authenticated users (it must be — the
-- frontend calls it with the user's own session). The original grant was
-- implicit (SECURITY DEFINER + public schema default), but make it explicit
-- for clarity and to survive future schema permission refactors.
GRANT EXECUTE ON FUNCTION public.complete_onboarding(uuid) TO authenticated;

COMMENT ON FUNCTION public.complete_onboarding(uuid) IS
  'Marks onboarding_completed=true for the public.users row whose auth_user_id '
  'matches p_user_id. Returns {success: true, user_id, onboarding_completed} on '
  'success, or {success: false, error: no_user_found, message} if no row matches. '
  'Patched 2026-06-10 to fix syntax error in original implementation that caused '
  'silent failure since 2026-04-21 deployment.';

-- ── 2) Backfill: mark owners/admins who already have MFA + logins ───────────
-- Eligibility criteria (matches the "real" onboarding completion, as enforced
-- by the UI):
--   - Has at least 1 verified MFA factor in auth.mfa_factors
--   - Has signed in at least once (auth.last_sign_in_at IS NOT NULL)
--   - Has app_role in (owner, admin, super_admin) — the roles that get redirected
--     by OwnerAdminGuard when onboarding_completed = false
--   - Currently has onboarding_completed = false
--
-- We restrict to owner/admin/super_admin because:
--   - 'member' role is NOT redirected by the guard (forceEnroll = role != 'member')
--   - 'professional' / 'client' / 'supervisor' are also not redirected
-- So only owners+admins+super_admins are actually broken. Touching others would
-- be over-reach and might mark incomplete flows as done.
--
-- We do NOT add a per-user audit trail column here — onboarding_completed_at
-- is a reasonable follow-up but not strictly needed. The updated_at column on
-- the row will reflect this backfill.

DO $$
DECLARE
  v_count int := 0;
BEGIN
  WITH eligible AS (
    SELECT u.id
    FROM public.users u
    JOIN public.app_roles ar ON ar.id = u.app_role_id
    JOIN auth.users au ON au.id = u.auth_user_id
    WHERE ar.name IN ('owner', 'admin', 'super_admin')
      AND u.onboarding_completed = false
      AND EXISTS (
        SELECT 1 FROM auth.mfa_factors f
        WHERE f.user_id = u.auth_user_id AND f.status = 'verified'
      )
      AND au.last_sign_in_at IS NOT NULL
  ),
  updated AS (
    UPDATE public.users u
    SET onboarding_completed = true,
        updated_at = now()
    FROM eligible e
    WHERE u.id = e.id
    RETURNING u.id
  )
  SELECT count(*) INTO v_count FROM updated;

  RAISE NOTICE '[complete_onboarding_backfill] Marked % owner/admin/super_admin users as onboarding_completed=true (had MFA + previous login)', v_count;
END
$$;

-- ── 3) Optional diagnostic query (commented out, run manually if needed) ────
-- Show any remaining owners/admins with onboarding_completed=false. If the
-- count is 0 after the backfill, all real cases are covered. Any remaining
-- users are users who never actually completed the onboarding flow and should
-- legitimately be redirected to /complete-profile.
--
-- SELECT u.email, ar.name AS role, u.onboarding_completed,
--        (SELECT count(*) FROM auth.mfa_factors WHERE user_id=u.auth_user_id AND status='verified') AS mfa_count,
--        au.last_sign_in_at
-- FROM public.users u
-- JOIN public.app_roles ar ON ar.id = u.app_role_id
-- JOIN auth.users au ON au.id = u.auth_user_id
-- WHERE ar.name IN ('owner', 'admin', 'super_admin')
--   AND u.onboarding_completed = false;
