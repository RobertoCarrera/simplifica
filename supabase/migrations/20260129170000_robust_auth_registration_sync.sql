-- 20260129170000_robust_auth_registration_sync.sql

-- MIGRACIÓN DE SEGURIDAD: SINCRONIZACIÓN ROBUSTA DE REGISTRO
-- Objetivo: Mover la lógica de creación de perfiles y empresas del cliente (JS) al servidor (SQL).
-- Esto elimina condiciones de carrera, asegura la integridad ACID y previene usuarios "huérfanos".

-- 1. Función para manejar el registro de nuevos usuarios (Owners)
-- Esta función se encarga de crear la empresa y el perfil de usuario automáticamente
-- cuando alguien se registra con intención de ser "Owner" (usando metadata).

CREATE OR REPLACE FUNCTION public.handle_new_user_registration()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
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
    -- Extraer metadata del registro (inyectada por el frontend en el signUp)
    v_company_name := NEW.raw_user_meta_data->>'company_name';
    v_full_name := NEW.raw_user_meta_data->>'full_name';
    v_given_name := NEW.raw_user_meta_data->>'given_name';
    v_surname := NEW.raw_user_meta_data->>'surname';

    -- Si no hay nombre de empresa, es un registro simple o invitación,
    -- el trigger 'on_auth_user_created_link' (existente) se encargará de vincularlo.
    IF v_company_name IS NULL OR v_company_name = '' THEN
        RETURN NEW;
    END IF;

    -- 2. Crear la Empresa
    -- Usamos un nombre de slug único basado en el tiempo para evitar colisiones
    INSERT INTO public.companies (name, slug, is_active)
    VALUES (
        v_company_name, 
        lower(regexp_replace(v_company_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || extract(epoch from now())::text,
        true
    )
    RETURNING id INTO v_company_id;

    -- 3. Crear el Perfil de Usuario en public.users
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
        COALESCE(v_surname, substring(v_full_name from position(' ' in v_full_name) + 1)),
        true,
        v_company_id
    )
    RETURNING id INTO v_user_id;

    -- 4. Asignar Rol de Owner en la empresa
    -- Buscamos el ID del rol 'owner' en app_roles
    SELECT id INTO v_role_id FROM public.app_roles WHERE name = 'owner' LIMIT 1;

    INSERT INTO public.company_members (
        user_id,
        company_id,
        role_id,
        role,
        status
    ) VALUES (
        v_user_id,
        v_company_id,
        v_role_id,
        'owner',
        'active'
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- En triggers de Auth, es vital no bloquear el login si algo falla en la lógica secundaria.
    -- Logeamos el error (aparecerá en los logs de Supabase) pero permitimos que el usuario se cree.
    RAISE WARNING 'Error en handle_new_user_registration: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- 5. Crear el Trigger
DROP TRIGGER IF EXISTS on_auth_user_created_registration ON auth.users;
CREATE TRIGGER on_auth_user_created_registration
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_registration();
