-- Fix RLS Recursion on Clients table by using get_my_public_id()
-- This replaces the direct join to public.users which causes infinite recursion loops

-- 1. SELECT Policy
DROP POLICY IF EXISTS "clients_select_policy" ON public.clients;
CREATE POLICY "clients_select_policy" ON public.clients
    FOR SELECT USING (
        (auth_user_id = auth.uid()) -- Keep own record access
        OR
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = public.get_my_public_id() -- SAFE: No users table lookup
            AND cm.company_id = clients.company_id
            AND cm.status = 'active'
        )
    );

-- 2. UPDATE Policy
DROP POLICY IF EXISTS "clients_update_policy" ON public.clients;
CREATE POLICY "clients_update_policy" ON public.clients
    FOR UPDATE USING (
        (auth_user_id = auth.uid())
        OR
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = public.get_my_public_id()
            AND cm.company_id = clients.company_id
            AND cm.status = 'active'
        )
    );

-- 3. DELETE Policy
DROP POLICY IF EXISTS "clients_delete_policy" ON public.clients;
CREATE POLICY "clients_delete_policy" ON public.clients
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = public.get_my_public_id()
            AND cm.company_id = clients.company_id
            AND cm.status = 'active'
            AND cm.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin', 'member')) -- Assuming members can delete? Previous policy had this.
            -- Actually previous policy for DELETE was restricted to owner/admin/member? 
            -- Let's check the previous policy from step 1397:
            -- "role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])"
            -- Yes, it included 'member'. Keeping faithful to original logic.
        )
    );

-- 4. INSERT Policy
DROP POLICY IF EXISTS "clients_insert_policy" ON public.clients;
CREATE POLICY "clients_insert_policy" ON public.clients
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = public.get_my_public_id()
            AND cm.company_id = clients.company_id
            AND cm.status = 'active'
        )
    );
