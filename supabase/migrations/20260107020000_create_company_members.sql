-- Migration: Create company_members table and migrate data
-- Description: Establishes M:N relationship between Users and Companies.

-- 1. Create the table
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

-- Users can view their own memberships
CREATE POLICY "Users can view own memberships" ON public.company_members
    FOR SELECT USING (user_id = auth.uid());

-- Company Admins/Owners can view members of their company
-- Note: This is recursive if we strictly used company_members, but safe if limited to single level logic
CREATE POLICY "Company admins can view members" ON public.company_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id = auth.uid()
            AND requester.company_id = company_members.company_id
            AND requester.role IN ('owner', 'admin')
        )
    );

-- Company Admins/Owners can manage members (Update)
CREATE POLICY "Company admins can update members" ON public.company_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id = auth.uid()
            AND requester.company_id = company_members.company_id
            AND requester.role IN ('owner', 'admin')
        )
    );

-- Company Admins/Owners can delete members
CREATE POLICY "Company admins can delete members" ON public.company_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id = auth.uid()
            AND requester.company_id = company_members.company_id
            AND requester.role IN ('owner', 'admin')
        )
    );

-- 4. Migrate existing data from users table
-- Map 'active' boolean to 'active'/'suspended' status? 
-- For now, if active=true -> 'active'. If active=false -> 'suspended'. 
-- Just assume 'active' for migration simplicity unless user was explicitly inactive.
INSERT INTO public.company_members (user_id, company_id, role, status, created_at)
SELECT 
    id, 
    company_id, 
    COALESCE(role, 'member'), -- Default to member if null, though likely not
    CASE WHEN active = true THEN 'active' ELSE 'suspended' END,
    created_at
FROM public.users
WHERE company_id IS NOT NULL 
ON CONFLICT (user_id, company_id) DO NOTHING;

-- 5. Loosen constraints on users table (Deprecation Phase 1)
ALTER TABLE public.users ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN role DROP NOT NULL;

-- 6. Grant permissions (Adjust as needed for your specific roles setup, usually postgres/anon/authenticated)
GRANT ALL ON public.company_members TO authenticated;
GRANT ALL ON public.company_members TO service_role;
