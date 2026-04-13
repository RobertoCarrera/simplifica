-- ============================================================
-- AUDIT RLS FIXES - security hardening
-- Date: 2026-04-13
-- Fix 1: domain_orders policies referencing non-existent public.profiles
-- Fix 2: verifactu_events column companyid -> company_id
-- Fix 3: public_bookings_anon_insert with turnstile_verified check
-- ============================================================

BEGIN;

-- ============================================================
-- FIX 1: domain_orders policies referencing non-existent public.profiles
-- ============================================================

DROP POLICY IF EXISTS "SuperAdmins can view all orders" ON public.domain_orders;
DROP POLICY IF EXISTS "SuperAdmins can update orders" ON public.domain_orders;
DROP POLICY IF EXISTS "superadmin_full_access_domain_orders" ON public.domain_orders;
DROP POLICY IF EXISTS "Users can view their own company orders" ON public.domain_orders;
DROP POLICY IF EXISTS "Users can create orders for their company" ON public.domain_orders;

-- SuperAdmins can SELECT all orders
CREATE POLICY "SuperAdmins can view all orders"
ON public.domain_orders
FOR SELECT
USING (public.is_super_admin_real());

-- SuperAdmins can UPDATE all orders
CREATE POLICY "SuperAdmins can update orders"
ON public.domain_orders
FOR UPDATE
USING (public.is_super_admin_real());

-- Company members can view their own company orders
CREATE POLICY "Users can view their own company orders"
ON public.domain_orders
FOR SELECT
USING (company_id = public.my_company_id());

-- Company members can INSERT orders for their company
CREATE POLICY "Users can create orders for their company"
ON public.domain_orders
FOR INSERT
WITH CHECK (company_id = public.my_company_id());

-- ============================================================
-- FIX 2: verifactu_events column companyid -> company_id
-- ============================================================

ALTER TABLE public.verifactu_events RENAME COLUMN companyid TO company_id;

-- Update the RLS policy to use new column name
DROP POLICY IF EXISTS "Members can view own company verifactu events" ON public.verifactu_events;

CREATE POLICY "Members can view own company verifactu events"
ON public.verifactu_events
FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id());

-- ============================================================
-- FIX 3: public_bookings_anon_insert with turnstile_verified check
-- ============================================================

DROP POLICY IF EXISTS "public_bookings_anon_insert" ON public.public_bookings;

CREATE POLICY "public_bookings_anon_insert"
ON public.public_bookings
FOR INSERT TO anon, authenticated
WITH CHECK (turnstile_verified = true);

COMMIT;