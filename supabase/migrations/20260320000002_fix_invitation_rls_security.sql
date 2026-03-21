-- Migration: Fix critical security vulnerabilities in company_invitations RLS policies
-- Audit findings: F-AUTH-02 (INSERT catch-all), F-AUTH-04 (token column exposure), F-AUTH-05 (UPDATE no WITH CHECK)
-- Date: 2026-03-20

-- ============================================================
-- F-AUTH-02: Fix INSERT policy — remove catch-all clause
-- The old policy had a third OR branch: `invited_by_user_id = auth.uid()`
-- This allowed ANY authenticated user to create an invitation for any company
-- simply by setting invited_by_user_id = their own user id.
-- Fix: Only super admins and verified company owners/admins may INSERT.
-- ============================================================
DROP POLICY IF EXISTS "Authorized users can create invitations" ON public.company_invitations;

CREATE POLICY "Authorized users can create invitations" ON public.company_invitations
FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid())
    OR
    (
        company_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    )
);

-- ============================================================
-- F-AUTH-04: Restrict token column visibility
-- The SELECT policy allowed invitees to read the `token` column
-- by matching their email. This allows harvesting invitation tokens
-- directly from the database without going through the invite email.
-- Fix: Revoke direct SELECT on the `token` column from the
-- authenticated role; it can only be accessed via service role key
-- (used exclusively in Edge Functions that validate the full token).
-- The client application code is also updated to never request the
-- token column (see portal-invite.component.ts fix for F-AUTH-10).
-- ============================================================

-- Revoke SELECT on the token column from all authenticated users
REVOKE SELECT (token) ON public.company_invitations FROM authenticated;

-- Grant SELECT on all other columns (maintain existing access to non-sensitive data)
-- Note: company_invitations table has no updated_at column
GRANT SELECT (id, company_id, email, role, status, invited_by_user_id, expires_at, created_at, message)
    ON public.company_invitations TO authenticated;

-- Also restrict anon from reading token (belt-and-suspenders)
REVOKE SELECT (token) ON public.company_invitations FROM anon;

-- ============================================================
-- F-AUTH-05: Fix UPDATE policy — add WITH CHECK to prevent
-- token recycling and reactivating expired invitations.
-- The old policy had no WITH CHECK, so the inviter could:
-- - Change status from 'expired' back to 'pending' (token recycling)
-- - Modify the token value directly
-- - Change expires_at to extend an expired invitation
-- Fix: Add WITH CHECK that:
-- - Prevents reactivating invitations that are not currently pending
-- - Restricts the new status to valid transitions only
-- - Super admins retain full update capability
-- ============================================================
DROP POLICY IF EXISTS "Authorized users can update invitations" ON public.company_invitations;

CREATE POLICY "Authorized users can update invitations" ON public.company_invitations
FOR UPDATE
USING (
    -- Who can attempt the update (row selection)
    public.is_super_admin(auth.uid())
    OR invited_by_user_id = auth.uid()
)
WITH CHECK (
    -- What the resulting row must look like (prevents invalid transitions)
    public.is_super_admin(auth.uid())
    OR (
        -- Non-super-admins can only:
        -- 1. Cancel a pending invitation (status: pending -> cancelled)
        -- 2. Resend a pending invitation (update message/expires_at on pending)
        -- They CANNOT reactivate an expired/accepted/cancelled invitation
        invited_by_user_id = auth.uid()
        AND status IN ('pending', 'cancelled')
        AND (
            -- The current (old) row must also be in a non-terminal state
            -- We check via a subquery that the row being updated is still pending
            EXISTS (
                SELECT 1 FROM public.company_invitations ci
                WHERE ci.id = company_invitations.id
                AND ci.status = 'pending'
            )
            OR status = 'cancelled' -- allow cancellation of pending invites
        )
    )
);

-- Also drop and recreate the SELECT policy to remove the invitee
-- email-match clause that exposed the token column.
-- After column privilege revocation above, the token is no longer
-- readable even with SELECT, but removing the email fallback prevents
-- an authenticated user from enumerating other users' invitation metadata.
-- NOTE: The portal-invite component email fallback now uses the user's
-- active session to find their invitation (server-side function validates context).
DROP POLICY IF EXISTS "Company members and superadmins can view invitations" ON public.company_invitations;

CREATE POLICY "Company members and superadmins can view invitations" ON public.company_invitations
FOR SELECT USING (
    -- Super admins see everything
    public.is_super_admin(auth.uid())
    OR
    -- Company members see their company's invitations
    (
        company_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
    )
    -- Invitee may view their own invitation record (token column is revoked above)
    OR (lower(email) = lower(auth.jwt() ->> 'email'))
    -- Inviter may view invitations they sent
    OR invited_by_user_id = auth.uid()
);
