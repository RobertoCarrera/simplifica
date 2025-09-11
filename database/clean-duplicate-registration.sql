-- ========================================
-- LIMPIEZA DE REGISTROS DUPLICADOS
-- ========================================

-- Este script limpia los registros duplicados que se crearon durante las pruebas

-- 1. Ver el estado actual
SELECT 'ANTES DE LIMPIEZA - USUARIOS' as status;
SELECT 
    id,
    email,
    name,
    company_id,
    auth_user_id,
    created_at
FROM public.users
ORDER BY created_at DESC;

SELECT 'ANTES DE LIMPIEZA - EMPRESAS' as status;
SELECT 
    id,
    name,
    slug,
    created_at
FROM public.companies
ORDER BY created_at DESC;

-- 2. Eliminar el usuario duplicado más reciente (que usa el email de prueba)
DELETE FROM public.users 
WHERE email = 'digitalizamostupyme@gmail.com'
AND auth_user_id = '6e3cb937-ca44-42aa-9300-ab7101b7ac64';

-- 3. Eliminar las empresas duplicadas creadas recientemente
DELETE FROM public.companies 
WHERE id IN (
    '4a71ec51-af8b-4cf5-92c1-521352d09ebb',  -- digitalizamostupyme
    'e97e61c4-54aa-4f86-8baa-866b24507764'   -- Dev
);

-- 4. Ver el estado después de la limpieza
SELECT 'DESPUÉS DE LIMPIEZA - USUARIOS' as status;
SELECT 
    id,
    email,
    name,
    company_id,
    auth_user_id,
    created_at
FROM public.users
ORDER BY created_at DESC;

SELECT 'DESPUÉS DE LIMPIEZA - EMPRESAS' as status;
SELECT 
    id,
    name,
    slug,
    created_at
FROM public.companies
ORDER BY created_at DESC;

-- 5. También limpiar de auth.users el usuario de prueba
-- NOTA: Esto debe ejecutarse manualmente desde el Dashboard de Supabase
-- ve a Authentication > Users y elimina manualmente el usuario 'digitalizamostupyme@gmail.com'

SELECT 'NOTA: También elimina manualmente el usuario digitalizamostupyme@gmail.com desde Supabase Dashboard > Authentication > Users' as reminder;
