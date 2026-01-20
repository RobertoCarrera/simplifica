-- Create a function to allow users to retrieve their own provider tokens
-- This is necessary because Supabase client sometimes strips these tokens from the session
CREATE OR REPLACE FUNCTION public.get_provider_tokens(provider_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_identity_data jsonb;
  v_access_token text;
  v_refresh_token text;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get identity data for the provider
  SELECT identity_data INTO v_identity_data
  FROM auth.identities
  WHERE user_id = v_user_id
  AND provider = provider_name
  LIMIT 1;

  IF v_identity_data IS NULL THEN
    RETURN json_build_object('error', 'Identity not found');
  END IF;

  -- Extract tokens
  v_access_token := v_identity_data->>'provider_access_token';
  v_refresh_token := v_identity_data->>'provider_refresh_token';

  -- Return as JSON
  RETURN json_build_object(
    'access_token', v_access_token,
    'refresh_token', v_refresh_token,
    'expires_in', (v_identity_data->>'expires_in')::int
  );
END;
$$;
