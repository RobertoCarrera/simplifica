-- Migration: Fix RLS recursion in company_members policies
-- Date: 2026-01-07 03:00:00

-- 1. Create a helper function to check permissions without triggering RLS recursion
-- This function is SECURITY DEFINER, meaning it runs with the privileges of the creator (postgres),
-- bypassing RLS on the table it queries (company_members).

CREATE OR REPLACE FUNCTION public.has_company_permission(p_company_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE company_id = p_company_id
    AND user_id = auth.uid()
    AND role = ANY(p_roles)
    AND status = 'active'
  );
END;
$$;

-- 2. Drop existing recursive policies

DROP POLICY IF EXISTS "Company admins can view members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can update members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can delete members" ON public.company_members;

-- 3. Re-create policies using the helper function

-- Company Admins/Owners can view members of their company
CREATE POLICY "Company admins can view members" ON public.company_members
    FOR SELECT USING (
        public.has_company_permission(company_id, ARRAY['owner', 'admin'])
    );

-- Company Admins/Owners can manage members (Update)
CREATE POLICY "Company admins can update members" ON public.company_members
    FOR UPDATE USING (
        public.has_company_permission(company_id, ARRAY['owner', 'admin'])
    );

-- Company Admins/Owners can delete members
CREATE POLICY "Company admins can delete members" ON public.company_members
    FOR DELETE USING (
        public.has_company_permission(company_id, ARRAY['owner', 'admin'])
    );

-- Note: "Users can view own memberships" policy remains unchanged as it is not recursive.
