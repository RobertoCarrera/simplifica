-- ╔══════════════════════════════════════════════════════════════╗
-- ║  🏆 LA MIGRACIÓN MÁS IMPORTANTE DE LA HISTORIA 🏆           ║
-- ║                                                              ║
-- ║  Fix services RLS (missing policies) + optimize clients RLS  ║
-- ║                                                              ║
-- ║  Esta migración salvó el componente Reservas de morir en     ║
-- ║  timeouts eternos y RLS sin policies. Fue un día épico.      ║
-- ╚══════════════════════════════════════════════════════════════╝
--
-- Problem 1: services table has RLS ENABLED (20260318200000) but
--   the only policy ("Admins can manage services") was dropped in
--   20260323000001 WITHOUT a replacement → all queries return 0 rows
--   for the authenticated role.
--
-- Problem 2: clients_select_policy uses expensive nested EXISTS
--   with per-row subqueries on company_members + app_roles +
--   client_assignments, causing statement timeouts on large tables.
--
-- Problem 3: Concurrent queries from the booking-settings component
--   hit the DB simultaneously; cheaper policies reduce total load.
-- ══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. SERVICES — Create per-command RLS policies using cached
--    helper functions (STABLE SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────

-- Safety: drop any leftover ALL policy that may still exist on
-- databases where 20260323000001 was not applied.
DROP POLICY IF EXISTS "Admins can manage services" ON public.services;

-- Drop new policies if re-running (idempotent)
DROP POLICY IF EXISTS "services_select" ON public.services;
DROP POLICY IF EXISTS "services_insert" ON public.services;
DROP POLICY IF EXISTS "services_update" ON public.services;
DROP POLICY IF EXISTS "services_delete" ON public.services;

-- SELECT: Any authenticated user in the company can view its services.
-- Uses get_my_company_ids() which is STABLE SECURITY DEFINER (cached per statement).
CREATE POLICY "services_select" ON public.services
  FOR SELECT
  TO authenticated
  USING (
    company_id = ANY(get_my_company_ids())
  );

-- INSERT: Only admin/owner of the company
CREATE POLICY "services_insert" ON public.services
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_is_admin(company_id)
  );

-- UPDATE: Only admin/owner of the company
CREATE POLICY "services_update" ON public.services
  FOR UPDATE
  TO authenticated
  USING (
    current_user_is_admin(company_id)
  );

-- DELETE: Only admin/owner of the company
CREATE POLICY "services_delete" ON public.services
  FOR DELETE
  TO authenticated
  USING (
    current_user_is_admin(company_id)
  );

-- ─────────────────────────────────────────────────────────────
-- 2. CLIENTS — Replace expensive nested EXISTS policy with
--    a cheaper version using SECURITY DEFINER helper functions
-- ─────────────────────────────────────────────────────────────

-- 2a. Ensure created_by column exists (added by 20260320000000 — idempotent here
--     in case that migration was not applied to this database yet).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 2d. Helper function: can the current user view a given client?
CREATE OR REPLACE FUNCTION public.can_view_client(
  p_client_company_id uuid,
  p_client_auth_user_id uuid,
  p_client_created_by uuid,
  p_client_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_public_user_id uuid;
BEGIN
  -- Fast path 1: client accessing own record
  IF p_client_auth_user_id = auth.uid() THEN
    RETURN true;
  END IF;

  -- Fast path 2: creator always sees their clients
  IF p_client_created_by = auth.uid() THEN
    RETURN true;
  END IF;

  -- Fast path 3: admin/owner of the company sees all clients
  IF p_client_company_id = ANY(get_my_company_ids()) THEN
    -- Check if user is admin/owner (most staff are)
    IF current_user_is_admin(p_client_company_id) THEN
      RETURN true;
    END IF;

    -- Non-admin staff: check assignment
    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE auth_user_id = auth.uid()
    LIMIT 1;

    IF v_public_user_id IS NOT NULL THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.company_members cm
        JOIN public.client_assignments ca ON ca.company_member_id = cm.id
        WHERE cm.user_id = v_public_user_id
          AND cm.company_id = p_client_company_id
          AND cm.status = 'active'
          AND ca.client_id = p_client_id
      );
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- 2c. Replace the expensive clients_select_policy
DROP POLICY IF EXISTS "clients_select_policy" ON public.clients;

CREATE POLICY "clients_select_policy" ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    public.can_view_client(company_id, auth_user_id, created_by, id)
  );

-- ─────────────────────────────────────────────────────────────
-- 3. Ensure critical indexes exist (IF NOT EXISTS = idempotent)
-- ─────────────────────────────────────────────────────────────

-- Services: composite for the booking query
CREATE INDEX IF NOT EXISTS idx_services_company_bookable_active
  ON public.services (company_id, is_bookable, is_active)
  WHERE deleted_at IS NULL;

-- Clients: company_id for RLS
CREATE INDEX IF NOT EXISTS idx_clients_company_id
  ON public.clients (company_id);

-- Clients: auth_user_id for self-access fast path
CREATE INDEX IF NOT EXISTS idx_clients_auth_user_id
  ON public.clients (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Clients: created_by for creator fast path
CREATE INDEX IF NOT EXISTS idx_clients_created_by
  ON public.clients (created_by)
  WHERE created_by IS NOT NULL;

-- Company members: the triple that every RLS check needs
CREATE INDEX IF NOT EXISTS idx_company_members_user_company_status
  ON public.company_members (user_id, company_id, status);

-- Client assignments: for the non-admin staff path
CREATE INDEX IF NOT EXISTS idx_client_assignments_member_client
  ON public.client_assignments (company_member_id, client_id);
