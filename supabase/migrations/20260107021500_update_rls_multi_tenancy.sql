-- Migration: Update RLS for Multi-Tenancy (Phase 1: Companies & Clients)

-- 1. COMPANIES Table
-- Old: Users can view their own company (via users.company_id)
-- New: Users can view companies they are a member of

DROP POLICY IF EXISTS "Users can view own company" ON public.companies;
DROP POLICY IF EXISTS "Companies are viewable by users with same company_id" ON public.companies; -- Guessing names, better to be safe with permissive create

CREATE POLICY "Members can view their companies" ON public.companies
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = companies.id
            AND cm.status = 'active'
        )
    );

-- 2. CLIENTS Table
-- Drop old single-tenant policies
DROP POLICY IF EXISTS "Users can view clients of their company" ON public.clients;
DROP POLICY IF EXISTS "clients_delete_company_only" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_company_only" ON public.clients;
DROP POLICY IF EXISTS "clients_select_company_only" ON public.clients;
DROP POLICY IF EXISTS "clients_update_company_only" ON public.clients;
DROP POLICY IF EXISTS "clients_isolation_policy" ON public.clients; -- This was the complex one

-- New Policies

-- SELECT: 
-- 1. Staff: Member of the company (active)
-- 2. Client: The client record itself (auth_user_id)
CREATE POLICY "clients_select_policy" ON public.clients
    FOR SELECT USING (
        (auth_user_id = auth.uid()) -- Client accessing themselves
        OR
        EXISTS ( -- Staff accessing company clients
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = clients.company_id
            AND cm.status = 'active'
        )
    );

-- INSERT:
-- Only Staff (active members)
CREATE POLICY "clients_insert_policy" ON public.clients
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = clients.company_id
            AND cm.status = 'active'
        )
    );

-- UPDATE:
-- 1. Staff: Member of company
-- 2. Client: Own record (if allowed? usually clients update profile via special endpoint, but safe to allow constrained update if needed. Existing policy allowed updating own record)
CREATE POLICY "clients_update_policy" ON public.clients
    FOR UPDATE USING (
        (auth_user_id = auth.uid())
        OR
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = clients.company_id
            AND cm.status = 'active'
        )
    );

-- DELETE:
-- Only Staff (active members, maybe restrict to admin/owner? Existing was permissive to company)
CREATE POLICY "clients_delete_policy" ON public.clients
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = clients.company_id
            AND cm.status = 'active'
            AND cm.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin', 'member')) -- Explicitly excluding client role in company members just in case
        )
    );
