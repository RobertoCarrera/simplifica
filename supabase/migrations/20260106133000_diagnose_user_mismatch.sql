DO $$
DECLARE
    v_email text := 'puchu_114@hotmail.com';
    v_auth_record record;
    v_public_user record;
    v_public_client record;
BEGIN
    RAISE NOTICE '--- DIAGNOSTICO PARA: % ---', v_email;

    -- 1. Check Auth User
    SELECT id, email, created_at INTO v_auth_record FROM auth.users WHERE email = v_email;
    IF v_auth_record.id IS NULL THEN
        RAISE NOTICE '❌ NO existe usuario en auth.users con este email.';
    ELSE
        RAISE NOTICE '✅ Auth User encontrado. ID: %', v_auth_record.id;
    END IF;

    -- 2. Check Public User by ID
    IF v_auth_record.id IS NOT NULL THEN
        SELECT * INTO v_public_user FROM public.users WHERE auth_user_id = v_auth_record.id;
        IF v_public_user.id IS NULL THEN
            RAISE NOTICE '❌ public.users: NO se encontró registro con auth_user_id = %', v_auth_record.id;
            
            -- Check if it exists by email but different ID
            SELECT * INTO v_public_user FROM public.users WHERE email = v_email;
            IF v_public_user.id IS NOT NULL THEN
                RAISE NOTICE '⚠️ public.users: Existe usuario con este EMAIL pero diferente auth_id. ID actual: %, AuthID en registro: %', v_public_user.id, v_public_user.auth_user_id;
            END IF;
        ELSE
            RAISE NOTICE '✅ public.users: Encontrado correctamente. Email en ficha: %', v_public_user.email;
             IF v_public_user.email != v_email THEN
                RAISE NOTICE '⚠️ AVISO: El email en public.users NO coincide con auth.users';
            END IF;
        END IF;

        -- 3. Check Public Client by ID
         SELECT * INTO v_public_client FROM public.clients WHERE auth_user_id = v_auth_record.id;
        IF v_public_client.id IS NULL THEN
             RAISE NOTICE 'ℹ️ public.clients: No encontrado por ID.';
        ELSE
             RAISE NOTICE '✅ public.clients: Encontrado. Email: %', v_public_client.email;
        END IF;
    END IF;
    
    RAISE NOTICE '--- FIN DIAGNOSTICO ---';
END $$;
