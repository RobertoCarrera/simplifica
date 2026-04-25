-- Migration: Fix 'Users can view own memberships' RLS policy
-- Date: 2026-01-07 04:00:00

-- The previous policy (user_id = auth.uid()) is incorrect because user_id is the internal UUID 
-- from public.users, while auth.uid() is the Supabase Auth UUID. 
-- We need to bridge them using the auth_user_id column in public.users.

DROP POLICY IF EXISTS "Users can view own memberships" ON public.company_members;

CREATE POLICY "Users can view own memberships" ON public.company_members
    FOR SELECT USING (
        user_id IN (
            SELECT id FROM public.users WHERE auth_user_id = auth.uid()
        )
    );
