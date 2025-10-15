-- ============================================================================
-- FIX SECURITY WARNINGS - FUNCIONES RESTANTES
-- ============================================================================
-- Fecha: 2025-10-07
-- Propósito: Corregir las 2 funciones con sobrecargas pendientes
-- ============================================================================

-- ============================================================================
-- FUNCIONES CON MÚLTIPLES SOBRECARGAS (mismo nombre, diferentes parámetros)
-- ============================================================================

-- 1. create_customer_dev - Buscar todas las sobrecargas
DO $$
DECLARE
    func_oid OID;
    func_signature TEXT;
    fixed_count INTEGER := 0;
BEGIN
    RAISE NOTICE '🔍 Buscando sobrecargas de create_customer_dev...';
    
    FOR func_oid IN 
        SELECT p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'create_customer_dev'
        AND NOT EXISTS (
            SELECT 1 
            FROM pg_proc p2
            WHERE p2.oid = p.oid
            AND p2.proconfig IS NOT NULL
            AND 'search_path' = ANY(
                SELECT split_part(unnest(p2.proconfig), '=', 1)
            )
        )
    LOOP
        -- Obtener firma completa de la función
        SELECT pg_get_function_identity_arguments(func_oid) INTO func_signature;
        
        BEGIN
            -- Configurar search_path
            EXECUTE format(
                'ALTER FUNCTION create_customer_dev(%s) SET search_path = public, pg_temp',
                func_signature
            );
            
            fixed_count := fixed_count + 1;
            RAISE NOTICE '  ✅ create_customer_dev(%)', func_signature;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '  ❌ Error en create_customer_dev(%): %', func_signature, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE '📊 create_customer_dev: % sobrecargas corregidas', fixed_count;
END $$;

-- 2. invite_user_to_company - Buscar todas las sobrecargas
DO $$
DECLARE
    func_oid OID;
    func_signature TEXT;
    fixed_count INTEGER := 0;
BEGIN
    RAISE NOTICE '🔍 Buscando sobrecargas de invite_user_to_company...';
    
    FOR func_oid IN 
        SELECT p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'invite_user_to_company'
        AND NOT EXISTS (
            SELECT 1 
            FROM pg_proc p2
            WHERE p2.oid = p.oid
            AND p2.proconfig IS NOT NULL
            AND 'search_path' = ANY(
                SELECT split_part(unnest(p2.proconfig), '=', 1)
            )
        )
    LOOP
        -- Obtener firma completa de la función
        SELECT pg_get_function_identity_arguments(func_oid) INTO func_signature;
        
        BEGIN
            -- Configurar search_path
            EXECUTE format(
                'ALTER FUNCTION invite_user_to_company(%s) SET search_path = public, pg_temp',
                func_signature
            );
            
            fixed_count := fixed_count + 1;
            RAISE NOTICE '  ✅ invite_user_to_company(%)', func_signature;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '  ❌ Error en invite_user_to_company(%): %', func_signature, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE '📊 invite_user_to_company: % sobrecargas corregidas', fixed_count;
END $$;

-- ============================================================================
-- VERIFICACIÓN FINAL COMPLETA
-- ============================================================================

-- Verificar que TODAS las funciones ahora tienen search_path
SELECT 
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
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
AND p.proname IN ('create_customer_dev', 'invite_user_to_company')
ORDER BY p.proname, arguments;

-- Resumen final
DO $$
DECLARE
    total_pending INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_pending
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
    )
    AND NOT EXISTS (
        SELECT 1 
        FROM pg_proc p2
        WHERE p2.oid = p.oid
        AND p2.proconfig IS NOT NULL
        AND 'search_path' = ANY(
            SELECT split_part(unnest(p2.proconfig), '=', 1)
        )
    );
    
    RAISE NOTICE '╔════════════════════════════════════════════════════╗';
    RAISE NOTICE '║     CORRECCIÓN FINAL - FUNCIONES RESTANTES         ║';
    RAISE NOTICE '╠════════════════════════════════════════════════════╣';
    
    IF total_pending = 0 THEN
        RAISE NOTICE '║ 🎉 TODAS LAS FUNCIONES CONFIGURADAS (67/67)       ║';
        RAISE NOTICE '║ ✅ function_search_path_mutable: 0 warnings       ║';
    ELSE
        RAISE NOTICE '║ ⚠️  Funciones pendientes: %                        ║', total_pending;
        RAISE NOTICE '║ 📋 Revisar manualmente las funciones arriba       ║';
    END IF;
    
    RAISE NOTICE '╚════════════════════════════════════════════════════╝';
END $$;

-- ============================================================================
-- RESULTADO ESPERADO
-- ============================================================================
-- Warnings de Seguridad: 4 → 0 ✅
-- - function_search_path_mutable: 67 → 0 ✅ (100% completado)
-- ============================================================================
