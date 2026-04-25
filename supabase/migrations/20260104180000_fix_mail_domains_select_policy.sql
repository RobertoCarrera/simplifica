-- FIX: Add missing SELECT policy for mail_domains
-- This enables users to VIEW their assigned domains.

DROP POLICY IF EXISTS "Users can view assigned mail domains" ON public.mail_domains;
CREATE POLICY "Users can view assigned mail domains"
ON public.mail_domains FOR SELECT
USING (
    auth.uid() = assigned_to_user
);
