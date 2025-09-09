-- ============================================
-- CREAR TU USUARIO PARA QUE PUEDAS ACCEDER
-- ============================================

-- 1. Primero ejecuta el script de limpieza de funciones si no lo has hecho
-- (fix-rls-and-functions.sql)

-- 2. Crear tu usuario con la función debug
SELECT 'CREANDO TU USUARIO:' as info;
SELECT public.invite_user_to_company_debug(
    'puchu.carrera@gmail.com'::TEXT,
    'Puchu Carrera'::TEXT,
    'owner'::TEXT
) as result;

-- 3. Verificar que se creó correctamente
SELECT 'VERIFICANDO USUARIO CREADO:' as info;
SELECT id, email, name, role, active, company_id, auth_user_id
FROM public.users 
WHERE email = 'puchu.carrera@gmail.com';

-- 4. Mostrar la empresa asignada
SELECT 'EMPRESA ASIGNADA:' as info;
SELECT c.id, c.name, c.slug, c.is_active
FROM public.companies c
JOIN public.users u ON u.company_id = c.id
WHERE u.email = 'puchu.carrera@gmail.com';

-- 5. Instrucciones para el siguiente paso
SELECT 'SIGUIENTE PASO:' as info, 
       'Ahora ve a Authentication > Users en Supabase y invítate con el mismo email' as instruccion;
