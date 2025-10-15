-- ============================================================================
-- FASE 1: AUDITORÍA GDPR - Estado Actual de la Base de Datos
-- ============================================================================
-- Este script verifica el estado actual de la implementación GDPR
-- y proporciona un informe completo de lo que hay y lo que falta
-- ============================================================================

-- 1. VERIFICAR TABLAS GDPR EXISTENTES
-- ============================================================================
SELECT 
    'TABLAS GDPR' as categoria,
    tablename,
    CASE 
        WHEN tablename IN (
            'gdpr_access_requests',
            'gdpr_audit_log',
            'gdpr_breach_incidents',
            'gdpr_consent_records',
            'gdpr_consent_requests',
            'gdpr_processing_activities'
        ) THEN '✅ Existe'
        ELSE '❌ No debería estar aquí'
    END as estado
FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'gdpr_%'
ORDER BY tablename;

-- 2. VERIFICAR CAMPOS GDPR EN TABLA CLIENTS
-- ============================================================================
SELECT 
    'CAMPOS GDPR EN CLIENTS' as categoria,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'clients'
AND column_name IN (
    -- Consentimientos
    'marketing_consent',
    'marketing_consent_date',
    'marketing_consent_method',
    'data_processing_consent',
    'data_processing_consent_date',
    'data_processing_legal_basis',
    -- Retención y eliminación
    'data_retention_until',
    'deletion_requested_at',
    'deletion_reason',
    'anonymized_at',
    -- Menores (NO APLICA - pero verificamos si existe)
    'is_minor',
    'parental_consent_verified',
    'parental_consent_date',
    -- Minimización y acceso
    'data_minimization_applied',
    'last_data_review_date',
    'access_restrictions',
    'last_accessed_at',
    'access_count',
    'is_active'
)
ORDER BY column_name;

-- 3. ANÁLISIS DE CLIENTES EXISTENTES
-- ============================================================================

-- 3.1. Resumen general
SELECT 
    'RESUMEN CLIENTES' as categoria,
    COUNT(*) as total_clientes,
    COUNT(*) FILTER (WHERE deleted_at IS NULL) as clientes_activos,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) as clientes_eliminados,
    COUNT(*) FILTER (WHERE anonymized_at IS NOT NULL) as clientes_anonimizados
FROM clients;

-- 3.2. Estado de consentimientos
SELECT 
    'ESTADO CONSENTIMIENTOS' as categoria,
    COUNT(*) as total_clientes,
    COUNT(*) FILTER (WHERE data_processing_consent = true) as con_consent_procesamiento,
    COUNT(*) FILTER (WHERE data_processing_consent IS NULL) as sin_consent_procesamiento,
    COUNT(*) FILTER (WHERE marketing_consent = true) as con_consent_marketing,
    COUNT(*) FILTER (WHERE marketing_consent = false OR marketing_consent IS NULL) as sin_consent_marketing,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE data_processing_consent = true) / NULLIF(COUNT(*), 0),
        2
    ) as porcentaje_compliance_basico
FROM clients
WHERE deleted_at IS NULL;

-- 3.3. Base legal de procesamiento
SELECT 
    'BASES LEGALES' as categoria,
    data_processing_legal_basis,
    COUNT(*) as total_clientes,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as porcentaje
FROM clients
WHERE deleted_at IS NULL
GROUP BY data_processing_legal_basis
ORDER BY total_clientes DESC;

-- 3.4. Clientes que necesitan migración
SELECT 
    'CLIENTES SIN GDPR' as categoria,
    COUNT(*) as total_sin_gdpr,
    (
        SELECT array_agg(id)
        FROM (
            SELECT id 
            FROM clients 
            WHERE deleted_at IS NULL
            AND (data_processing_consent IS NULL OR data_processing_legal_basis IS NULL)
            ORDER BY created_at
            LIMIT 5
        ) sub
    ) as primeros_5_ids
FROM clients
WHERE deleted_at IS NULL
AND (
    data_processing_consent IS NULL
    OR data_processing_legal_basis IS NULL
);

-- 4. VERIFICAR POLÍTICAS RLS DE TABLAS GDPR
-- ============================================================================
SELECT 
    'POLÍTICAS RLS GDPR' as categoria,
    tablename,
    COUNT(*) as total_policies,
    array_agg(policyname ORDER BY policyname) as policy_names
FROM pg_policies
WHERE tablename LIKE 'gdpr_%'
GROUP BY tablename
ORDER BY tablename;

-- 5. VERIFICAR FUNCIONES RPC GDPR
-- ============================================================================
SELECT 
    'FUNCIONES GDPR' as categoria,
    proname as function_name,
    pg_get_function_arguments(oid) as arguments,
    pg_get_function_result(oid) as return_type
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND (
    proname LIKE 'gdpr_%'
    OR proname LIKE '%_gdpr_%'
    OR proname IN (
        'anonymize_client_data',
        'export_client_gdpr_data',
        'create_gdpr_access_request',
        'process_gdpr_deletion_request'
    )
)
ORDER BY proname;

-- 6. VERIFICAR TRIGGERS DE AUDITORÍA
-- ============================================================================
SELECT 
    'TRIGGERS AUDITORÍA' as categoria,
    trigger_name,
    event_object_table as tabla,
    event_manipulation as evento,
    action_statement as accion
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND (
    trigger_name LIKE '%gdpr%'
    OR trigger_name LIKE '%audit%'
    OR trigger_name LIKE '%log%'
)
ORDER BY event_object_table, trigger_name;

-- 7. SOLICITUDES GDPR EXISTENTES
-- ============================================================================
SELECT 
    'SOLICITUDES GDPR' as categoria,
    request_type,
    processing_status,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as ultimos_30_dias
FROM gdpr_access_requests
GROUP BY request_type, processing_status
ORDER BY request_type, processing_status;

-- 8. REGISTROS DE CONSENTIMIENTO
-- ============================================================================
SELECT 
    'REGISTROS CONSENT' as categoria,
    purpose as proposito,
    consent_given,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '90 days') as ultimos_90_dias
FROM gdpr_consent_records
GROUP BY purpose, consent_given
ORDER BY purpose, consent_given;

-- 9. LOG DE AUDITORÍA RECIENTE
-- ============================================================================
SELECT 
    'ACTIVIDAD AUDITORÍA' as categoria,
    action_type,
    COUNT(*) as total_acciones,
    COUNT(DISTINCT user_id) as usuarios_distintos,
    MAX(created_at) as ultima_accion
FROM gdpr_audit_log
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY action_type
ORDER BY total_acciones DESC
LIMIT 10;

-- 10. VERIFICAR RLS HABILITADO
-- ============================================================================
SELECT 
    'RLS STATUS' as categoria,
    tablename,
    rowsecurity as rls_enabled,
    CASE 
        WHEN rowsecurity THEN '✅ RLS Habilitado'
        ELSE '❌ RLS Deshabilitado'
    END as estado
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('clients', 'gdpr_access_requests', 'gdpr_consent_records', 'gdpr_audit_log')
ORDER BY tablename;

-- ============================================================================
-- RESUMEN FINAL
-- ============================================================================
SELECT 
    'RESUMEN COMPLIANCE' as categoria,
    (
        SELECT COUNT(*) 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE 'gdpr_%'
    ) as tablas_gdpr_existentes,
    (
        SELECT COUNT(*) 
        FROM clients 
        WHERE deleted_at IS NULL 
        AND data_processing_consent = true
    ) as clientes_con_consent,
    (
        SELECT COUNT(*) 
        FROM clients 
        WHERE deleted_at IS NULL
    ) as total_clientes_activos,
    ROUND(
        100.0 * (
            SELECT COUNT(*) 
            FROM clients 
            WHERE deleted_at IS NULL 
            AND data_processing_consent = true
        ) / NULLIF(
            (SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL),
            0
        ),
        2
    ) as porcentaje_compliance;

-- ============================================================================
-- INSTRUCCIONES:
-- 1. Ejecuta este script completo
-- 2. Copia TODOS los resultados
-- 3. Analiza qué tablas/funciones faltan
-- 4. Identifica cuántos clientes necesitan migración
-- ============================================================================
