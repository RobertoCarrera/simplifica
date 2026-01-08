-- Migration: Fix is_company_member RLS helper function
-- Date: 2026-01-08 16:30:00
-- Description: The previous version compared company_members.user_id (public UUID) directly with auth.uid() (auth UUID).
--              This caused false negatives, preventing users from seeing their own companies.
--              This fix joins public.users to bridge the two IDs.

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    WHERE cm.company_id = p_company_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
  );
END;
$$;
