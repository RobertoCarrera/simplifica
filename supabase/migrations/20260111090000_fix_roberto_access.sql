-- Fix access for specific user 'robertocarreratech@gmail.com'
-- Ensures they exist in public.users and have an ACTIVE OWNER membership in the company.

DO $$
DECLARE
    v_auth_user_id uuid;
    v_public_user_id uuid;
    v_company_id uuid;
BEGIN
    -- 1. Get auth user id
    SELECT id INTO v_auth_user_id FROM auth.users WHERE email = 'robertocarreratech@gmail.com';

    IF v_auth_user_id IS NULL THEN
        RAISE NOTICE 'User robertocarreratech@gmail.com not found in auth.users. Please sign up first.';
        RETURN;
    END IF;

    -- 2. Get the company (pick the first one found, assuming single tenant or main company)
    SELECT id INTO v_company_id FROM public.companies LIMIT 1;

    IF v_company_id IS NULL THEN
        RAISE NOTICE 'No company found. Creating one...';
        INSERT INTO public.companies (name, email) 
        VALUES ('Simplifica Inc.', 'robertocarreratech@gmail.com') 
        RETURNING id INTO v_company_id;
    END IF;

    -- 3. Upsert into public.users to ensure profile exists and Legacy fields are linked
    INSERT INTO public.users (auth_user_id, email, name, surname, company_id, role)
    VALUES (v_auth_user_id, 'robertocarreratech@gmail.com', 'Roberto', 'Carrera', v_company_id, 'owner')
    ON CONFLICT (auth_user_id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        company_id = v_company_id, -- Fix legacy field
        role = 'owner',            -- Fix legacy field
        name = 'Roberto',
        surname = 'Carrera',
        active = true;
    
    SELECT id INTO v_public_user_id FROM public.users WHERE auth_user_id = v_auth_user_id;

    -- 4. Upsert into company_members to ensure ACTIVE OWNER access
    INSERT INTO public.company_members (user_id, company_id, role, status)
    VALUES (v_public_user_id, v_company_id, 'owner', 'active')
    ON CONFLICT (user_id, company_id) DO UPDATE
    SET status = 'active', role = 'owner';

    RAISE NOTICE 'Access fixed for robertocarreratech@gmail.com. Company ID: %, Public User ID: %', v_company_id, v_public_user_id;

END $$;
