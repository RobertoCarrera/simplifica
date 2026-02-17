-- Fix recursive RLS policies on client_assignments and clients tables
-- This migration updates the policies to break the circular dependency between these two tables.
-- The previous 'View assignments' policy queried public.clients causing infinite recursion with clients RLS.

-- 1. Redefine 'View assignments' policy for client_assignments
-- It now uses company_members.company_id instead of public.clients.company_id to determine ownership.

DROP POLICY IF EXISTS "View assignments" ON public.client_assignments;
CREATE POLICY "View assignments" ON public.client_assignments
    FOR SELECT USING (
        -- Option 1: View my own assignment as assignee
        (company_member_id IN (
            SELECT id FROM public.company_members WHERE user_id = auth.uid()
        ))
        OR
        -- Option 2: View assignments as Admin/Owner of the member's company
        EXISTS (
            SELECT 1 
            FROM public.company_members requester
            JOIN public.app_roles ar ON requester.role_id = ar.id
            JOIN public.company_members target_member ON target_member.id = client_assignments.company_member_id
            WHERE requester.user_id = auth.uid()
            AND requester.company_id = target_member.company_id
            AND ar.name IN ('owner', 'admin', 'super_admin')
        )
    );

-- 2. Redefine 'Manage assignments' policy for client_assignments
-- Same fix: use company_members for company scope.

DROP POLICY IF EXISTS "Manage assignments" ON public.client_assignments;
CREATE POLICY "Manage assignments" ON public.client_assignments
    FOR ALL USING (
        EXISTS (
            SELECT 1 
            FROM public.company_members requester
            JOIN public.app_roles ar ON requester.role_id = ar.id
            JOIN public.company_members target_member ON target_member.id = client_assignments.company_member_id
            WHERE requester.user_id = auth.uid()
            AND requester.company_id = target_member.company_id
            AND ar.name IN ('owner', 'admin', 'super_admin')
            AND requester.status = 'active'
        )
    );


-- (Optional) If we want to be paranoid, we can DROP/CREATE clients policy too, but the fix on 'assignments' should be sufficient.

-- 4. Assignment Policy Enforcement (One vs Many Professionals)
-- Create company_settings table if not exists
CREATE TABLE IF NOT EXISTS public.company_settings (
    company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    assignment_policy TEXT NOT NULL DEFAULT 'many', -- 'one' or 'many'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Trigger Function to Enforce Assignment Policy
CREATE OR REPLACE FUNCTION enforce_assignment_policy()
RETURNS TRIGGER AS $$
DECLARE
    v_policy TEXT;
    v_count INT;
BEGIN
    -- Get policy for the company
    SELECT assignment_policy INTO v_policy
    FROM public.company_settings
    WHERE company_id = (
        SELECT company_id FROM public.clients WHERE id = NEW.client_id
    );
    IF v_policy IS NULL THEN
        v_policy := 'many'; -- Default fallback
    END IF;

    IF v_policy = 'one' THEN
        -- Count current assignments for this client
        SELECT COUNT(*) INTO v_count
        FROM public.client_assignments
        WHERE client_id = NEW.client_id;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'Assignment policy is one professional per client. This client already has an assignment.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Attach Trigger to client_assignments
DROP TRIGGER IF EXISTS trg_enforce_assignment_policy ON public.client_assignments;
CREATE CONSTRAINT TRIGGER trg_enforce_assignment_policy
    AFTER INSERT ON public.client_assignments
    FOR EACH ROW
    EXECUTE FUNCTION enforce_assignment_policy();
