-- Migration: Fix RLS on companies table (prevent recursion/silent failures)
-- Date: 2026-01-07 03:30:00

-- 1. Create helper function to check membership safely (SECURITY DEFINER)
-- This ensures that when querying 'companies', we can check 'company_members' 
-- without triggering RLS on 'company_members' that might lead to complex evaluation/failure.

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
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
    AND status = 'active'
  );
END;
$$;

-- 2. Update policy on 'companies' table

DROP POLICY IF EXISTS "Members can view their companies" ON public.companies;

CREATE POLICY "Members can view their companies" ON public.companies
    FOR SELECT USING (
        public.is_company_member(id)
    );
