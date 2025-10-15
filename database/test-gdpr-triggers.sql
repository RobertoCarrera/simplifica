-- ============================================================================
-- SCRIPT DE PRUEBA PARA TRIGGERS GDPR
-- ============================================================================
-- Este script prueba que los triggers funcionan correctamente
-- Ejecutar en Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PREPARACIÓN: Obtener un cliente de prueba
-- ============================================================================

-- Obtener el primer cliente activo de tu empresa
SELECT 
    id as client_id,
    name,
    email,
    marketing_consent,
    data_processing_consent,
    access_count,
    last_accessed_at
FROM clients
WHERE is_active = true
LIMIT 1;

-- ⚠️ COPIA el client_id del resultado anterior y úsalo en las pruebas

-- ============================================================================
-- TEST 1: Probar trigger de UPDATE en clients
-- ============================================================================

-- Cambiar consentimiento de marketing (debe crear entrada en audit_log)
UPDATE clients
SET marketing_consent = NOT marketing_consent  -- Invierte el valor actual
WHERE id = 'PEGA_AQUI_EL_CLIENT_ID_DEL_SELECT_ANTERIOR'::uuid;

-- Verificar que se creó la entrada de auditoría
SELECT 
    '✅ TEST 1: Trigger de UPDATE en clients' as test,
    action_type,
    table_name,
    subject_email,
    purpose,
    old_values->>'marketing_consent' as consent_anterior,
    new_values->>'marketing_consent' as consent_nuevo,
    created_at
FROM gdpr_audit_log
WHERE table_name = 'clients'
AND record_id = 'PEGA_AQUI_EL_CLIENT_ID'::uuid
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- TEST 2: Probar función mark_client_accessed()
-- ============================================================================

-- Marcar cliente como accedido (simula que alguien vio sus datos)
SELECT mark_client_accessed('PEGA_AQUI_EL_CLIENT_ID'::uuid);

-- Verificar que se actualizó last_accessed_at y access_count
SELECT 
    '✅ TEST 2: Función mark_client_accessed()' as test,
    name,
    email,
    last_accessed_at,
    access_count,
    CASE 
        WHEN last_accessed_at > now() - interval '1 minute' THEN '✅ Actualizado'
        ELSE '❌ No actualizado'
    END as estado
FROM clients
WHERE id = 'PEGA_AQUI_EL_CLIENT_ID'::uuid;

-- Verificar entrada en audit_log (acción 'read')
SELECT 
    '✅ TEST 2b: Auditoría de lectura' as test,
    action_type,
    subject_email,
    purpose,
    created_at
FROM gdpr_audit_log
WHERE table_name = 'clients'
AND action_type = 'read'
AND record_id = 'PEGA_AQUI_EL_CLIENT_ID'::uuid
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- TEST 3: Probar update_client_consent()
-- ============================================================================

-- Actualizar consentimiento usando la función RPC
SELECT update_client_consent(
    p_client_id := 'PEGA_AQUI_EL_CLIENT_ID'::uuid,
    p_consent_type := 'marketing',
    p_consent_given := true,
    p_consent_method := 'explicit',
    p_purpose := 'Test de triggers GDPR',
    p_requesting_user_id := NULL  -- Usa el usuario actual
);

-- Verificar que se crearon DOS entradas:
-- 1. Del trigger de clients (UPDATE)
-- 2. Del trigger de gdpr_consent_records (INSERT)

SELECT 
    '✅ TEST 3: update_client_consent()' as test,
    COUNT(*) as entradas_creadas,
    string_agg(DISTINCT action_type, ', ') as tipos_accion,
    string_agg(DISTINCT table_name, ', ') as tablas_afectadas
FROM gdpr_audit_log
WHERE subject_email = (SELECT email FROM clients WHERE id = 'PEGA_AQUI_EL_CLIENT_ID'::uuid)
AND created_at > now() - interval '5 minutes'
GROUP BY subject_email;

-- Ver detalles de las entradas
SELECT 
    action_type,
    table_name,
    purpose,
    new_values,
    created_at
FROM gdpr_audit_log
WHERE subject_email = (SELECT email FROM clients WHERE id = 'PEGA_AQUI_EL_CLIENT_ID'::uuid)
AND created_at > now() - interval '5 minutes'
ORDER BY created_at DESC;

-- ============================================================================
-- TEST 4: Probar create_gdpr_access_request()
-- ============================================================================

-- Crear una solicitud de acceso GDPR
SELECT create_gdpr_access_request(
    p_subject_email := (SELECT email FROM clients WHERE id = 'PEGA_AQUI_EL_CLIENT_ID'::uuid),
    p_request_type := 'access',
    p_request_details := 'Solicitud de prueba para verificar triggers',
    p_requesting_user_id := NULL
);

-- Verificar que se creó entrada de auditoría
SELECT 
    '✅ TEST 4: create_gdpr_access_request()' as test,
    action_type,
    table_name,
    subject_email,
    new_values->>'request_type' as tipo_solicitud,
    new_values->>'processing_status' as estado,
    created_at
FROM gdpr_audit_log
WHERE table_name = 'gdpr_access_requests'
AND subject_email = (SELECT email FROM clients WHERE id = 'PEGA_AQUI_EL_CLIENT_ID'::uuid)
ORDER BY created_at DESC
LIMIT 1;

-- ============================================================================
-- TEST 5: Verificar que no hay loops infinitos
-- ============================================================================

-- Esta prueba verifica que los triggers no se llaman recursivamente
-- Si hay loops, verás múltiples entradas idénticas en menos de 1 segundo

SELECT 
    '✅ TEST 5: Verificación anti-loop' as test,
    subject_email,
    action_type,
    COUNT(*) as veces_registrado,
    array_agg(created_at ORDER BY created_at) as timestamps,
    CASE 
        WHEN COUNT(*) > 2 AND 
             MAX(created_at) - MIN(created_at) < interval '1 second' 
        THEN '⚠️ Posible loop detectado'
        ELSE '✅ Sin loops'
    END as estado
FROM gdpr_audit_log
WHERE created_at > now() - interval '10 minutes'
GROUP BY subject_email, action_type
HAVING COUNT(*) > 1
ORDER BY veces_registrado DESC;

-- ============================================================================
-- RESUMEN DE TODOS LOS TESTS
-- ============================================================================

SELECT 
    '📊 RESUMEN DE PRUEBAS GDPR' as titulo,
    COUNT(DISTINCT subject_email) as clientes_afectados,
    COUNT(DISTINCT action_type) as tipos_acciones,
    COUNT(*) as total_entradas_audit,
    MIN(created_at) as primera_entrada,
    MAX(created_at) as ultima_entrada
FROM gdpr_audit_log
WHERE created_at > now() - interval '10 minutes';

-- Ver últimas 10 entradas del audit log
SELECT 
    action_type,
    table_name,
    subject_email,
    purpose,
    created_at,
    CASE 
        WHEN created_at > now() - interval '1 minute' THEN '🆕 Reciente'
        WHEN created_at > now() - interval '5 minutes' THEN '⏰ Hace 5 min'
        ELSE '⏳ Antigua'
    END as antiguedad
FROM gdpr_audit_log
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- RESULTADO FINAL
-- ============================================================================

SELECT 
    '🎯 PRUEBAS COMPLETADAS' as resultado,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM gdpr_audit_log 
            WHERE created_at > now() - interval '10 minutes'
        ) THEN '✅ Triggers funcionando correctamente'
        ELSE '⚠️ No se detectaron entradas recientes'
    END as estado,
    'Revisa los resultados anteriores' as siguiente_paso;
