-- ============================================
-- INVITACIÓN CON REDIRECT CORRECTO
-- ============================================

-- Opción 1: Crear invitación manual con redirect correcto
INSERT INTO auth.users (
    id,
    email,
    email_confirmed_at,
    created_at,
    updated_at
) VALUES (
    gen_random_uuid(),
    'puchu.carrera@gmail.com',
    NOW(),
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- Obtener el UUID del usuario auth creado
SELECT 'AUTH USER CREADO:' as info;
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
WHERE email = 'puchu.carrera@gmail.com';

-- Actualizar el auth_user_id en public.users
UPDATE public.users 
SET auth_user_id = (
    SELECT id FROM auth.users WHERE email = 'puchu.carrera@gmail.com'
)
WHERE email = 'puchu.carrera@gmail.com';

-- Verificar que está conectado
SELECT 'USUARIO CONECTADO:' as info;
SELECT u.email, u.name, u.role, u.auth_user_id, au.email as auth_email
FROM public.users u
LEFT JOIN auth.users au ON au.id = u.auth_user_id
WHERE u.email = 'puchu.carrera@gmail.com';
