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

-- 3. Ensure 'clients_select_policy' is correct and recursive-safe (it *can* query assignments now)
-- No changes needed if it successfully queried before, but good to double check.
-- The previous definition was:
-- EXISTS (SELECT 1 FROM client_assignments ca WHERE ca.client_id = clients.id ...)
-- This is fine now because 'Select * from assignments' (triggered by EXISTS)
-- uses the new policy which ONLY touches company_members, breaking the cycle.

-- (Optional) If we want to be paranoid, we can DROP/CREATE clients policy too, but the fix on 'assignments' should be sufficient.
