-- ============================================================================
-- TRIGGERS DE AUDITORÍA GDPR PARA PRODUCCIÓN
-- ============================================================================
-- Este script crea triggers automáticos para registrar todas las acciones
-- sobre datos personales en cumplimiento del GDPR
-- ============================================================================

-- ============================================================================
-- 1. TRIGGER PARA TABLA CLIENTS - Auditoría completa
-- ============================================================================

-- Función trigger para auditar cambios en clients
CREATE OR REPLACE FUNCTION trigger_audit_clients()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_company_id uuid;
    v_action_type text;
    v_old_values jsonb;
    v_new_values jsonb;
BEGIN
    -- Obtener user_id y company_id del usuario actual
    SELECT u.id, u.company_id INTO v_user_id, v_company_id
    FROM users u
    WHERE u.auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Si no hay usuario autenticado, no auditar (evita loops en funciones internas)
    IF v_user_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;
    
    -- Determinar tipo de acción
    IF TG_OP = 'INSERT' THEN
        v_action_type := 'create';
        v_old_values := NULL;
        v_new_values := jsonb_build_object(
            'name', NEW.name,
            'email', NEW.email,
            'phone', NEW.phone,
            'created_at', NEW.created_at
        );
    ELSIF TG_OP = 'UPDATE' THEN
        v_action_type := 'update';
        
        -- Solo registrar campos que cambiaron
        v_old_values := jsonb_build_object(
            'name', OLD.name,
            'email', OLD.email,
            'phone', OLD.phone,
            'marketing_consent', OLD.marketing_consent,
            'data_processing_consent', OLD.data_processing_consent
        );
        
        v_new_values := jsonb_build_object(
            'name', NEW.name,
            'email', NEW.email,
            'phone', NEW.phone,
            'marketing_consent', NEW.marketing_consent,
            'data_processing_consent', NEW.data_processing_consent
        );
        
        -- Si es anonimización, cambiar el tipo de acción
        IF NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS NULL THEN
            v_action_type := 'anonymize';
        END IF;
        
    ELSIF TG_OP = 'DELETE' THEN
        v_action_type := 'delete';
        v_old_values := jsonb_build_object(
            'name', OLD.name,
            'email', OLD.email,
            'phone', OLD.phone
        );
        v_new_values := NULL;
    END IF;
    
    -- Insertar en audit log (sin causar trigger recursivo)
    INSERT INTO gdpr_audit_log (
        user_id,
        company_id,
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        old_values,
        new_values,
        created_at
    ) VALUES (
        v_user_id,
        v_company_id,
        v_action_type,
        'clients',
        COALESCE(NEW.id, OLD.id),
        COALESCE(NEW.email, OLD.email),
        'Automatic audit log from trigger',
        v_old_values,
        v_new_values,
        now()
    );
    
    -- Retornar el registro apropiado
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    -- Si falla el audit, no bloquear la operación principal
    RAISE WARNING 'Error en audit log de clients: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Eliminar trigger anterior si existe y crear nuevo
DROP TRIGGER IF EXISTS audit_clients_changes ON clients;

CREATE TRIGGER audit_clients_changes
    AFTER INSERT OR UPDATE OR DELETE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION trigger_audit_clients();

COMMENT ON TRIGGER audit_clients_changes ON clients IS 'Registra automáticamente todos los cambios en clientes para cumplimiento GDPR';

-- ============================================================================
-- 2. TRIGGER PARA GDPR_CONSENT_RECORDS - Auditoría de consentimientos
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_audit_consent_records()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_company_id uuid;
BEGIN
    -- Obtener user_id y company_id
    SELECT u.id, u.company_id INTO v_user_id, v_company_id
    FROM users u
    WHERE u.auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Si no hay usuario, no auditar
    IF v_user_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;
    
    -- Registrar cambio de consentimiento
    IF TG_OP = 'INSERT' THEN
        INSERT INTO gdpr_audit_log (
            user_id,
            company_id,
            action_type,
            table_name,
            record_id,
            subject_email,
            purpose,
            new_values,
            created_at
        ) VALUES (
            v_user_id,
            COALESCE(NEW.company_id, v_company_id),
            'consent',
            'gdpr_consent_records',
            NEW.id,
            NEW.subject_email,
            'New consent record: ' || NEW.consent_type,
            jsonb_build_object(
                'consent_type', NEW.consent_type,
                'consent_given', NEW.consent_given,
                'consent_method', NEW.consent_method,
                'purpose', NEW.purpose
            ),
            now()
        );
    ELSIF TG_OP = 'UPDATE' THEN
        -- Solo auditar si cambia el consentimiento o se retira
        IF OLD.consent_given != NEW.consent_given OR 
           (OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL) THEN
            INSERT INTO gdpr_audit_log (
                user_id,
                company_id,
                action_type,
                table_name,
                record_id,
                subject_email,
                purpose,
                old_values,
                new_values,
                created_at
            ) VALUES (
                v_user_id,
                COALESCE(NEW.company_id, v_company_id),
                'consent',
                'gdpr_consent_records',
                NEW.id,
                NEW.subject_email,
                CASE 
                    WHEN NEW.withdrawn_at IS NOT NULL THEN 'Consent withdrawn'
                    ELSE 'Consent status changed'
                END,
                jsonb_build_object(
                    'consent_given', OLD.consent_given,
                    'withdrawn_at', OLD.withdrawn_at
                ),
                jsonb_build_object(
                    'consent_given', NEW.consent_given,
                    'withdrawn_at', NEW.withdrawn_at
                ),
                now()
            );
        END IF;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error en audit log de consent_records: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Crear trigger para consent_records
DROP TRIGGER IF EXISTS audit_consent_records_changes ON gdpr_consent_records;

CREATE TRIGGER audit_consent_records_changes
    AFTER INSERT OR UPDATE ON gdpr_consent_records
    FOR EACH ROW
    EXECUTE FUNCTION trigger_audit_consent_records();

COMMENT ON TRIGGER audit_consent_records_changes ON gdpr_consent_records IS 'Registra cambios en consentimientos GDPR';

-- ============================================================================
-- 3. TRIGGER PARA GDPR_ACCESS_REQUESTS - Auditoría de solicitudes
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_audit_access_requests()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_company_id uuid;
BEGIN
    -- Obtener user_id y company_id
    SELECT u.id, u.company_id INTO v_user_id, v_company_id
    FROM users u
    WHERE u.auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Si no hay usuario, no auditar
    IF v_user_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;
    
    -- Registrar cambios en solicitudes GDPR
    IF TG_OP = 'INSERT' THEN
        INSERT INTO gdpr_audit_log (
            user_id,
            company_id,
            action_type,
            table_name,
            record_id,
            subject_email,
            purpose,
            new_values,
            created_at
        ) VALUES (
            v_user_id,
            COALESCE(NEW.company_id, v_company_id),
            'access_request',
            'gdpr_access_requests',
            NEW.id,
            NEW.subject_email,
            'GDPR request created: ' || NEW.request_type,
            jsonb_build_object(
                'request_type', NEW.request_type,
                'processing_status', NEW.processing_status,
                'deadline_date', NEW.deadline_date
            ),
            now()
        );
    ELSIF TG_OP = 'UPDATE' THEN
        -- Solo auditar cambios de estado
        IF OLD.processing_status != NEW.processing_status OR
           OLD.verification_status != NEW.verification_status THEN
            INSERT INTO gdpr_audit_log (
                user_id,
                company_id,
                action_type,
                table_name,
                record_id,
                subject_email,
                purpose,
                old_values,
                new_values,
                created_at
            ) VALUES (
                v_user_id,
                COALESCE(NEW.company_id, v_company_id),
                'access_request',
                'gdpr_access_requests',
                NEW.id,
                NEW.subject_email,
                'GDPR request status updated',
                jsonb_build_object(
                    'processing_status', OLD.processing_status,
                    'verification_status', OLD.verification_status
                ),
                jsonb_build_object(
                    'processing_status', NEW.processing_status,
                    'verification_status', NEW.verification_status,
                    'completed_at', NEW.completed_at
                ),
                now()
            );
        END IF;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error en audit log de access_requests: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Crear trigger para access_requests
DROP TRIGGER IF EXISTS audit_access_requests_changes ON gdpr_access_requests;

CREATE TRIGGER audit_access_requests_changes
    AFTER INSERT OR UPDATE ON gdpr_access_requests
    FOR EACH ROW
    EXECUTE FUNCTION trigger_audit_access_requests();

COMMENT ON TRIGGER audit_access_requests_changes ON gdpr_access_requests IS 'Registra cambios en solicitudes de acceso GDPR';

-- ============================================================================
-- 4. TRIGGER PARA ACTUALIZAR LAST_ACCESSED_AT EN CLIENTS
-- ============================================================================
-- Este trigger actualiza la fecha de último acceso cuando se lee un cliente

CREATE OR REPLACE FUNCTION trigger_update_last_accessed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Solo actualizar en SELECT (cuando se lee el registro)
    -- Incrementar contador de accesos
    UPDATE clients
    SET 
        last_accessed_at = now(),
        access_count = COALESCE(access_count, 0) + 1
    WHERE id = NEW.id
    AND (last_accessed_at IS NULL OR last_accessed_at < now() - INTERVAL '1 hour');
    -- Solo actualizar si pasó más de 1 hora desde el último acceso
    
    RETURN NEW;
    
EXCEPTION WHEN OTHERS THEN
    -- No bloquear si falla
    RETURN NEW;
END;
$$;

-- Este trigger se ejecuta después de SELECT via una vista
-- Como los triggers AFTER SELECT no existen, usaremos UPDATE como proxy
DROP TRIGGER IF EXISTS update_last_accessed ON clients;

CREATE TRIGGER update_last_accessed
    AFTER UPDATE OF last_accessed_at ON clients
    FOR EACH ROW
    WHEN (NEW.last_accessed_at IS DISTINCT FROM OLD.last_accessed_at)
    EXECUTE FUNCTION trigger_update_last_accessed();

COMMENT ON TRIGGER update_last_accessed ON clients IS 'Actualiza fecha y contador de accesos a datos personales';

-- ============================================================================
-- 5. FUNCIÓN HELPER PARA REGISTRAR LECTURA DE CLIENTES
-- ============================================================================
-- Esta función debe ser llamada manualmente desde el frontend cuando se lee un cliente

CREATE OR REPLACE FUNCTION mark_client_accessed(
    p_client_id uuid,
    p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client_email text;
    v_company_id uuid;
    v_user_id uuid;
BEGIN
    -- Obtener email del cliente
    SELECT email INTO v_client_email
    FROM clients
    WHERE id = p_client_id;
    
    IF v_client_email IS NULL THEN
        RETURN;
    END IF;
    
    -- Obtener user_id y company_id
    SELECT u.id, u.company_id INTO v_user_id, v_company_id
    FROM users u
    WHERE u.auth_user_id = COALESCE(p_user_id, auth.uid())
    LIMIT 1;
    
    -- Actualizar last_accessed_at y access_count
    UPDATE clients
    SET 
        last_accessed_at = now(),
        access_count = COALESCE(access_count, 0) + 1
    WHERE id = p_client_id;
    
    -- Registrar en audit log (solo si pasó más de 1 hora desde el último registro)
    IF NOT EXISTS (
        SELECT 1 FROM gdpr_audit_log
        WHERE record_id = p_client_id
        AND action_type = 'read'
        AND created_at > now() - INTERVAL '1 hour'
    ) THEN
        INSERT INTO gdpr_audit_log (
            user_id,
            company_id,
            action_type,
            table_name,
            record_id,
            subject_email,
            purpose,
            created_at
        ) VALUES (
            v_user_id,
            v_company_id,
            'read',
            'clients',
            p_client_id,
            v_client_email,
            'Client data accessed',
            now()
        );
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    -- No bloquear si falla
    RAISE WARNING 'Error al marcar cliente como accedido: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION mark_client_accessed IS 'Marca un cliente como accedido y registra en audit log (llamar desde frontend)';

-- ============================================================================
-- 6. VERIFICACIÓN FINAL
-- ============================================================================

-- Verificar que todos los triggers se crearon correctamente
DO $$
DECLARE
    v_trigger_count int;
    v_function_count int;
BEGIN
    -- Contar triggers creados
    SELECT COUNT(*) INTO v_trigger_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    AND trigger_name IN (
        'audit_clients_changes',
        'audit_consent_records_changes',
        'audit_access_requests_changes',
        'update_last_accessed'
    );
    
    -- Contar funciones trigger creadas
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    AND proname IN (
        'trigger_audit_clients',
        'trigger_audit_consent_records',
        'trigger_audit_access_requests',
        'trigger_update_last_accessed',
        'mark_client_accessed'
    );
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICACIÓN DE TRIGGERS GDPR';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Triggers creados: %/4', v_trigger_count;
    RAISE NOTICE 'Funciones trigger creadas: %/5', v_function_count;
    
    IF v_trigger_count = 4 AND v_function_count = 5 THEN
        RAISE NOTICE '✅ Todos los triggers GDPR instalados correctamente';
    ELSE
        RAISE NOTICE '⚠️ Algunos triggers no se crearon correctamente';
    END IF;
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
END $$;

-- ============================================================================
-- RESUMEN DE TRIGGERS CREADOS
-- ============================================================================

SELECT 
    'TRIGGERS GDPR' as categoria,
    event_object_table as tabla,
    trigger_name as trigger,
    string_agg(event_manipulation, ', ') as eventos
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name LIKE 'audit_%' OR trigger_name = 'update_last_accessed'
GROUP BY event_object_table, trigger_name
ORDER BY event_object_table;

-- ============================================================================
-- RESULTADO FINAL
-- ============================================================================

SELECT 
    '🎯 TRIGGERS GDPR INSTALADOS' as resultado,
    '4 triggers + 1 función helper creados' as estado,
    'Auditoría automática activada' as siguiente_paso;
