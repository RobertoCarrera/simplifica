DO $$
DECLARE
    v_auth_email text := 'puchu_114@hotmail.com';
    v_target_auth_id uuid := '0e4662bc-0696-4e4f-a489-d9ce811c9745'; -- Del resultado anterior
    v_existing_user_id uuid;
    v_existing_name text;
BEGIN
    RAISE NOTICE 'Buscando usuario Vanesa...';
    
    -- 1. Buscar por nombre aproximado
    SELECT id, name INTO v_existing_user_id, v_existing_name
    FROM public.users 
    WHERE name ILIKE '%Vanesa%'
    LIMIT 1;
    
    IF v_existing_user_id IS NOT NULL THEN
        RAISE NOTICE '✅ Encontrado usuario: % (ID: %)', v_existing_name, v_existing_user_id;
        
        -- 2. Actualizar el usuario para enlazarlo con la cuenta Auth correcta
        UPDATE public.users
        SET 
            auth_user_id = v_target_auth_id,
            email = v_auth_email
        WHERE id = v_existing_user_id;
        
        RAISE NOTICE '✅ Usuario re-vinculado exitosamente.';
    ELSE
        RAISE NOTICE '❌ No se encontró ningún usuario llamado "Vanesa" en la tabla public.users.';
        RAISE NOTICE '¿Deseas crear uno nuevo?';
        
        -- Opcional: Crear si no existe (descomentar si se desea)
        -- INSERT INTO public.users (id, auth_user_id, email, name, role, active, company_id)
        -- VALUES (gen_random_uuid(), v_target_auth_id, v_auth_email, 'Vanesa Santa Maria', 'owner', true, (SELECT id FROM companies LIMIT 1));
    END IF;
END $$;
