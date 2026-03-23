-- ============================================================
-- Fix RLS performance on professionals, professional_services,
-- professional_schedules, and helper functions
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. Mark volatile helper functions as STABLE so PostgreSQL
--    can cache them within a single statement
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE (u.auth_user_id = user_id OR u.id = user_id)
    AND ar.name = 'super_admin'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin_real()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name = 'super_admin'
      AND u.active = true
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 1. PROFESSIONALS — replace 3 policies (2 expensive ALL + 1 SELECT)
--    with 1 fast SELECT + specific write policies
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Company members can view professionals" ON professionals;
DROP POLICY IF EXISTS "Admins can manage professionals" ON professionals;
DROP POLICY IF EXISTS "Admins/Owners can manage professionals" ON professionals;

-- SELECT: single STABLE function call, cached per statement
CREATE POLICY "professionals_select" ON professionals
  FOR SELECT USING (company_id = get_auth_user_company_id());

-- Writes: only evaluated on mutation (not SELECT)
CREATE POLICY "professionals_insert" ON professionals
  FOR INSERT WITH CHECK (current_user_is_admin(company_id));

CREATE POLICY "professionals_update" ON professionals
  FOR UPDATE USING (current_user_is_admin(company_id));

CREATE POLICY "professionals_delete" ON professionals
  FOR DELETE USING (current_user_is_admin(company_id));

-- ─────────────────────────────────────────────────────────────
-- 2. PROFESSIONAL_SERVICES — replace 4 policies (3 duplicate ALL + 1 SELECT)
--    with 1 fast SELECT + 1 write policy set
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage professional_services" ON professional_services;
DROP POLICY IF EXISTS "Admins can manage professional_services_all" ON professional_services;
DROP POLICY IF EXISTS "Admins/Owners can manage professional_services" ON professional_services;
DROP POLICY IF EXISTS "Company members can view professional_services" ON professional_services;

-- SELECT: one indexed subquery, company check cached
CREATE POLICY "professional_services_select" ON professional_services
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_services.professional_id
        AND p.company_id = get_auth_user_company_id()
    )
  );

CREATE POLICY "professional_services_insert" ON professional_services
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_services.professional_id
        AND current_user_is_admin(p.company_id)
    )
  );

CREATE POLICY "professional_services_update" ON professional_services
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_services.professional_id
        AND current_user_is_admin(p.company_id)
    )
  );

CREATE POLICY "professional_services_delete" ON professional_services
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_services.professional_id
        AND current_user_is_admin(p.company_id)
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. PROFESSIONAL_SCHEDULES — replace 2 overlapping policies
--    with 1 fast SELECT + specific write policies
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "View own schedules" ON professional_schedules;
DROP POLICY IF EXISTS "Edit own schedules" ON professional_schedules;

-- SELECT: any company member can view schedules of their company's professionals
CREATE POLICY "professional_schedules_select" ON professional_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_schedules.professional_id
        AND p.company_id = get_auth_user_company_id()
    )
  );

-- Writes: own schedules OR admin
CREATE POLICY "professional_schedules_insert" ON professional_schedules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_schedules.professional_id
        AND (p.user_id = auth.uid() OR current_user_is_admin(p.company_id))
    )
  );

CREATE POLICY "professional_schedules_update" ON professional_schedules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_schedules.professional_id
        AND (p.user_id = auth.uid() OR current_user_is_admin(p.company_id))
    )
  );

CREATE POLICY "professional_schedules_delete" ON professional_schedules
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_schedules.professional_id
        AND (p.user_id = auth.uid() OR current_user_is_admin(p.company_id))
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 4. Clean up duplicate indexes
-- ─────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_professional_services_professional;   -- duplicate of idx_professional_services_professional_id
DROP INDEX IF EXISTS idx_professional_services_service;        -- duplicate of idx_professional_services_service_id
DROP INDEX IF EXISTS idx_professionals_company;                -- subset of idx_professionals_company_display
DROP INDEX IF EXISTS idx_professionals_company_display;        -- duplicate of idx_professionals_company_display_name
DROP INDEX IF EXISTS idx_professionals_user;                   -- overlap with idx_professionals_user_id
