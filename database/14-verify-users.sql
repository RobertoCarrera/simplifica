-- ================================================
-- VERIFICACIÓN RÁPIDA: USUARIOS ACTIVOS
-- ================================================
-- Este script verifica que tengamos usuarios activos 
-- para que el componente pueda cargarlos dinámicamente

SELECT '=== VERIFICACIÓN DE USUARIOS ===' as titulo;

-- 1. Contar usuarios activos
SELECT 
    'Total usuarios activos' as descripcion,
    COUNT(*) as cantidad
FROM public.users 
WHERE active = true AND deleted_at IS NULL;

-- 2. Listar usuarios activos con sus empresas
SELECT 
    '=== USUARIOS CON SUS EMPRESAS ===' as titulo
UNION ALL
SELECT 
    CONCAT(
        u.name, 
        ' (', u.email, ') - ', 
        c.name, 
        ' - Role: ', u.role
    ) as titulo
FROM public.users u
JOIN public.companies c ON u.company_id = c.id
WHERE u.active = true 
AND u.deleted_at IS NULL 
AND c.deleted_at IS NULL
ORDER BY c.name, u.name;

-- 3. Contar clientes por empresa
SELECT 
    '=== CONTEO DE CLIENTES POR EMPRESA ===' as titulo
UNION ALL
SELECT 
    CONCAT(
        c.name, 
        ': ', 
        COUNT(cl.id), 
        ' clientes'
    ) as titulo
FROM public.companies c
LEFT JOIN public.clients cl ON c.id = cl.company_id AND cl.deleted_at IS NULL
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name
ORDER BY c.name;
