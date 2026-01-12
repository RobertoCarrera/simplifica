-- Create a function to sync auth.identities to public.integrations
CREATE OR REPLACE FUNCTION public.handle_google_identity_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_public_user_id uuid;
  v_provider_token text;
  v_refresh_token text;
  v_expires_in int;
BEGIN
  -- Only care about Google provider
  IF NEW.provider = 'google' THEN
    
    -- Lookup public user ID
    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE auth_user_id = NEW.user_id
    LIMIT 1;

    -- If no public user found, we can't link, so exit (or handle error)
    -- This might happen if auth user is created before public user
    IF v_public_user_id IS NULL THEN
      RETURN NEW; 
    END IF;

    v_provider_token := NEW.identity_data->>'provider_access_token';
    v_refresh_token := NEW.identity_data->>'provider_refresh_token';
    -- Default to 1 hour if not provided
    v_expires_in := COALESCE((NEW.identity_data->>'expires_in')::int, 3600);
    
    INSERT INTO public.integrations (
      user_id,
      provider,
      access_token,
      refresh_token,
      expires_at,
      metadata,
      updated_at
    )
    VALUES (
      v_public_user_id, -- Use the PUBLIC user id
      'google_calendar', 
      v_provider_token,
      v_refresh_token,
      NOW() + (v_expires_in || ' seconds')::interval,
      NEW.identity_data,
      NOW()
    )
    ON CONFLICT (user_id, provider) DO UPDATE
    SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, public.integrations.refresh_token),
      expires_at = EXCLUDED.expires_at,
      metadata = EXCLUDED.metadata,
      updated_at = NOW();
      
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS on_google_identity_sync ON auth.identities;
CREATE TRIGGER on_google_identity_sync
AFTER INSERT OR UPDATE ON auth.identities
FOR EACH ROW
EXECUTE FUNCTION public.handle_google_identity_sync();
