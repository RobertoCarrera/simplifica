-- Migration: Create company_members table and migrate data
-- Description: Establishes M:N relationship between Users and Companies.

-- 1. Create the table
-- If it exists (from base schema), this is skipped.
CREATE TABLE IF NOT EXISTS public.company_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'client')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'pending')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (user_id, company_id)
);

-- 2. Enable RLS
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for company_members
-- Use function based checks that are compatible with new schema (role_id) too

-- Drop policies to ensure clean slate if rerunning
DROP POLICY IF EXISTS "Users can view own memberships" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can view members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can update members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can delete members" ON public.company_members;

-- Users can view their own memberships
CREATE POLICY "Users can view own memberships" ON public.company_members
    FOR SELECT USING (user_id = auth.uid());

-- Company Admins/Owners can view members of their company
-- Note: Check if is_company_admin exists first?
-- It should exist from initial_base_schema.sql.
-- But the function takes company_id.
CREATE POLICY "Company admins can view members" ON public.company_members
    FOR SELECT USING (public.is_company_admin(company_id));

CREATE POLICY "Company admins can update members" ON public.company_members
    FOR UPDATE USING (public.is_company_admin(company_id)) WITH CHECK (public.is_company_admin(company_id));

CREATE POLICY "Company admins can delete members" ON public.company_members
    FOR DELETE USING (public.is_company_admin(company_id));

-- 4. Migrate data?
-- Since this is a fresh start with base schema already defining company_members,
-- and users table is empty, we skip migration logic that depends on old schema.

-- 5. Loosen constraints (if columns exist)
DO $$
BEGIN
    -- Check if users table has company_id column, assuming it exists
    -- This handles case where users table structure might differ
    BEGIN
        ALTER TABLE public.users ALTER COLUMN company_id DROP NOT NULL;
    EXCEPTION WHEN undefined_column THEN
        NULL;
    END;

    BEGIN
        ALTER TABLE public.users ALTER COLUMN role DROP NOT NULL;
    EXCEPTION WHEN undefined_column THEN
        NULL;
    END;
END $$;

-- 6. Grant permissions
GRANT ALL ON public.company_members TO authenticated;
GRANT ALL ON public.company_members TO service_role;
