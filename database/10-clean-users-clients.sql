-- ================================================
-- SCRIPT DE LIMPIEZA: USERS Y CLIENTS
-- ================================================
-- Este script limpia las tablas users y clients para 
-- eliminar cruces de información y crear una estructura limpia

-- 1. LIMPIAR USUARIOS (Soft delete para mantener integridad referencial)
UPDATE public.users 
SET deleted_at = NOW()
WHERE deleted_at IS NULL;

-- 2. LIMPIAR CLIENTES (Soft delete para mantener integridad referencial)
UPDATE public.clients 
SET deleted_at = NOW()
WHERE deleted_at IS NULL;

-- 3. VERIFICAR LIMPIEZA
SELECT 'LIMPIEZA COMPLETADA' as status;

SELECT 
    'users' as tabla,
    COUNT(*) as total_registros,
    COUNT(*) FILTER (WHERE deleted_at IS NULL) as activos,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as eliminados
FROM public.users
UNION ALL
SELECT 
    'clients' as tabla,
    COUNT(*) as total_registros,
    COUNT(*) FILTER (WHERE deleted_at IS NULL) as activos,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as eliminados
FROM public.clients;

-- 4. MOSTRAR EMPRESAS DISPONIBLES PARA VERIFICACIÓN
SELECT 
    id as company_id,
    name as company_name,
    website,
    created_at
FROM public.companies 
WHERE deleted_at IS NULL
ORDER BY name;
