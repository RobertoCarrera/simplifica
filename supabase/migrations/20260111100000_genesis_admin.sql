-- GENESIS SCRIPT: Bootstrap First Admin User & Company
-- Run this to force 'robertocarreratech@gmail.com' to be the Owner of the main company.

DO $$
DECLARE
    v_auth_user_id uuid;
    v_public_user_id uuid;
    v_company_id uuid;
    v_email text := 'robertocarreratech@gmail.com';
BEGIN
    -- 1. Get Auth User ID (Must exist in Supabase Auth)
    SELECT id INTO v_auth_user_id FROM auth.users WHERE email = v_email;

    -- Fallback: Try with the ID provided in your previous message
    IF v_auth_user_id IS NULL THEN
         SELECT id INTO v_auth_user_id FROM auth.users WHERE id = 'fc8a205b-9040-4913-84cf-081c02602f1a';
    END IF;

    IF v_auth_user_id IS NULL THEN
        RAISE NOTICE 'Skipping genesis admin: User % not found locally', v_email;
        RETURN;
    END IF;

    -- 2. Ensure Company Exists
    SELECT id INTO v_company_id FROM public.companies LIMIT 1;

    IF v_company_id IS NULL THEN
        INSERT INTO public.companies (name, email) 
        VALUES ('Simplifica Inc.', v_email) 
        RETURNING id INTO v_company_id;
        RAISE NOTICE 'Created new company: %', v_company_id;
    ELSE
        RAISE NOTICE 'Using existing company: %', v_company_id;
    END IF;

    -- 3. Create/Update Public User Profile (Admin/Owner)
    INSERT INTO public.users (auth_user_id, email, name, surname, company_id, role, active)
    VALUES (
        v_auth_user_id, 
        v_email, 
        'Roberto', 
        'Carrera', 
        v_company_id, 
        'owner',
        true
    )
    ON CONFLICT (auth_user_id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        company_id = EXCLUDED.company_id,
        role = EXCLUDED.role,
        name = EXCLUDED.name,
        surname = EXCLUDED.surname,
        active = true
    RETURNING id INTO v_public_user_id;

    -- 4. Grant Permissions (Company Member - Owner)
    INSERT INTO public.company_members (user_id, company_id, role, status)
    VALUES (v_public_user_id, v_company_id, 'owner', 'active')
    ON CONFLICT (user_id, company_id) DO UPDATE
    SET role = 'owner', status = 'active';

    RAISE NOTICE 'SUCCESS: User % is now OWNER of Company %', v_email, v_company_id;

END $$;
