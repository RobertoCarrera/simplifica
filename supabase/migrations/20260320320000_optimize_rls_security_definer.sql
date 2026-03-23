-- Migration: Optimize RLS policies on booking-related tables
-- Problem: Nested IN subqueries in RLS evaluated per-row cause statement timeouts (57014)
-- on bookings, professionals, professional_services, and resources tables.
-- Solution: Replace nested subqueries with existing SECURITY DEFINER functions
-- (get_my_company_ids / is_company_admin) that resolve auth.uid() efficiently.

BEGIN;

-- ============================================================
-- 1. Replace RLS policies on bookings
-- ============================================================
DROP POLICY IF EXISTS "Company members can view bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins/Owners can manage bookings" ON public.bookings;

CREATE POLICY "Company members can view bookings"
    ON public.bookings FOR SELECT
    USING (company_id = ANY(public.get_my_company_ids()));

CREATE POLICY "Admins/Owners can manage bookings"
    ON public.bookings FOR ALL
    USING (public.is_company_admin(company_id));

-- ============================================================
-- 2. Replace RLS policies on resources
-- ============================================================
DROP POLICY IF EXISTS "Company members can view resources" ON public.resources;
DROP POLICY IF EXISTS "Admins/Owners can manage resources" ON public.resources;

CREATE POLICY "Company members can view resources"
    ON public.resources FOR SELECT
    USING (company_id = ANY(public.get_my_company_ids()));

CREATE POLICY "Admins/Owners can manage resources"
    ON public.resources FOR ALL
    USING (public.is_company_admin(company_id));

-- ============================================================
-- 3. Replace RLS policies on professionals
-- ============================================================
DROP POLICY IF EXISTS "Company members can view professionals" ON public.professionals;
DROP POLICY IF EXISTS "Admins/Owners can manage professionals" ON public.professionals;

CREATE POLICY "Company members can view professionals"
    ON public.professionals FOR SELECT
    USING (company_id = ANY(public.get_my_company_ids()));

CREATE POLICY "Admins/Owners can manage professionals"
    ON public.professionals FOR ALL
    USING (public.is_company_admin(company_id));

-- ============================================================
-- 4. Replace RLS policies on professional_services
--    (uses professional_id → professionals.company_id)
-- ============================================================
DROP POLICY IF EXISTS "Company members can view professional_services" ON public.professional_services;
DROP POLICY IF EXISTS "Admins/Owners can manage professional_services" ON public.professional_services;

CREATE POLICY "Company members can view professional_services"
    ON public.professional_services FOR SELECT
    USING (
        (SELECT p.company_id FROM public.professionals p WHERE p.id = professional_id)
        = ANY(public.get_my_company_ids())
    );

CREATE POLICY "Admins/Owners can manage professional_services"
    ON public.professional_services FOR ALL
    USING (
        public.is_company_admin(
            (SELECT p.company_id FROM public.professionals p WHERE p.id = professional_id)
        )
    );

-- ============================================================
-- 5. Add composite index for calendar range queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_company_start_time
    ON public.bookings (company_id, start_time DESC);

COMMIT;
