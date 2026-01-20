-- Migration: 20260126140000_auto_link_users_clients.sql

-- 1. Function to link a new Auth User to existing Public Users/Clients
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_link()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- Link to public.users (Staff/Members)
    UPDATE public.users
    SET auth_user_id = NEW.id
    WHERE email = NEW.email
      AND auth_user_id IS NULL;

    -- Link to public.clients (Customers)
    UPDATE public.clients
    SET auth_user_id = NEW.id
    WHERE email = NEW.email
      AND auth_user_id IS NULL;

    RETURN NEW;
END;
$$;

-- Trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_link ON auth.users;
CREATE TRIGGER on_auth_user_created_link
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_auth_user_link();

-- 2. Function to link a new Public Client to an existing Auth User
CREATE OR REPLACE FUNCTION public.handle_new_client_link()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    existing_auth_id uuid;
BEGIN
    -- Check if auth user exists with this email
    SELECT id INTO existing_auth_id
    FROM auth.users
    WHERE email = NEW.email;

    IF existing_auth_id IS NOT NULL AND NEW.auth_user_id IS NULL THEN
        NEW.auth_user_id := existing_auth_id;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger on public.clients (BEFORE INSERT)
DROP TRIGGER IF EXISTS on_client_created_link ON public.clients;
CREATE TRIGGER on_client_created_link
    BEFORE INSERT ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_client_link();

-- 3. Function to link a new Public User to an existing Auth User
CREATE OR REPLACE FUNCTION public.handle_new_user_link()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    existing_auth_id uuid;
BEGIN
    -- Check if auth user exists with this email
    SELECT id INTO existing_auth_id
    FROM auth.users
    WHERE email = NEW.email;

    IF existing_auth_id IS NOT NULL AND NEW.auth_user_id IS NULL THEN
        NEW.auth_user_id := existing_auth_id;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger on public.users (BEFORE INSERT)
DROP TRIGGER IF EXISTS on_user_created_link ON public.users;
CREATE TRIGGER on_user_created_link
    BEFORE INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_link();
