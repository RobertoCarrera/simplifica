-- ================================================================
-- DIAGNÓSTICO: TABLAS CON/SIN company_id
-- ================================================================
-- Este script identifica qué tablas tienen la columna company_id
-- Ejecuta esto ANTES de ENABLE_RLS_ALL_TABLES.sql para diagnosticar
-- ================================================================

-- 1. Listar TODAS las tablas en public schema
SELECT 
    '📋 TODAS LAS TABLAS' AS seccion,
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_name NOT LIKE 'pg_%'
    AND table_name NOT LIKE 'sql_%'
ORDER BY table_type, table_name;

-- 2. Listar tablas CON columna company_id
SELECT 
    '✅ TABLAS CON company_id' AS seccion,
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
    AND column_name = 'company_id'
ORDER BY table_name;

-- 3. Listar tablas SIN columna company_id (pero que existen)
SELECT 
    '❌ TABLAS SIN company_id' AS seccion,
    t.table_name,
    t.table_type,
    CASE 
        WHEN t.table_name IN ('addresses', 'localities', 'pending_users') THEN '✓ OK - No necesita company_id'
        WHEN t.table_type = 'VIEW' THEN '✓ OK - Es vista'
        ELSE '⚠️  REVISAR'
    END AS estado
FROM information_schema.tables t
WHERE t.table_schema = 'public'
    AND t.table_name NOT LIKE 'pg_%'
    AND t.table_name NOT LIKE 'sql_%'
    AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
        AND c.table_name = t.table_name
        AND c.column_name = 'company_id'
    )
ORDER BY estado, t.table_name;

-- 4. Verificar tablas específicas mencionadas en el script RLS
WITH tablas_rls AS (
    SELECT unnest(ARRAY[
        'users', 'companies', 'clients', 'services', 'tickets', 'attachments',
        'gdpr_access_requests', 'gdpr_audit_log', 'gdpr_breach_incidents',
        'gdpr_consent_records', 'gdpr_consent_requests', 'gdpr_processing_activities',
        'service_categories', 'service_tags', 'service_tag_relations', 'service_units',
        'ticket_comments', 'ticket_comment_attachments', 'ticket_devices', 'ticket_services',
        'ticket_stages', 'ticket_tags', 'ticket_tag_relations',
        'products', 'device_components', 'device_media', 'device_status_history', 'devices',
        'user_company_context', 'admin_company_analysis', 'admin_company_invitations', 'admin_pending_users',
        'localities', 'addresses', 'invitations', 'pending_users', 'job_notes', 'company_invitations'
    ]) AS tabla_esperada
)
SELECT 
    '🔍 VERIFICACIÓN TABLAS RLS' AS seccion,
    r.tabla_esperada,
    CASE 
        WHEN t.table_name IS NULL THEN '❌ NO EXISTE'
        WHEN t.table_type = 'VIEW' THEN '📊 VISTA'
        WHEN c.column_name IS NOT NULL THEN '✅ EXISTE + company_id'
        ELSE '⚠️  EXISTE SIN company_id'
    END AS estado,
    t.table_type
FROM tablas_rls r
LEFT JOIN information_schema.tables t 
    ON t.table_schema = 'public' AND t.table_name = r.tabla_esperada
LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = r.tabla_esperada AND c.column_name = 'company_id'
ORDER BY estado, r.tabla_esperada;

-- 5. Verificar función get_user_company_id()
SELECT 
    '🔧 FUNCIÓN HELPER' AS seccion,
    routine_name,
    routine_type,
    data_type AS return_type,
    security_type,
    CASE 
        WHEN routine_definition LIKE '%company_id%' THEN '✅ Accede a company_id'
        ELSE '❌ NO accede a company_id'
    END AS validacion
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'get_user_company_id';

-- 6. Resumen final
SELECT 
    '📊 RESUMEN' AS seccion,
    COUNT(*) FILTER (WHERE table_type = 'BASE TABLE') AS total_tablas,
    COUNT(*) FILTER (WHERE table_type = 'VIEW') AS total_vistas,
    COUNT(*) FILTER (WHERE column_name = 'company_id') AS tablas_con_company_id,
    COUNT(*) FILTER (WHERE column_name IS NULL AND table_type = 'BASE TABLE') AS tablas_sin_company_id
FROM information_schema.tables t
LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'company_id'
WHERE t.table_schema = 'public'
    AND t.table_name NOT LIKE 'pg_%'
    AND t.table_name NOT LIKE 'sql_%';
