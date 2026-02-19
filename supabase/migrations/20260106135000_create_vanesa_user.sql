-- Create missing public.users record for Vanesa
-- Linked to authenticated user 'puchu_114@hotmail.com'

DO $$
DECLARE
    v_target_email text := 'puchu_114@hotmail.com';
    v_target_auth_id uuid;
    v_company_id uuid;
    v_new_id uuid := gen_random_uuid();
BEGIN
    -- 1. Get Auth ID
    SELECT id INTO v_target_auth_id FROM auth.users WHERE email = v_target_email;
    IF v_target_auth_id IS NULL THEN
        RAISE NOTICE 'Skipping user creation: Auth user % not found in local environment', v_target_email;
        RETURN;
    END IF;

    -- 2. Get a Company ID (Assuming there is at least one company, e.g. from the client record or just the first one)
    -- Try to finding the company from her client record first
    SELECT company_id INTO v_company_id FROM public.clients WHERE auth_user_id = v_target_auth_id LIMIT 1;
    
    -- Fallback: Get first company
    IF v_company_id IS NULL THEN
        SELECT id INTO v_company_id FROM public.companies LIMIT 1;
    END IF;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'No company found in the system to assign users to.';
    END IF;

    RAISE NOTICE 'Creating user for AuthID: % in Company: %', v_target_auth_id, v_company_id;

    -- 3. Insert into public.users
    INSERT INTO public.users (
        id,
        auth_user_id,
        email,
        name,
        role,
        active,
        company_id
    ) VALUES (
        v_new_id,
        v_target_auth_id,
        v_target_email,
        'Vanesa Santa Maria',
        'owner',  -- Giving Owner role based on request context (domain purchase)
        true,
        v_company_id
    );

    RAISE NOTICE '✅ User created successfully with ID: %', v_new_id;
END $$;
