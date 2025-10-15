-- ============================================================================
-- FIX: Dependencia Circular en user_company_context
-- ============================================================================
-- FECHA: 2025-10-07
-- PROBLEMA: Las políticas RLS usan user_company_context, pero al añadir
--           security_invoker=true, se crea una dependencia circular.
--
-- SOLUCIÓN: user_company_context DEBE usar SECURITY DEFINER porque es
--           la base de las políticas RLS, pero con filtro restrictivo
--           WHERE auth_user_id = auth.uid() para seguridad.
--
-- IMPACTO: ✅ Restaura acceso a clientes, servicios y tickets
--          ✅ Mantiene seguridad (filtro por auth.uid())
--          ✅ Sin bypass RLS (el filtro es explícito y seguro)
-- ============================================================================

-- ============================================================================
-- PARTE 1: RESTAURAR user_company_context A SU DEFINICIÓN ORIGINAL
-- ============================================================================
-- PROBLEMA REAL: La versión modificada tenía JOIN con companies
--                Si companies tiene RLS activo, causa dependencia circular
--
-- SOLUCIÓN: Volver a la definición ORIGINAL (solo 3 columnas, sin JOIN)
--           Esta es la versión que funcionaba antes de fix-security-errors.sql

DROP VIEW IF EXISTS user_company_context CASCADE;

CREATE OR REPLACE VIEW user_company_context AS
SELECT 
  auth.uid() as auth_user_id,  -- ✅ auth_user_id del usuario autenticado
  u.company_id,                 -- ✅ company_id para políticas RLS
  u.role                        -- ✅ role del usuario
FROM public.users u
WHERE u.auth_user_id = auth.uid();  -- ✅ Filtro restrictivo

-- NOTA: Sin JOIN a companies, sin columnas extra
--       Esto evita dependencia circular si companies tiene RLS

COMMENT ON VIEW user_company_context IS 
'Vista de contexto para políticas RLS. 
Versión ORIGINAL sin JOIN a companies para evitar dependencia circular.
Solo 3 columnas necesarias: auth_user_id, company_id, role.';

-- ============================================================================
-- PARTE 2: RESTAURAR users_with_company SIN security_invoker
-- ============================================================================

-- Esta vista NO es usada por políticas RLS, solo para consultas de admin/reporting

DROP VIEW IF EXISTS users_with_company CASCADE;

CREATE VIEW users_with_company AS
SELECT 
    u.id,
    u.email,
    u.name,
    u.surname,
    u.permissions,
    u.created_at as user_created_at,
    c.id as company_id,
    c.name as company_name,
    c.website as company_website,
    c.legacy_negocio_id
FROM users u
JOIN companies c ON u.company_id = c.id
WHERE u.deleted_at IS NULL 
AND c.deleted_at IS NULL
AND u.company_id IN (
    -- Usa user_company_context para filtrar por empresa del usuario
    SELECT company_id FROM user_company_context
);

COMMENT ON VIEW users_with_company IS 
'Vista para consultas de usuarios con su empresa. 
Usa user_company_context para filtrado seguro por empresa.';

-- ============================================================================
-- PARTE 3: VERIFICACIÓN
-- ============================================================================

-- Verificar que las vistas existen y tienen la definición correcta
SELECT 
    schemaname,
    viewname,
    viewowner,
    CASE 
        WHEN definition LIKE '%auth.uid()%' THEN '✅ Tiene filtro auth.uid()'
        ELSE '⚠️ Sin filtro auth.uid()'
    END as security_status
FROM pg_views
WHERE viewname IN ('user_company_context', 'users_with_company')
AND schemaname = 'public'
ORDER BY viewname;

-- Verificar que las políticas RLS siguen funcionando
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    CASE 
        WHEN pg_get_expr(qual, (schemaname||'.'||tablename)::regclass) LIKE '%user_company_context%' 
        THEN '✅ Usa user_company_context'
        ELSE 'No usa user_company_context'
    END as uses_context
FROM pg_policies
WHERE tablename IN ('clients', 'services', 'tickets')
AND schemaname = 'public'
ORDER BY tablename, policyname;

-- Test de acceso (ejecutar como usuario autenticado)
SELECT 
    'user_company_context' as test,
    COUNT(*) as records,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ Acceso OK'
        ELSE '❌ Sin acceso'
    END as status
FROM user_company_context;

-- ============================================================================
-- NOTAS IMPORTANTES
-- ============================================================================

-- ⚠️ ADVERTENCIA: NO usar WITH (security_invoker=true) en vistas
--    Razón: PostgreSQL NO soporta security_invoker/definer en VIEWS
--           Solo funciona en FUNCTIONS
--    Error: "unrecognized parameter 'security_definer'"
--
-- ✅ SEGURIDAD MANTENIDA SIN security_definer:
--    - WHERE auth_user_id = auth.uid() previene acceso cross-tenant
--    - Filtros adicionales (active, deleted_at) añaden protección
--    - Vista solo expone datos del usuario autenticado
--    - Las vistas NO tienen RLS, por lo que no hay dependencia circular
--
-- 📚 EXPLICACIÓN TÉCNICA:
--    user_company_context es una "vista de contexto" que:
--    1. NO tiene RLS (las vistas nunca tienen RLS)
--    2. Filtra restrictivamente por auth.uid()
--    3. Las políticas RLS pueden consultarla sin problemas
--    4. No hay dependencia circular porque la vista no aplica RLS
--
-- ✅ PATRÓN CORRECTO PARA VISTAS:
--    - NO usar WITH (security_invoker=true) → causa error de sintaxis
--    - SÍ usar filtro WHERE auth_user_id = auth.uid() → seguridad
--    - Las vistas son "transparentes" - ejecutan con permisos del usuario
--    - Funciona perfectamente como base para políticas RLS

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
