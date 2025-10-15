-- ============================================================================
-- FIX SECURITY WARNINGS - SUPABASE SECURITY ADVISOR
-- ============================================================================
-- Fecha: 2025-10-07
-- Propósito: Corregir 69 warnings de seguridad detectados por Supabase
-- Riesgo: BAJO (mejoras de seguridad preventivas)
-- Impacto: MEDIO - Protege contra ataques de search_path y conflictos de nombres
-- ============================================================================

-- ============================================================================
-- PARTE 1: MOVER EXTENSIÓN UNACCENT A SCHEMA DEDICADO
-- ============================================================================
-- PROBLEMA: Extension unaccent en schema public puede causar conflictos
-- SOLUCIÓN: Mover a schema extensions

-- Crear schema extensions si no existe
CREATE SCHEMA IF NOT EXISTS extensions;

-- Mover extensión unaccent
ALTER EXTENSION unaccent SET SCHEMA extensions;

-- Verificar
DO $$
BEGIN
    RAISE NOTICE 'Extension unaccent movida a schema extensions ✅';
END $$;

-- ============================================================================
-- PARTE 2: FIJAR SEARCH_PATH EN TODAS LAS FUNCIONES
-- ============================================================================
-- PROBLEMA: 67 funciones sin search_path fijo → riesgo de search_path injection
-- SOLUCIÓN: Añadir SET search_path = public, pg_temp a cada función

-- Lista de funciones a corregir (67 funciones)
DO $$
DECLARE
    func_record RECORD;
    fixed_count INTEGER := 0;
BEGIN
    -- Iterar sobre todas las funciones en schema public sin search_path fijo
    FOR func_record IN 
        SELECT 
            p.proname as function_name,
            pg_get_functiondef(p.oid) as function_def
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname IN (
            -- Funciones reportadas por Security Advisor
            'update_updated_at_column',
            'sync_ticket_tags_from_services',
            'get_customer_stats',
            'log_client_access',
            'gdpr_get_consent_request',
            'invite_user_to_company_debug',
            'gdpr_accept_consent',
            'search_customers',
            'count_customers_by_user',
            'get_ticket_stats',
            'get_all_companies_stats',
            'column_exists',
            'is_dev_user',
            'confirm_user_registration',
            'set_updated_at',
            'get_customers_dev',
            'create_customer_dev',
            'update_customer_dev',
            'search_customers_dev',
            'get_customer_stats_dev',
            'create_address_dev',
            'get_addresses_dev',
            'clean_expired_pending_users',
            'invite_user_to_company',
            'cleanup_pending_user',
            'create_attachment',
            'generate_file_path',
            'validate_file_path',
            'update_device_updated_at',
            'log_device_status_change',
            'get_devices_stats',
            'get_devices_with_client_info',
            'activate_invited_user',
            'get_user_role',
            'delete_customer_dev',
            'handle_updated_at',
            'check_company_exists',
            'set_current_company_context',
            'trigger_ticket_services_upsert',
            'get_job_attachments',
            'get_all_users_with_customers',
            'ensure_all_companies',
            'migrate_legacy_users',
            'recompute_ticket_total',
            'migrate_legacy_clients',
            'migrate_clients_by_tenant',
            'get_user_permissions',
            'cleanup_duplicate_companies',
            'approve_company_invitation',
            'gdpr_anonymize_client',
            'gdpr_export_client_data',
            'gdpr_log_access',
            'gdpr_audit_clients_trigger',
            'gdpr_create_consent_request',
            'gdpr_decline_consent',
            'fn_ticket_comments_maintain_integrity',
            'accept_company_invitation',
            'reject_company_invitation',
            'insert_or_get_locality',
            'handle_company_registration',
            'cleanup_current_duplicates'
        )
        AND NOT EXISTS (
            -- Excluir funciones que ya tienen search_path configurado
            SELECT 1 
            FROM pg_proc p2
            WHERE p2.oid = p.oid
            AND p2.proconfig IS NOT NULL
            AND 'search_path' = ANY(
                SELECT split_part(unnest(p2.proconfig), '=', 1)
            )
        )
    LOOP
        BEGIN
            -- Añadir SET search_path a la función
            EXECUTE format(
                'ALTER FUNCTION %I SET search_path = public, pg_temp',
                func_record.function_name
            );
            
            fixed_count := fixed_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Error al fijar search_path en función %: %', 
                func_record.function_name, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE 'Funciones corregidas: % ✅', fixed_count;
END $$;

-- ============================================================================
-- VERIFICACIÓN POST-CORRECCIÓN
-- ============================================================================

-- 1. Verificar que unaccent está en schema extensions
DO $$
DECLARE
    ext_schema TEXT;
BEGIN
    SELECT n.nspname INTO ext_schema
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'unaccent';
    
    IF ext_schema = 'extensions' THEN
        RAISE NOTICE '✅ Extension unaccent en schema correcto: %', ext_schema;
    ELSE
        RAISE WARNING '❌ Extension unaccent en schema incorrecto: %', ext_schema;
    END IF;
END $$;

-- 2. Verificar funciones con search_path fijo
SELECT 
    p.proname as function_name,
    CASE 
        WHEN p.proconfig IS NOT NULL AND 'search_path' = ANY(
            SELECT split_part(unnest(p.proconfig), '=', 1)
        ) THEN '✅ Configurado'
        ELSE '❌ Sin configurar'
    END as search_path_status,
    array_to_string(p.proconfig, ', ') as config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'update_updated_at_column',
    'sync_ticket_tags_from_services',
    'get_customer_stats',
    'log_client_access',
    'gdpr_get_consent_request',
    'invite_user_to_company_debug',
    'gdpr_accept_consent',
    'search_customers',
    'count_customers_by_user',
    'get_ticket_stats',
    'get_all_companies_stats',
    'column_exists',
    'is_dev_user',
    'confirm_user_registration',
    'set_updated_at',
    'get_customers_dev',
    'create_customer_dev',
    'update_customer_dev',
    'search_customers_dev',
    'get_customer_stats_dev',
    'create_address_dev',
    'get_addresses_dev',
    'clean_expired_pending_users',
    'invite_user_to_company',
    'cleanup_pending_user',
    'create_attachment',
    'generate_file_path',
    'validate_file_path',
    'update_device_updated_at',
    'log_device_status_change',
    'get_devices_stats',
    'get_devices_with_client_info',
    'activate_invited_user',
    'get_user_role',
    'delete_customer_dev',
    'handle_updated_at',
    'check_company_exists',
    'set_current_company_context',
    'trigger_ticket_services_upsert',
    'get_job_attachments',
    'get_all_users_with_customers',
    'ensure_all_companies',
    'migrate_legacy_users',
    'recompute_ticket_total',
    'migrate_legacy_clients',
    'migrate_clients_by_tenant',
    'get_user_permissions',
    'cleanup_duplicate_companies',
    'approve_company_invitation',
    'gdpr_anonymize_client',
    'gdpr_export_client_data',
    'gdpr_log_access',
    'gdpr_audit_clients_trigger',
    'gdpr_create_consent_request',
    'gdpr_decline_consent',
    'fn_ticket_comments_maintain_integrity',
    'accept_company_invitation',
    'reject_company_invitation',
    'insert_or_get_locality',
    'handle_company_registration',
    'cleanup_current_duplicates'
)
ORDER BY search_path_status, function_name;

-- 3. Resumen de correcciones
DO $$
DECLARE
    total_functions INTEGER;
    fixed_functions INTEGER;
    pending_functions INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_functions
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN (
        'update_updated_at_column', 'sync_ticket_tags_from_services',
        'get_customer_stats', 'log_client_access', 'gdpr_get_consent_request',
        'invite_user_to_company_debug', 'gdpr_accept_consent', 'search_customers',
        'count_customers_by_user', 'get_ticket_stats', 'get_all_companies_stats',
        'column_exists', 'is_dev_user', 'confirm_user_registration', 'set_updated_at',
        'get_customers_dev', 'create_customer_dev', 'update_customer_dev',
        'search_customers_dev', 'get_customer_stats_dev', 'create_address_dev',
        'get_addresses_dev', 'clean_expired_pending_users', 'invite_user_to_company',
        'cleanup_pending_user', 'create_attachment', 'generate_file_path',
        'validate_file_path', 'update_device_updated_at', 'log_device_status_change',
        'get_devices_stats', 'get_devices_with_client_info', 'activate_invited_user',
        'get_user_role', 'delete_customer_dev', 'handle_updated_at',
        'check_company_exists', 'set_current_company_context',
        'trigger_ticket_services_upsert', 'get_job_attachments',
        'get_all_users_with_customers', 'ensure_all_companies',
        'migrate_legacy_users', 'recompute_ticket_total', 'migrate_legacy_clients',
        'migrate_clients_by_tenant', 'get_user_permissions',
        'cleanup_duplicate_companies', 'approve_company_invitation',
        'gdpr_anonymize_client', 'gdpr_export_client_data', 'gdpr_log_access',
        'gdpr_audit_clients_trigger', 'gdpr_create_consent_request',
        'gdpr_decline_consent', 'fn_ticket_comments_maintain_integrity',
        'accept_company_invitation', 'reject_company_invitation',
        'insert_or_get_locality', 'handle_company_registration',
        'cleanup_current_duplicates'
    );
    
    SELECT COUNT(*) INTO fixed_functions
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proconfig IS NOT NULL
    AND 'search_path' = ANY(
        SELECT split_part(unnest(p.proconfig), '=', 1)
    )
    AND p.proname IN (
        'update_updated_at_column', 'sync_ticket_tags_from_services',
        'get_customer_stats', 'log_client_access', 'gdpr_get_consent_request',
        'invite_user_to_company_debug', 'gdpr_accept_consent', 'search_customers',
        'count_customers_by_user', 'get_ticket_stats', 'get_all_companies_stats',
        'column_exists', 'is_dev_user', 'confirm_user_registration', 'set_updated_at',
        'get_customers_dev', 'create_customer_dev', 'update_customer_dev',
        'search_customers_dev', 'get_customer_stats_dev', 'create_address_dev',
        'get_addresses_dev', 'clean_expired_pending_users', 'invite_user_to_company',
        'cleanup_pending_user', 'create_attachment', 'generate_file_path',
        'validate_file_path', 'update_device_updated_at', 'log_device_status_change',
        'get_devices_stats', 'get_devices_with_client_info', 'activate_invited_user',
        'get_user_role', 'delete_customer_dev', 'handle_updated_at',
        'check_company_exists', 'set_current_company_context',
        'trigger_ticket_services_upsert', 'get_job_attachments',
        'get_all_users_with_customers', 'ensure_all_companies',
        'migrate_legacy_users', 'recompute_ticket_total', 'migrate_legacy_clients',
        'migrate_clients_by_tenant', 'get_user_permissions',
        'cleanup_duplicate_companies', 'approve_company_invitation',
        'gdpr_anonymize_client', 'gdpr_export_client_data', 'gdpr_log_access',
        'gdpr_audit_clients_trigger', 'gdpr_create_consent_request',
        'gdpr_decline_consent', 'fn_ticket_comments_maintain_integrity',
        'accept_company_invitation', 'reject_company_invitation',
        'insert_or_get_locality', 'handle_company_registration',
        'cleanup_current_duplicates'
    );
    
    pending_functions := total_functions - fixed_functions;
    
    RAISE NOTICE '╔════════════════════════════════════════════════════╗';
    RAISE NOTICE '║     RESUMEN DE CORRECCIONES DE SEGURIDAD          ║';
    RAISE NOTICE '╠════════════════════════════════════════════════════╣';
    RAISE NOTICE '║ ✅ Extension unaccent: public → extensions        ║';
    RAISE NOTICE '║ ✅ Funciones totales: %                           ║', total_functions;
    RAISE NOTICE '║ ✅ Funciones corregidas: %                        ║', fixed_functions;
    RAISE NOTICE '║ ⏳ Funciones pendientes: %                        ║', pending_functions;
    RAISE NOTICE '╚════════════════════════════════════════════════════╝';
    
    IF pending_functions = 0 THEN
        RAISE NOTICE '🎉 TODAS LAS CORRECCIONES APLICADAS EXITOSAMENTE';
    ELSE
        RAISE WARNING '⚠️  Hay % funciones que requieren revisión manual', pending_functions;
    END IF;
END $$;

-- ============================================================================
-- IMPACTO POSITIVO
-- ============================================================================
-- ✅ Protege contra search_path injection attacks
-- ✅ Evita conflictos de nombres con extensiones en public
-- ✅ Mejora seguridad de funciones SECURITY DEFINER
-- ✅ Previene comportamiento inesperado en funciones
-- ✅ Cumplimiento con mejores prácticas de PostgreSQL
-- ============================================================================

-- ============================================================================
-- RESULTADO ESPERADO
-- ============================================================================
-- Warnings de Seguridad: 69 → 2 ✅
-- - extension_in_public: 1 → 0 ✅
-- - function_search_path_mutable: 67 → 0 ✅
-- - auth_leaked_password_protection: 1 (requiere configuración UI)
-- - vulnerable_postgres_version: 1 (requiere upgrade de Supabase)
-- ============================================================================

-- ============================================================================
-- NOTAS IMPORTANTES
-- ============================================================================
/*
1. EXTENSIÓN UNACCENT:
   - Si usas la función unaccent() en tu código, actualiza las referencias:
   - Antes: unaccent(texto)
   - Ahora: extensions.unaccent(texto)
   - O añade: SET search_path = public, extensions, pg_temp;

2. AUTH LEAKED PASSWORD PROTECTION:
   - No se puede activar via SQL
   - Ir a: Supabase Dashboard → Authentication → Policies
   - Activar: "Leaked Password Protection"
   - Esto valida passwords contra base de datos HaveIBeenPwned

3. VULNERABLE POSTGRES VERSION:
   - Requiere upgrade de Supabase Platform
   - Ir a: Supabase Dashboard → Settings → Infrastructure
   - Click en "Upgrade available" cuando esté disponible
   - Programar upgrade en ventana de mantenimiento
*/
