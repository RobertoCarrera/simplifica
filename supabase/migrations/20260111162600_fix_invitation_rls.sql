-- Fix company_invitations RLS policies to correctly map auth.uid() to public.users.id
-- Current policies incorrectly compare company_members.user_id (UUID) with auth.uid() (Auth UUID)

BEGIN;

-- Drop existing broken policies
DROP POLICY IF EXISTS "Owners and admins can create invitations" ON company_invitations;
DROP POLICY IF EXISTS "Owners and admins can delete invitations" ON company_invitations;
DROP POLICY IF EXISTS "Owners and admins can update invitations" ON company_invitations;

-- Re-create policies using get_my_public_id() or explicit lookup

-- INSERT
CREATE POLICY "Owners and admins can create invitations" ON company_invitations
  FOR INSERT
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_invitations.company_id
        AND cm.user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
        AND cm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    ))
    AND
    -- Optional: Ensure invited_by_user_id matches the creator
    (invited_by_user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid()))
  );

-- DELETE
CREATE POLICY "Owners and admins can delete invitations" ON company_invitations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_invitations.company_id
        AND cm.user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
        AND cm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

-- UPDATE
CREATE POLICY "Owners and admins can update invitations" ON company_invitations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_invitations.company_id
        AND cm.user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
        AND cm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

COMMIT;
