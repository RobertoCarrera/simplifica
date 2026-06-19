-- Migration: Fix search_path + qualify refs in clients RLS policies
-- ----------------------------------------------------------------
-- Bug: A professional user (e.g. May Arias) trying to reactivate a client
-- got "relation professionals does not exist" because:
--   1. The role `authenticated` had no SET search_path, so it inherited the
--      cluster default ("$user", public) which can lose `public` in
--      transient PostgREST connections.
--   2. RLS policies on `clients` (`clients_update`, `clients_select` path 2)
--      referenced tables (company_members, users, app_roles, professionals,
--      bookings) WITHOUT the `public.` schema qualifier. When search_path
--      momentarily lacked `public`, the policy failed with the cryptic
--      "relation X does not exist" instead of just denying access silently.
--   3. The SECURITY DEFINER function `get_auth_user_professional_id()` had
--      the same issue (triggered 'during startup' from policy context).
--
-- Fix (defense in depth):
--   A. Set search_path explicitly on `authenticated` and `anon` roles.
--      Future connections for these roles will ALWAYS have `public` and
--      `extensions` available, regardless of how the connection was opened.
--   B. Schema-qualify all table references inside the affected policies.
--   C. Recreate `get_auth_user_professional_id()` with explicit `public.`
--      refs and SET search_path = public, extensions.
--
-- Date applied: 2026-06-19
-- Author: orchestrator (Gentle AI SDD)
-- Related log entries: "relation professionals does not exist" at
--   2026-06-19 11:01:53, 11:02:21, 11:03:36, 11:03:50 UTC
-- ----------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- A. Force search_path on auth roles
-- ----------------------------------------------------------------------------
ALTER ROLE authenticated SET search_path = public, extensions;
ALTER ROLE anon          SET search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- B. Re-create clients_update with schema-qualified refs
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS clients_update ON public.clients;

CREATE POLICY clients_update ON public.clients
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.users      u  ON u.id  = cm.user_id
      JOIN public.app_roles  ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = clients.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY[
          'owner', 'admin', 'supervisor', 'super_admin', 'professional'
        ])
    )
    OR clients.auth_user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.users      u  ON u.id  = cm.user_id
      JOIN public.app_roles  ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = clients.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY[
          'owner', 'admin', 'supervisor', 'super_admin', 'professional'
        ])
    )
    OR clients.auth_user_id = auth.uid()
  );

COMMENT ON POLICY clients_update ON public.clients IS
  'Professionals and privileged roles can update clients in their company. '
  'Schema-qualified refs (defense vs transient search_path loss).';

-- ----------------------------------------------------------------------------
-- C. Re-create clients_select with schema-qualified refs (path 2)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS clients_select ON public.clients;

CREATE POLICY clients_select ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    -- Path 1: privileged team roles
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.users      u  ON u.id  = cm.user_id
      JOIN public.app_roles  ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = clients.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY[
          'supervisor', 'owner', 'admin', 'super_admin',
          'member', 'agent', 'developer'
        ])
    )
    -- Path 2: professional can see clients they have bookings with
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.users      u  ON u.id  = cm.user_id
      JOIN public.app_roles  ar ON ar.id = cm.role_id
      JOIN public.professionals p ON p.user_id = u.id
      JOIN public.bookings      b ON b.professional_id = p.id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = clients.company_id
        AND cm.status = 'active'
        AND ar.name = 'professional'
        AND b.client_id = clients.id
    )
    -- Path 3: client assigned to the portal user
    OR public.is_client_assigned_to_user(clients.id)
  );

COMMENT ON POLICY clients_select ON public.clients IS
  'Privileged team, professionals (only clients with bookings), and assigned portal users. '
  'Schema-qualified refs (defense vs transient search_path loss).';

-- ----------------------------------------------------------------------------
-- D. Fix get_auth_user_professional_id() — the same search_path risk
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_user_professional_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT p.id
  FROM public.professionals p
  JOIN public.users u ON u.id = p.user_id
  WHERE u.auth_user_id = auth.uid()
    AND p.is_active = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_auth_user_professional_id() IS
  'Returns the public.professionals.id of the currently authenticated user, '
  'or NULL if the user is not a professional or is inactive. '
  'Schema-qualified refs + SET search_path for safety.';
