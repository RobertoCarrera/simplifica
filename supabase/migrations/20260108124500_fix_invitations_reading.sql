-- Migration: Allow users to view invitations sent to their email
-- Date: 2026-01-08 12:45:00

-- Problem: Existing users interacting with an invitation cannot read it because they are not yet members of the company.
-- Fix: Allow authenticated users to view invitations where the email matches their account email.

CREATE POLICY "Users can view invitations sent to their email" ON public.company_invitations
    FOR SELECT
    TO authenticated
    USING (
        lower(email) = lower(auth.jwt() ->> 'email')
    );
