DO $$
DECLARE
    v_auth_id uuid;
    v_rows_updated integer;
    v_target_email text := 'puchu_114@hotmail.com';
BEGIN
    -- 1. Buscar el ID de usuario basado en el nuevo email
    SELECT id INTO v_auth_id FROM auth.users WHERE email = v_target_email;
    
    IF v_auth_id IS NOT NULL THEN
        RAISE NOTICE 'Found Auth User ID: %', v_auth_id;

        -- 2. Actualizar email en public.users
        UPDATE public.users
        SET email = v_target_email
        WHERE auth_user_id = v_auth_id;
        
        GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
        RAISE NOTICE 'Updated % rows in public.users', v_rows_updated;

        -- 3. Actualizar email en public.clients
        UPDATE public.clients
        SET email = v_target_email
        WHERE auth_user_id = v_auth_id;
        
        GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
        RAISE NOTICE 'Updated % rows in public.clients', v_rows_updated;
    ELSE
        RAISE NOTICE 'Auth user not found for email %', v_target_email;
    END IF;
END $$;
