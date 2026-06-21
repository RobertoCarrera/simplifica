-- Migration: consolidate project_comments SELECT RLS policies
--
-- Bug: 4 overlapping SELECT policies on public.project_comments cause
-- "canceling statement due to statement timeout" (HTTP 500) on realtime
-- HEAD requests, because PostgREST OR-combines them and the planner
-- cannot pick a fast index plan.
--
-- Fix: collapse to 2 policies, both TO authenticated, one per role,
-- each with a single EXISTS that the planner can satisfy with
-- idx_project_comments_project_id.
--
-- Verified pre-conditions (no code path requires anon access):
--   - repo-wide grep for project_comments in crm, portal-frontend,
--     agenda-frontend, supabase/functions, api/ → all callers are
--     authenticated clients or service_role
--   - SELECT against the table from the postgres role uses Index Only
--     Scan on idx_project_comments_project_id_created_at in 0.1ms,
--     so the index is healthy; the pathology is purely in RLS qual
--
-- This migration is idempotent: DROP POLICY IF EXISTS + CREATE POLICY.

BEGIN;

-- ============================================================
-- Drop the 4 overlapping SELECT policies
-- ============================================================

DROP POLICY IF EXISTS "Clients can view comments on their projects"
  ON public.project_comments;

DROP POLICY IF EXISTS "Company members can view comments"
  ON public.project_comments;

DROP POLICY IF EXISTS "Members can view own company project comments"
  ON public.project_comments;

DROP POLICY IF EXISTS "Portal clients can read own project comments"
  ON public.project_comments;

-- ============================================================
-- Create 2 consolidated SELECT policies (both TO authenticated)
-- ============================================================

-- Policy 1: Staff (any role resolved via get_user_company_id)
-- Replaces: "Company members can view comments" + "Members can view own
-- company project comments" + the staff leg of "Clients can view comments
-- on their projects".
CREATE POLICY "Staff can view project comments in their company"
  ON public.project_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = project_comments.project_id
        AND p.company_id = get_user_company_id()
    )
  );

-- Policy 2: Active portal users
-- Replaces: "Portal clients can read own project comments" + the portal
-- leg of "Clients can view comments on their projects".
-- Uses JOIN (instead of nested IN) so the planner can push auth.uid()
-- early and use indexes on client_portal_users.
CREATE POLICY "Portal clients can view comments on their projects"
  ON public.project_comments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM projects p
      JOIN client_portal_users cpu
        ON cpu.client_id = p.client_id
      WHERE p.id = project_comments.project_id
        AND cpu.auth_user_id = auth.uid()
        AND cpu.is_active = true
        AND cpu.client_id IS NOT NULL
    )
  );

COMMIT;

-- ============================================================
-- ROLLBACK (run manually if needed; do NOT execute as part of this
-- migration file)
-- ============================================================
--
-- BEGIN;
--
-- DROP POLICY IF EXISTS "Staff can view project comments in their company"
--   ON public.project_comments;
-- DROP POLICY IF EXISTS "Portal clients can view comments on their projects"
--   ON public.project_comments;
--
-- CREATE POLICY "Clients can view comments on their projects"
--   ON public.project_comments FOR SELECT TO public
--   USING (
--     EXISTS (
--       SELECT 1 FROM projects p
--       WHERE p.id = project_comments.project_id
--         AND p.client_id IN (
--           SELECT clients.id FROM clients
--           WHERE clients.auth_user_id = auth.uid()
--         )
--     )
--   );
--
-- CREATE POLICY "Company members can view comments"
--   ON public.project_comments FOR SELECT TO public
--   USING (
--     EXISTS (
--       SELECT 1 FROM projects p
--       WHERE p.id = project_comments.project_id
--         AND p.company_id IN (
--           SELECT cm.company_id FROM company_members cm
--           WHERE cm.user_id IN (
--             SELECT users.id FROM users
--             WHERE users.auth_user_id = auth.uid()
--           )
--         )
--     )
--   );
--
-- CREATE POLICY "Members can view own company project comments"
--   ON public.project_comments FOR SELECT TO authenticated
--   USING (
--     EXISTS (
--       SELECT 1 FROM projects p
--       WHERE p.id = project_comments.project_id
--         AND p.company_id = get_user_company_id()
--     )
--   );
--
-- CREATE POLICY "Portal clients can read own project comments"
--   ON public.project_comments FOR SELECT TO authenticated
--   USING (
--     project_id IN (
--       SELECT id FROM projects
--       WHERE client_id IN (
--         SELECT client_id FROM client_portal_users
--         WHERE auth_user_id = auth.uid()
--           AND is_active = true
--           AND client_id IS NOT NULL
--       )
--     )
--   );
--
-- COMMIT;