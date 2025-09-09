-- ============================================
-- CREAR USUARIO DE PRUEBA DIRECTAMENTE
-- ============================================

-- MÉTODO 1: Preparar invitación usando INSERT seguro
-- Primero verificar si ya existe
DO $$
DECLARE
    user_exists BOOLEAN;
    company_uuid UUID;
BEGIN
    -- Verificar si el usuario ya existe
    SELECT EXISTS(SELECT 1 FROM public.users WHERE email = 'puchu.carrera@gmail.com') INTO user_exists;
    
    IF NOT user_exists THEN
        -- Obtener la primera empresa disponible
        SELECT id INTO company_uuid FROM companies WHERE is_active = true LIMIT 1;
        
        IF company_uuid IS NOT NULL THEN
            -- Insertar usuario en public.users
            INSERT INTO public.users (
                company_id,
                email,
                name,
                role,
                active,
                permissions
            ) VALUES (
                company_uuid,
                'puchu.carrera@gmail.com',  -- TU EMAIL REAL
                'Roberto Carrera',           -- TU NOMBRE
                'owner',                     -- owner, admin, o member
                false,                       -- Inactivo hasta confirmar
                '{"canManageUsers": true, "canSeeAllData": true, "isDev": true}'::jsonb
            );
            
            RAISE NOTICE 'Usuario creado en public.users: puchu.carrera@gmail.com';
        ELSE
            RAISE NOTICE 'No se encontró ninguna empresa activa';
        END IF;
    ELSE
        RAISE NOTICE 'El usuario ya existe: puchu.carrera@gmail.com';
    END IF;
END $$;

-- MÉTODO 2: Crear usuario directamente en auth.users (SOLO PARA TESTING)
-- CUIDADO: Usar solo si el método anterior no funciona

-- Primero verificar que no existe
-- SELECT * FROM auth.users WHERE email = 'puchu.carrera@gmail.com';

-- Si no existe, crear
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'puchu.carrera@gmail.com',  -- TU EMAIL
    crypt('Simplifica123!', gen_salt('bf')),  -- TU PASSWORD
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Roberto Carrera"}',  -- TU NOMBRE
    NOW(),
    NOW(),
    '',
    ''
) ON CONFLICT (email) DO NOTHING;

-- Verificar que se creó
SELECT email, email_confirmed_at, created_at 
FROM auth.users 
WHERE email = 'puchu.carrera@gmail.com';

-- Verificar que se creó también en public.users
SELECT email, name, role, active, company_id 
FROM public.users 
WHERE email = 'puchu.carrera@gmail.com';
