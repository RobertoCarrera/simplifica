-- Fix: on_auth_user_created_registration trigger tries to INSERT into company_members
-- with a `role` column that doesn't exist in production (only role_id exists).
-- The EXCEPTION handler swallows the error silently, so new users registered via
-- signUp with company_name metadata never get a company_members record.

CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_name text;
    v_company_id uuid;
    v_user_id uuid;
    v_full_name text;
    v_given_name text;
    v_surname text;
    v_role_id uuid;
BEGIN
    -- Extract metadata injected by the frontend during signUp
    v_company_name := NEW.raw_user_meta_data->>'company_name';
    v_full_name := NEW.raw_user_meta_data->>'full_name';
    v_given_name := NEW.raw_user_meta_data->>'given_name';
    v_surname := NEW.raw_user_meta_data->>'surname';

    -- No company name → simple registration or invitation; let other triggers handle it
    IF v_company_name IS NULL OR v_company_name = '' THEN
        RETURN NEW;
    END IF;

    -- Create the Company
    INSERT INTO public.companies (name, slug, is_active)
    VALUES (
        v_company_name,
        lower(regexp_replace(v_company_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || extract(epoch from now())::text,
        true
    )
    RETURNING id INTO v_company_id;

    -- Create the User profile in public.users
    INSERT INTO public.users (
        auth_user_id,
        email,
        name,
        surname,
        active,
        company_id
    ) VALUES (
        NEW.id,
        NEW.email,
        COALESCE(v_given_name, split_part(v_full_name, ' ', 1), split_part(NEW.email, '@', 1)),
        COALESCE(v_surname, NULLIF(substring(v_full_name from position(' ' in v_full_name) + 1), '')),
        true,
        v_company_id
    )
    RETURNING id INTO v_user_id;

    -- Assign Owner role in the company
    SELECT id INTO v_role_id FROM public.app_roles WHERE name = 'owner' LIMIT 1;

    INSERT INTO public.company_members (
        user_id,
        company_id,
        role_id,
        status
    ) VALUES (
        v_user_id,
        v_company_id,
        v_role_id,
        'active'
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- In Auth triggers, never block login if secondary logic fails.
    RAISE WARNING 'Error en handle_new_user_registration: %', SQLERRM;
    RETURN NEW;
END;
$$;
