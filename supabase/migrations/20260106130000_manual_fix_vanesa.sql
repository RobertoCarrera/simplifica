-- Fix email mismatch for user with specific email
-- This syncs public.users.email and public.clients.email with auth.users.email
-- based on the auth_user_id link.

DO $$
DECLARE
    v_auth_id uuid;
    v_target_email text := 'puchu_114@hotmail.com';
BEGIN
    -- 1. Find the Auth ID for the target email
    SELECT id INTO v_auth_id FROM auth.users WHERE email = v_target_email;
    
    IF v_auth_id IS NOT NULL THEN
        RAISE NOTICE 'Found Auth User ID: %', v_auth_id;

        -- 2. Update public.users
        UPDATE public.users
        SET email = v_target_email
        WHERE auth_user_id = v_auth_id AND email != v_target_email;
        
        GET DIAGNOSTICS v_auth_id = ROW_COUNT;
        RAISE NOTICE 'Updated % rows in public.users', v_auth_id;

        -- 3. Update public.clients
        UPDATE public.clients
        SET email = v_target_email
        WHERE auth_user_id = v_auth_id AND email != v_target_email;
    ELSE
        RAISE NOTICE 'Auth user not found for email %', v_target_email;
    END IF;
END $$;
