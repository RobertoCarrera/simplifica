-- RPC to mark onboarding as completed for a user
-- Called after successful TOTP verification in complete-profile flow
CREATE OR REPLACE FUNCTION public.complete_onboarding(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET onboarding_completed = true
  WHERE auth_user_id = p_user_id
  RETURNING jsonb_build_object('success', true, 'user_id', id);
END;
$$;