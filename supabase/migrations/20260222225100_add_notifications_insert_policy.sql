-- Migration: Add Insert Policy for Notifications
-- Date: 2026-02-22
-- Author: Simplifica Assistant

-- Create a policy that allows authenticated users to insert notifications
-- if they are a superadmin OR if they are an active member of the company they are inserting for.

CREATE POLICY "Users can insert notifications"
    ON public.notifications
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_super_admin(auth.uid()) 
        OR 
        (company_id IN (
            SELECT company_id 
            FROM public.company_members 
            WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) 
            AND status = 'active'
        ))
    );
