-- FORCE CREATE ADMIN USER & GENESIS
-- Since there is no public sign-up, this script manually creates the user in auth.users
-- and sets up the full admin environment.

-- NOTE: Password will be set to '12345678'. Change it after logging in!

DO $$
DECLARE
    v_user_email text := 'robertocarreratech@gmail.com';
    v_user_password text := '12345678';
    v_auth_user_id uuid := gen_random_uuid(); 
    v_company_id uuid;
    v_encrypted_pw text;
BEGIN
    -- 0. Cleanup any ghost public records
    DELETE FROM public.company_members WHERE user_id IN (SELECT id FROM public.users WHERE email = v_user_email);
    DELETE FROM public.users WHERE email = v_user_email;
    
    -- Cleanup auth if exists (to start fresh) - Comment out if permission denied, but usually safe in SQL Editor
    -- DELETE FROM auth.users WHERE email = v_user_email;

    -- 1. Create Auth User (if not exists)
    -- We need to check if it exists first to avoid dupes if the delete above failed/was skipped
    SELECT id INTO v_auth_user_id FROM auth.users WHERE email = v_user_email;

    IF v_auth_user_id IS NULL THEN
        v_auth_user_id := gen_random_uuid();
        -- Generate hashed password (this is a standard bcrypt hash for '12345678')
        v_encrypted_pw := crypt(v_user_password, gen_salt('bf'));

        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            role,
            aud,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            v_auth_user_id,
            '00000000-0000-0000-0000-000000000000',
            v_user_email,
            v_encrypted_pw,
            now(), -- Email confirmed
            '{"provider":"email","providers":["email"]}',
            '{}',
            now(),
            now(),
            'authenticated',
            'authenticated',
            '',
            '',
            '',
            ''
        );

        -- Create Identity (Required for Supabase Auth to work consistently)
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            v_auth_user_id,
            v_auth_user_id,
            format('{"sub":"%s","email":"%s"}', v_auth_user_id::text, v_user_email)::jsonb,
            'email',
            v_auth_user_id::text,
            now(),
            now(),
            now()
        );
        
        RAISE NOTICE 'Created new Auth User: %', v_auth_user_id;
    ELSE
        RAISE NOTICE 'Auth User already exists: %', v_auth_user_id;
    END IF;

    -- CRITICAL FIX: Ensure no NULLs exist in these fields (prevents 500 Error)
    UPDATE auth.users 
    SET 
        email_change = '',
        email_change_token_new = '',
        recovery_token = ''
    WHERE id = v_auth_user_id;

    -- 2. Ensure Company
    SELECT id INTO v_company_id FROM public.companies LIMIT 1;
    IF v_company_id IS NULL THEN
        INSERT INTO public.companies (name) VALUES ('Simplifica Inc.')
        RETURNING id INTO v_company_id;
    END IF;

    -- 3. Create Public Profile & Admin Permissions
    INSERT INTO public.users (auth_user_id, email, name, surname, company_id, role, active)
    VALUES (v_auth_user_id, v_user_email, 'Roberto', 'Carrera', v_company_id, 'owner', true)
    ON CONFLICT (auth_user_id) DO UPDATE 
    SET company_id = v_company_id, role = 'owner', active = true;

    INSERT INTO public.company_members (user_id, company_id, role, status)
    VALUES ((SELECT id FROM public.users WHERE auth_user_id = v_auth_user_id), v_company_id, 'owner', 'active')
    ON CONFLICT (user_id, company_id) DO UPDATE SET role = 'owner', status = 'active';

    RAISE NOTICE 'SUCCESS: Full environment restored. Login with % / %', v_user_email, v_user_password;
END $$;
