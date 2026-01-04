-- Add missing RLS policies for mail_domains
-- Fixes 403 Forbidden by allowing authenticated users to manage their assigned domains

-- Cleanup potentially conflicting or insecure policies from previous migrations
DROP POLICY IF EXISTS "Admins can manage domains" ON public.mail_domains;
DROP POLICY IF EXISTS "Users can insert assigned mail domains" ON public.mail_domains;
DROP POLICY IF EXISTS "Users can update assigned mail domains" ON public.mail_domains;
DROP POLICY IF EXISTS "Users can delete assigned mail domains" ON public.mail_domains;

-- Allow users to insert if they assign to themselves
CREATE POLICY "Users can insert assigned mail domains"
ON public.mail_domains FOR INSERT
WITH CHECK (
    auth.uid() = assigned_to_user
);

-- Allow users to update their own domains
CREATE POLICY "Users can update assigned mail domains"
ON public.mail_domains FOR UPDATE
USING (
    auth.uid() = assigned_to_user
);

-- Allow users to delete their own domains
CREATE POLICY "Users can delete assigned mail domains"
ON public.mail_domains FOR DELETE
USING (
    auth.uid() = assigned_to_user
);

-- IMPORTANT: Allow Admins to do ANYTHING (assign to others, delete others)
-- We check public.users for the role.
CREATE POLICY "Admins can manage all domains"
ON public.mail_domains FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role IN ('owner', 'admin')
    )
);
