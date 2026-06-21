-- =====================================================================
-- Sprint: Security hardening — Rafter v0.18b (corrected)
-- Date:   2026-06-21
-- Audit:  docs/rafter-v18-rls-audit.md (stale — v0.18b correction)
-- Owner:  Rafter (security agent) via SDD apply
-- Method: Manual verification via information_schema + pg_policies
--         before authoring. Anon INSERT smoke test executed post-apply.
--
-- Why this migration exists:
--   The original Rafter v0.18 audit referenced `public.audit_log`
--   (singular). The actual table in this DB is `public.audit_logs`
--   (plural). The previous sub-task blocked when it tried to read
--   audit_log and got 0 rows. The orchestrator re-verified table
--   names and approved this corrected body.
--
-- What's fixed:
--   1. public.public_bookings_anon_insert was misconfigured to require
--      authenticated + company membership. The public booking form
--      (which is anon, after Turnstile) was therefore rejected.
--      Now: anon + authenticated, WITH CHECK turnstile_verified = true.
--   2. FORCE ROW LEVEL SECURITY on public.public_bookings, public.audit_logs,
--      and public.client_portal_users (PII: actor_email, ip_address, etc).
--
-- Idempotency: every CREATE POLICY is preceded by DROP POLICY IF EXISTS,
-- and the SQL is wrapped in a single transaction so a failure rolls
-- back cleanly. Safe to re-run.
-- =====================================================================

BEGIN;

-- ── 1. public_bookings: fix misconfigured anon_insert + FORCE RLS ──
DROP POLICY IF EXISTS "public_bookings_anon_insert" ON public.public_bookings;
CREATE POLICY "public_bookings_anon_insert"
  ON public.public_bookings
  FOR INSERT TO anon, authenticated
  WITH CHECK (turnstile_verified = true);

-- member_select and member_delete are already correct; recreating for
-- explicit safety (idempotent DROP IF EXISTS makes this safe).
DROP POLICY IF EXISTS "public_bookings_member_select" ON public.public_bookings;
CREATE POLICY "public_bookings_member_select"
  ON public.public_bookings
  FOR SELECT TO authenticated
  USING (
    company_slug IN (
      SELECT c.slug
      FROM public.companies c
      JOIN public.company_members cm ON cm.company_id = c.id
      JOIN public.users u            ON u.id         = cm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "public_bookings_member_delete" ON public.public_bookings;
CREATE POLICY "public_bookings_member_delete"
  ON public.public_bookings
  FOR DELETE TO authenticated
  USING (
    company_slug IN (
      SELECT c.slug
      FROM public.companies c
      JOIN public.company_members cm ON cm.company_id = c.id
      JOIN public.users u            ON u.id         = cm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

ALTER TABLE public.public_bookings FORCE ROW LEVEL SECURITY;

-- ── 2. FORCE RLS on PII tables ──
-- audit_log is plural in this DB (audit mis-spelled it).
ALTER TABLE public.audit_logs         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_users FORCE ROW LEVEL SECURITY;

COMMIT;
