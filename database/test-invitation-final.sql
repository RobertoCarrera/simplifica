-- ============================================
-- TEST DE INVITACIÓN (DESPUÉS DE ARREGLOS)
-- ============================================

-- 1. Verificar que solo hay una función
SELECT 'VERIFICAR FUNCIÓN ÚNICA:' as info;
SELECT proname, pronargs 
FROM pg_proc 
WHERE proname = 'invite_user_to_company';

-- 2. Verificar usuario actual y empresa
SELECT 'USUARIO ACTUAL:' as info;
SELECT u.email, u.name, u.role, c.name as company_name
FROM public.users u
JOIN public.companies c ON c.id = u.company_id
WHERE u.auth_user_id = auth.uid();

-- 3. Test de invitación con tipos explícitos
SELECT 'TEST INVITACIÓN:' as info;
SELECT public.invite_user_to_company(
    'test.final@ejemplo.com'::TEXT,
    'Usuario Test Final'::TEXT,
    'member'::TEXT
) as result;

-- 4. Verificar resultado
SELECT 'USUARIO CREADO:' as info;
SELECT email, name, role, active
FROM public.users 
WHERE email = 'test.final@ejemplo.com';
