-- Migration: Fix Super Admin RLS policy for companies table
-- Date: 2026-02-22
-- Author: Simplifica Assistant

-- Drop the old policy that uses a hardcoded UUID
DROP POLICY IF EXISTS "Superadmins can view all companies" ON public.companies;

-- Create a robust policy that relies on the is_super_admin function
CREATE POLICY "Superadmins can view all companies"
    ON public.companies
    FOR SELECT
    TO public
    USING (is_super_admin(auth.uid()));
