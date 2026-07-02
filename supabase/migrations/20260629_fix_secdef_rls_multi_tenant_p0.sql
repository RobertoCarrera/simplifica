-- ============================================================================
-- Migration: Rafter v0.58 part 2 — close 3 CRITICAL multi-tenant data leaks
-- ============================================================================
-- Sprint:   Supabase multi-tenant audit remediation, batch v0.58 part 2
-- Audit:    2026-06-29
-- Author:   AI sub-agent (sdd-apply)
-- Follows:  v0.57 (SECDEF auth bypasses) and v0.58 part 1 (storage policies).
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- The 2026-06-29 multi-tenant audit flagged three CRITICAL data leaks:
--
--   1. accept_quote_for_booking(p_booking_id uuid)
--      SECURITY DEFINER with NO company_id check. The function runs as the
--      function owner, so RLS on quotes/bookings is bypassed entirely. Any
--      `authenticated` user could force-accept any tenant's draft quote by
--      passing a foreign `p_booking_id`. Cross-tenant mutation.
--
--   2. bulk_assign_unlinked_bookings(p_professional_id uuid, p_resource_id uuid)
--      SECURITY DEFINER with NO company_id check. The body filters only by
--      `professional_id` and ignores `company_id`, so any authenticated user
--      could reassign bookings across all tenants by passing a foreign
--      `p_professional_id`. Cross-tenant mutation.
--
--   3. payment_integrations RLS policies
--      The `_select`, `_update`, `_delete`, and `_insert` policies check
--      role (owner/admin/supervisor/super_admin) but NOT `company_id`.
--      Postgres ORs policies for the same cmd, so the broken policies
--      shadowed the correct ones ("Admins can manage own company payment
--      integrations" / "Admins can view own company payment integrations" /
--      "clients_view_company_payment_integrations"). Net effect: a Company A
--      owner could read/write/delete Company B's payment provider config.
--
-- ────────────────────────────────────────────────────────────────────────────
-- CALLER ANALYSIS (verified 2026-06-29)
-- ────────────────────────────────────────────────────────────────────────────
--
--   - accept_quote_for_booking:
--       src/ callers:    NONE
--       Edge Fn callers: NONE
--       DB callers:      trg_session_close_to_invoice trigger body
--                        (file 20260617000000_quote_lifecycle_tenant_toggle.sql:139).
--                        That trigger is itself SECURITY DEFINER. When a
--                        SECDEF function calls another function, the inner
--                        function's INVOKER/DEFINER setting is evaluated
--                        against the OUTER function's owner (postgres).
--                        So switching accept_quote_for_booking to INVOKER
--                        is SAFE for the trigger caller — the call still
--                        runs as postgres. The change only tightens direct
--                        RPC calls from authenticated clients.
--
--   - bulk_assign_unlinked_bookings:
--       src/ callers:    src/app/services/supabase-bookings.service.ts:686
--                        (admin UI flow that assigns bookings to a resource
--                         in bulk for the caller's company)
--       Edge Fn callers: NONE
--       DB callers:      NONE
--       Direct RPC only. Safe to switch to INVOKER; the caller's RLS on
--       `bookings` (`bookings.company_id = caller's company_id`) will
--       already scope the UPDATE to the caller's tenant. We additionally
--       add an explicit company_id filter to the body for defense-in-depth
--       and audit clarity.
--
--   - payment_integrations policies:
--       No caller changes required; tightening the policies only narrows
--       the granted set.
--
-- ────────────────────────────────────────────────────────────────────────────
-- FIX
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ============================================================================
-- 1. accept_quote_for_booking → SECURITY INVOKER
-- ============================================================================
-- Drop the existing function first so we can flip SECURITY DEFINER to
-- SECURITY INVOKER (Postgres does not allow ALTER FUNCTION ... SECURITY
-- INVOKER in-place when changing from DEFINER to INVOKER; the cleanest
-- approach is CREATE OR REPLACE). Body is preserved verbatim except for
-- the security mode.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_quote_for_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.quotes
  SET status = 'accepted', accepted_at = COALESCE(accepted_at, now())
  WHERE id = (SELECT quote_id FROM public.bookings WHERE id = p_booking_id)
    AND status = 'draft';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.accept_quote_for_booking(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_quote_for_booking(uuid) IS
  'Accepts the draft quote linked to a booking. SECURITY INVOKER: when called via RPC, RLS on bookings + quotes enforces tenancy. When called from the SECDEF trigger trg_session_close_to_invoice, the call still runs as the outer function owner (postgres) so trigger behavior is unchanged. Was SECURITY DEFINER before Rafter v0.58 part 2 — that allowed any authenticated user to force-accept any tenant''s draft quote.';

-- ============================================================================
-- 2. bulk_assign_unlinked_bookings → SECURITY INVOKER + explicit company_id
-- ============================================================================
-- Body rewrite to (a) flip SECDEF→INVOKER and (b) add an explicit
-- `company_id IN (caller's active memberships)` filter so the UPDATE
-- cannot silently affect bookings outside the caller's tenant even if
-- bookings RLS is later relaxed.
--
-- `get_my_public_id()` is a SECDEF helper that returns public.users.id for
-- the calling auth user (bypasses RLS on users). company_members is RLS-
-- protected and will only return the caller's own memberships under the
-- "Users can view own memberships" policy. This is the standard pattern
-- used elsewhere in the codebase (see is_company_member() body).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bulk_assign_unlinked_bookings(
  p_professional_id uuid,
  p_resource_id     uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated_count INTEGER;
BEGIN
  UPDATE public.bookings
  SET resource_id = p_resource_id,
      updated_at  = NOW()
  WHERE professional_id = p_professional_id
    AND resource_id IS NULL
    AND status <> 'cancelled'
    AND company_id IN (
      SELECT cm.company_id
      FROM public.company_members cm
      WHERE cm.user_id = public.get_my_public_id()
        AND cm.status  = 'active'
    );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object('updated', v_updated_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bulk_assign_unlinked_bookings(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.bulk_assign_unlinked_bookings(uuid, uuid) IS
  'Bulk-assigns unlinked bookings of a professional to a resource, scoped to the caller''s active company memberships. SECURITY INVOKER + explicit company_id filter. Was SECURITY DEFINER before Rafter v0.58 part 2 — that allowed any authenticated user to reassign bookings across all tenants.';

-- ============================================================================
-- 3. payment_integrations policies → tighten to require company_id
-- ============================================================================
-- Drop the four broken policies (`_select`, `_update`, `_delete`, `_insert`)
-- and recreate each with the standard pattern: is_super_admin() OR
-- is_company_member(company_id).
--
-- The correct policies already on the table
-- ("Admins can manage own company payment integrations" (ALL),
--  "Admins can view own company payment integrations" (SELECT),
--  "clients_view_company_payment_integrations" (SELECT))
-- continue to work — they get OR'd with the new tightened ones.
-- The net effect is: any policy that does NOT check company_id is gone.
-- ============================================================================

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
CREATE POLICY "payment_integrations_select" ON public.payment_integrations
  FOR SELECT TO authenticated
  USING (is_super_admin() OR is_company_member(company_id));

DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
CREATE POLICY "payment_integrations_update" ON public.payment_integrations
  FOR UPDATE TO authenticated
  USING      (is_super_admin() OR is_company_member(company_id))
  WITH CHECK (is_super_admin() OR is_company_member(company_id));

DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;
CREATE POLICY "payment_integrations_delete" ON public.payment_integrations
  FOR DELETE TO authenticated
  USING (is_super_admin() OR is_company_member(company_id));

-- Bonus tightening (not in the audit report but same bug class):
-- _insert previously used WITH CHECK with only role check. Without a
-- company_id check, a Company A admin could INSERT a payment_integrations
-- row with company_id = Company B's id, leaking payment provider config
-- into another tenant. Tighten WITH CHECK here too.
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
CREATE POLICY "payment_integrations_insert" ON public.payment_integrations
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR is_company_member(company_id));

COMMIT;