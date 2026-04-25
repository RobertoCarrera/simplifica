-- Migration: Cleanup redundant and broken RLS policies
-- Date: 2026-01-08 17:00:00

-- 1. USERS Table Cleanup
-- We only need:
-- a) Authenticated users can read all profiles (needed for team visibility, etc.)
-- b) Users can update their own profile

DROP POLICY IF EXISTS "Users can view own profile" ON public.users; -- Probably broken (id vs auth.uid)
DROP POLICY IF EXISTS "Users can read own profile" ON public.users; -- Redundant
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users; -- Redundant
DROP POLICY IF EXISTS "users_own_profile" ON public.users; -- Redundant
DROP POLICY IF EXISTS "Users can view team members" ON public.users; -- Redundant if global read is on
DROP POLICY IF EXISTS "users_select_client_self" ON public.users; -- Redundant

-- Ensure the primary read policy exists and is named consistently
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.users;
CREATE POLICY "Authenticated users can view all profiles" ON public.users
    FOR SELECT USING (auth.role() = 'authenticated');

-- Ensure update policy is clean
DROP POLICY IF EXISTS "users_own_update" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth_user_id = auth.uid());


-- 2. COMPANIES Table Cleanup
-- We only need:
-- a) Members can view their companies (via is_company_member)
-- b) Clients can view their companies

DROP POLICY IF EXISTS "companies_own_only" ON public.companies; -- Legacy (relies on users.company_id which might be stale)

-- Ensure "Members can view their companies" uses the FIXED function
-- (Already updated in previous migration, but ensuring no duplicates)

-- 3. COMPANY_MEMBERS Cleanup
-- We only need:
-- a) Users can view own memberships
-- b) Admins can view/manage company members

-- (Already cleaned in 20260107040000, checking for others)
-- No other custom policies found in list except the correct ones.

