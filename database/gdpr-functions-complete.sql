-- ============================================================================
-- FUNCIONES GDPR FALTANTES PARA PRODUCCIÓN
-- ============================================================================
-- Este script crea las 7 funciones GDPR necesarias para el frontend
-- Basado en el esquema REAL de la base de datos para evitar errores
-- ============================================================================

-- ============================================================================
-- 1. EXPORT_CLIENT_GDPR_DATA - Exportar todos los datos de un cliente
-- ============================================================================
-- Art. 20 GDPR - Derecho a la Portabilidad de los Datos

CREATE OR REPLACE FUNCTION export_client_gdpr_data(
    p_client_id uuid,
    p_requesting_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client record;
    v_company_id uuid;
    v_result jsonb;
    v_services jsonb;
    v_tickets jsonb;
    v_devices jsonb;
    v_consent_records jsonb;
    v_access_requests jsonb;
BEGIN
    -- Verificar que el usuario tenga acceso
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_requesting_user_id, auth.uid());
    
    -- Obtener datos del cliente
    SELECT * INTO v_client
    FROM clients
    WHERE id = p_client_id
    AND company_id = v_company_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cliente no encontrado o sin acceso'
        );
    END IF;
    
    -- Obtener servicios relacionados
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'description', s.description,
        'price', s.price,
        'created_at', s.created_at
    )), '[]'::jsonb) INTO v_services
    FROM services s
    WHERE s.id = ANY(
        SELECT jsonb_array_elements_text(v_client.metadata->'services')::uuid
    );
    
    -- Obtener tickets relacionados
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'description', t.description,
        'status', t.status,
        'priority', t.priority,
        'created_at', t.created_at,
        'updated_at', t.updated_at
    )), '[]'::jsonb) INTO v_tickets
    FROM tickets t
    WHERE t.client_id = p_client_id;
    
    -- Obtener dispositivos relacionados
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id,
        'brand', d.brand,
        'model', d.model,
        'device_type', d.device_type,
        'serial_number', d.serial_number,
        'status', d.status,
        'created_at', d.created_at
    )), '[]'::jsonb) INTO v_devices
    FROM devices d
    WHERE d.client_id = p_client_id;
    
    -- Obtener registros de consentimiento
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'consent_type', cr.consent_type,
        'purpose', cr.purpose,
        'consent_given', cr.consent_given,
        'consent_method', cr.consent_method,
        'created_at', cr.created_at,
        'withdrawn_at', cr.withdrawn_at,
        'is_active', cr.is_active
    )), '[]'::jsonb) INTO v_consent_records
    FROM gdpr_consent_records cr
    WHERE cr.subject_email = v_client.email;
    
    -- Obtener solicitudes de acceso GDPR
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'request_type', ar.request_type,
        'processing_status', ar.processing_status,
        'created_at', ar.created_at,
        'completed_at', ar.completed_at
    )), '[]'::jsonb) INTO v_access_requests
    FROM gdpr_access_requests ar
    WHERE ar.subject_email = v_client.email;
    
    -- Construir resultado completo
    v_result := jsonb_build_object(
        'export_info', jsonb_build_object(
            'exported_at', now(),
            'exported_by', COALESCE(p_requesting_user_id, auth.uid()),
            'export_format', 'JSON',
            'gdpr_article', 'Article 20 - Right to Data Portability'
        ),
        'personal_data', jsonb_build_object(
            'id', v_client.id,
            'name', v_client.name,
            'email', v_client.email,
            'phone', v_client.phone,
            'address', v_client.address,
            'apellidos', v_client.apellidos,
            'dni', v_client.dni,
            'created_at', v_client.created_at,
            'updated_at', v_client.updated_at
        ),
        'consent_information', jsonb_build_object(
            'marketing_consent', v_client.marketing_consent,
            'marketing_consent_date', v_client.marketing_consent_date,
            'data_processing_consent', v_client.data_processing_consent,
            'data_processing_consent_date', v_client.data_processing_consent_date,
            'data_processing_legal_basis', v_client.data_processing_legal_basis
        ),
        'data_retention', jsonb_build_object(
            'retention_until', v_client.data_retention_until,
            'is_active', v_client.is_active
        ),
        'related_data', jsonb_build_object(
            'services', v_services,
            'tickets', v_tickets,
            'devices', v_devices
        ),
        'gdpr_records', jsonb_build_object(
            'consent_records', v_consent_records,
            'access_requests', v_access_requests
        ),
        'metadata', v_client.metadata
    );
    
    -- Registrar en audit log
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
        COALESCE(p_requesting_user_id, auth.uid()),
        v_company_id,
        'export',
        'clients',
        p_client_id,
        v_client.email,
        'GDPR Art. 20 - Data Portability Request',
        now()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'data', v_result
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION export_client_gdpr_data IS 'Exporta todos los datos personales de un cliente en formato JSON (Art. 20 GDPR)';

-- ============================================================================
-- 2. ANONYMIZE_CLIENT_DATA - Anonimizar datos de un cliente
-- ============================================================================
-- Art. 17 GDPR - Derecho al Olvido / Supresión

CREATE OR REPLACE FUNCTION anonymize_client_data(
    p_client_id uuid,
    p_reason text DEFAULT 'gdpr_erasure_request',
    p_requesting_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client record;
    v_company_id uuid;
    v_original_email text;
    v_anonymized_count int := 0;
BEGIN
    -- Verificar acceso del usuario
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_requesting_user_id, auth.uid());
    
    -- Obtener datos del cliente antes de anonimizar
    SELECT * INTO v_client
    FROM clients
    WHERE id = p_client_id
    AND company_id = v_company_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cliente no encontrado o sin acceso'
        );
    END IF;
    
    -- Verificar si ya está anonimizado
    IF v_client.anonymized_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cliente ya fue anonimizado',
            'anonymized_at', v_client.anonymized_at
        );
    END IF;
    
    v_original_email := v_client.email;
    
    -- Anonimizar datos del cliente (solo campos que existen)
    UPDATE clients
    SET 
        name = 'ANONYMIZED_' || SUBSTRING(MD5(name) FROM 1 FOR 8),
        apellidos = 'ANONYMIZED_' || SUBSTRING(MD5(COALESCE(apellidos, '')) FROM 1 FOR 8),
        email = 'anonymized.' || SUBSTRING(MD5(email) FROM 1 FOR 8) || '@anonymized.local',
        phone = NULL,
        dni = NULL,
        address = jsonb_build_object('anonymized', true),
        metadata = jsonb_build_object(
            'anonymized', true,
            'original_metadata', jsonb_build_object(
                'original_id', p_client_id,
                'anonymized_at', now(),
                'anonymized_by', COALESCE(p_requesting_user_id, auth.uid()),
                'reason', p_reason,
                'original_email_hash', MD5(v_original_email),
                'original_dni_hash', MD5(COALESCE(v_client.dni, ''))
            )
        ),
        anonymized_at = now(),
        last_accessed_at = now(),
        access_count = COALESCE(access_count, 0) + 1,
        is_active = true,
        updated_at = now()
    WHERE id = p_client_id;
    
    GET DIAGNOSTICS v_anonymized_count = ROW_COUNT;
    
    -- Anonimizar registros de consentimiento relacionados
    UPDATE gdpr_consent_records
    SET 
        subject_email = 'anonimizado_' || SUBSTRING(MD5(subject_email) FROM 1 FOR 8) || '@gdpr.local'
    WHERE subject_id = p_client_id;
    
    -- Registrar en audit log
    INSERT INTO gdpr_audit_log (
        user_id,
        company_id,
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        old_values,
        created_at
    ) VALUES (
        COALESCE(p_requesting_user_id, auth.uid()),
        v_company_id,
        'anonymize',
        'clients',
        p_client_id,
        v_original_email,
        p_reason,
        jsonb_build_object(
            'name', v_client.name,
            'email', v_original_email
        ),
        now()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Cliente anonimizado correctamente',
        'client_id', p_client_id,
        'anonymized_at', now(),
        'reason', p_reason,
        'records_anonymized', v_anonymized_count
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION anonymize_client_data IS 'Anonimiza todos los datos personales de un cliente (Art. 17 GDPR)';

-- ============================================================================
-- 3. CREATE_GDPR_ACCESS_REQUEST - Crear solicitud de acceso GDPR
-- ============================================================================
-- Art. 15-22 GDPR - Derechos del Interesado

CREATE OR REPLACE FUNCTION create_gdpr_access_request(
    p_subject_email text,
    p_request_type text,
    p_subject_name text DEFAULT NULL,
    p_request_details jsonb DEFAULT '{}'::jsonb,
    p_requesting_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_id uuid;
    v_request_id uuid;
    v_deadline_date timestamp with time zone;
BEGIN
    -- Validar tipo de solicitud
    IF p_request_type NOT IN ('access', 'rectification', 'erasure', 'portability', 'restriction', 'objection') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tipo de solicitud inválido. Valores permitidos: access, rectification, erasure, portability, restriction, objection'
        );
    END IF;
    
    -- Obtener company_id del usuario solicitante
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_requesting_user_id, auth.uid());
    
    -- Calcular fecha límite (30 días por defecto según GDPR Art. 12.3)
    v_deadline_date := now() + INTERVAL '30 days';
    
    -- Crear solicitud
    INSERT INTO gdpr_access_requests (
        request_type,
        subject_email,
        subject_name,
        company_id,
        requested_by,
        request_details,
        verification_status,
        processing_status,
        deadline_date,
        created_at,
        updated_at
    ) VALUES (
        p_request_type,
        p_subject_email,
        p_subject_name,
        v_company_id,
        COALESCE(p_requesting_user_id, auth.uid()),
        p_request_details,
        'pending',
        'received',
        v_deadline_date,
        now(),
        now()
    )
    RETURNING id INTO v_request_id;
    
    -- Registrar en audit log
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
        COALESCE(p_requesting_user_id, auth.uid()),
        v_company_id,
        'access_request',
        'gdpr_access_requests',
        v_request_id,
        p_subject_email,
        'GDPR ' || p_request_type || ' request created',
        jsonb_build_object(
            'request_type', p_request_type,
            'deadline', v_deadline_date
        ),
        now()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Solicitud GDPR creada correctamente',
        'request_id', v_request_id,
        'request_type', p_request_type,
        'subject_email', p_subject_email,
        'deadline_date', v_deadline_date,
        'status', 'received'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION create_gdpr_access_request IS 'Crea una solicitud de acceso GDPR (Art. 15-22)';

-- ============================================================================
-- 4. PROCESS_GDPR_DELETION_REQUEST - Procesar solicitud de eliminación
-- ============================================================================
-- Art. 17 GDPR - Derecho a la Supresión

CREATE OR REPLACE FUNCTION process_gdpr_deletion_request(
    p_request_id uuid,
    p_approve boolean,
    p_rejection_reason text DEFAULT NULL,
    p_processing_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_request record;
    v_company_id uuid;
    v_client_id uuid;
    v_result jsonb;
BEGIN
    -- Obtener company_id del usuario
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_processing_user_id, auth.uid());
    
    -- Obtener solicitud
    SELECT * INTO v_request
    FROM gdpr_access_requests
    WHERE id = p_request_id
    AND company_id = v_company_id
    AND request_type = 'erasure';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Solicitud de eliminación no encontrada o sin acceso'
        );
    END IF;
    
    -- Verificar que la solicitud no esté ya procesada
    IF v_request.processing_status IN ('completed', 'rejected') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Solicitud ya fue procesada',
            'status', v_request.processing_status,
            'completed_at', v_request.completed_at
        );
    END IF;
    
    IF p_approve THEN
        -- Buscar cliente por email
        SELECT id INTO v_client_id
        FROM clients
        WHERE email = v_request.subject_email
        AND company_id = v_company_id
        LIMIT 1;
        
        IF v_client_id IS NOT NULL THEN
            -- Anonimizar el cliente
            v_result := anonymize_client_data(
                v_client_id,
                'gdpr_deletion_request_approved',
                p_processing_user_id
            );
            
            IF (v_result->>'success')::boolean THEN
                -- Actualizar solicitud a completada
                UPDATE gdpr_access_requests
                SET 
                    processing_status = 'completed',
                    verification_status = 'verified',
                    completed_at = now(),
                    response_data = v_result,
                    updated_at = now()
                WHERE id = p_request_id;
                
                RETURN jsonb_build_object(
                    'success', true,
                    'message', 'Solicitud de eliminación procesada y cliente anonimizado',
                    'request_id', p_request_id,
                    'client_anonymized', true,
                    'completed_at', now()
                );
            ELSE
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Error al anonimizar cliente',
                    'details', v_result
                );
            END IF;
        ELSE
            -- Cliente no encontrado, marcar como completada igual
            UPDATE gdpr_access_requests
            SET 
                processing_status = 'completed',
                verification_status = 'verified',
                completed_at = now(),
                response_data = jsonb_build_object('message', 'Cliente no encontrado en el sistema'),
                updated_at = now()
            WHERE id = p_request_id;
            
            RETURN jsonb_build_object(
                'success', true,
                'message', 'Solicitud marcada como completada (cliente no encontrado)',
                'request_id', p_request_id
            );
        END IF;
    ELSE
        -- Rechazar solicitud
        UPDATE gdpr_access_requests
        SET 
            processing_status = 'rejected',
            verification_status = 'rejected',
            legal_basis_for_delay = p_rejection_reason,
            completed_at = now(),
            updated_at = now()
        WHERE id = p_request_id;
        
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Solicitud rechazada',
            'request_id', p_request_id,
            'rejection_reason', p_rejection_reason,
            'completed_at', now()
        );
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION process_gdpr_deletion_request IS 'Procesa una solicitud de eliminación GDPR, aprobando o rechazando';

-- ============================================================================
-- 5. GET_CLIENT_CONSENT_STATUS - Obtener estado de consentimientos
-- ============================================================================

CREATE OR REPLACE FUNCTION get_client_consent_status(
    p_client_id uuid,
    p_requesting_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client record;
    v_company_id uuid;
    v_consent_records jsonb;
BEGIN
    -- Verificar acceso
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_requesting_user_id, auth.uid());
    
    -- Obtener cliente
    SELECT * INTO v_client
    FROM clients
    WHERE id = p_client_id
    AND company_id = v_company_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cliente no encontrado o sin acceso'
        );
    END IF;
    
    -- Obtener registros de consentimiento detallados
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', cr.id,
        'consent_type', cr.consent_type,
        'purpose', cr.purpose,
        'consent_given', cr.consent_given,
        'consent_method', cr.consent_method,
        'consent_evidence', cr.consent_evidence,
        'legal_basis', cr.legal_basis,
        'created_at', cr.created_at,
        'withdrawn_at', cr.withdrawn_at,
        'is_active', cr.is_active
    ) ORDER BY cr.created_at DESC), '[]'::jsonb) INTO v_consent_records
    FROM gdpr_consent_records cr
    WHERE cr.subject_email = v_client.email;
    
    RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id,
        'client_email', v_client.email,
        'client_name', v_client.name,
        'consents', jsonb_build_object(
            'marketing_consent', v_client.marketing_consent,
            'marketing_consent_date', v_client.marketing_consent_date,
            'marketing_consent_method', v_client.marketing_consent_method,
            'data_processing_consent', v_client.data_processing_consent,
            'data_processing_consent_date', v_client.data_processing_consent_date,
            'data_processing_legal_basis', v_client.data_processing_legal_basis
        ),
        'consent_records', v_consent_records,
        'data_retention_until', v_client.data_retention_until,
        'is_active', v_client.is_active
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION get_client_consent_status IS 'Obtiene el estado completo de consentimientos de un cliente';

-- ============================================================================
-- 6. UPDATE_CLIENT_CONSENT - Actualizar consentimiento de cliente
-- ============================================================================

CREATE OR REPLACE FUNCTION update_client_consent(
    p_client_id uuid,
    p_consent_type text, -- 'marketing' o 'data_processing'
    p_consent_given boolean,
    p_consent_method text DEFAULT 'manual',
    p_consent_evidence jsonb DEFAULT '{}'::jsonb,
    p_updating_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client record;
    v_company_id uuid;
    v_old_consent boolean;
    v_consent_record_id uuid;
BEGIN
    -- Validar tipo de consentimiento
    IF p_consent_type NOT IN ('marketing', 'data_processing') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tipo de consentimiento inválido. Valores permitidos: marketing, data_processing'
        );
    END IF;
    
    -- Verificar acceso
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_updating_user_id, auth.uid());
    
    -- Obtener cliente
    SELECT * INTO v_client
    FROM clients
    WHERE id = p_client_id
    AND company_id = v_company_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cliente no encontrado o sin acceso'
        );
    END IF;
    
    -- Actualizar consentimiento en tabla clients
    IF p_consent_type = 'marketing' THEN
        v_old_consent := v_client.marketing_consent;
        
        UPDATE clients
        SET 
            marketing_consent = p_consent_given,
            marketing_consent_date = now(),
            marketing_consent_method = p_consent_method,
            updated_at = now()
        WHERE id = p_client_id;
    ELSE -- data_processing
        v_old_consent := v_client.data_processing_consent;
        
        UPDATE clients
        SET 
            data_processing_consent = p_consent_given,
            data_processing_consent_date = now(),
            updated_at = now()
        WHERE id = p_client_id;
    END IF;
    
    -- Crear registro en gdpr_consent_records
    INSERT INTO gdpr_consent_records (
        subject_id,
        subject_email,
        consent_type,
        purpose,
        consent_given,
        consent_method,
        consent_evidence,
        company_id,
        processed_by,
        legal_basis,
        created_at,
        updated_at
    ) VALUES (
        p_client_id,
        v_client.email,
        p_consent_type,
        CASE 
            WHEN p_consent_type = 'marketing' THEN 'Consentimiento para comunicaciones comerciales'
            ELSE 'Consentimiento para procesamiento de datos personales'
        END,
        p_consent_given,
        p_consent_method,
        p_consent_evidence,
        v_company_id,
        COALESCE(p_updating_user_id, auth.uid()),
        CASE 
            WHEN p_consent_type = 'marketing' THEN 'consent'
            ELSE 'contract'
        END,
        now(),
        now()
    )
    RETURNING id INTO v_consent_record_id;
    
    -- Registrar en audit log
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
        COALESCE(p_updating_user_id, auth.uid()),
        v_company_id,
        'consent',
        'clients',
        p_client_id,
        v_client.email,
        'Consent update: ' || p_consent_type,
        jsonb_build_object(p_consent_type || '_consent', v_old_consent),
        jsonb_build_object(p_consent_type || '_consent', p_consent_given),
        now()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Consentimiento actualizado correctamente',
        'client_id', p_client_id,
        'consent_type', p_consent_type,
        'consent_given', p_consent_given,
        'consent_record_id', v_consent_record_id,
        'updated_at', now()
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION update_client_consent IS 'Actualiza el consentimiento de un cliente y crea registro en gdpr_consent_records';

-- ============================================================================
-- 7. LOG_GDPR_AUDIT - Registrar evento en audit log
-- ============================================================================

CREATE OR REPLACE FUNCTION log_gdpr_audit(
    p_action_type text,
    p_table_name text,
    p_record_id uuid DEFAULT NULL,
    p_subject_email text DEFAULT NULL,
    p_purpose text DEFAULT NULL,
    p_old_values jsonb DEFAULT NULL,
    p_new_values jsonb DEFAULT NULL,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_company_id uuid;
    v_audit_id uuid;
BEGIN
    -- Validar action_type
    IF p_action_type NOT IN ('create', 'read', 'update', 'delete', 'export', 'anonymize', 'consent', 'access_request') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tipo de acción inválido'
        );
    END IF;
    
    -- Obtener company_id
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_user_id, auth.uid());
    
    -- Insertar en audit log
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
        COALESCE(p_user_id, auth.uid()),
        v_company_id,
        p_action_type,
        p_table_name,
        p_record_id,
        p_subject_email,
        p_purpose,
        p_old_values,
        p_new_values,
        now()
    )
    RETURNING id INTO v_audit_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'audit_id', v_audit_id,
        'logged_at', now()
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION log_gdpr_audit IS 'Registra un evento de auditoría GDPR en gdpr_audit_log';

-- ============================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================

-- Verificar que todas las funciones se crearon correctamente
DO $$
DECLARE
    v_missing_functions text[];
    v_func_name text;
BEGIN
    v_missing_functions := ARRAY[]::text[];
    
    FOR v_func_name IN 
        SELECT unnest(ARRAY[
            'export_client_gdpr_data',
            'anonymize_client_data',
            'create_gdpr_access_request',
            'process_gdpr_deletion_request',
            'get_client_consent_status',
            'update_client_consent',
            'log_gdpr_audit'
        ])
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_proc 
            WHERE proname = v_func_name 
            AND pronamespace = 'public'::regnamespace
        ) THEN
            v_missing_functions := array_append(v_missing_functions, v_func_name);
        END IF;
    END LOOP;
    
    IF array_length(v_missing_functions, 1) > 0 THEN
        RAISE NOTICE '❌ Funciones faltantes: %', array_to_string(v_missing_functions, ', ');
    ELSE
        RAISE NOTICE '✅ Todas las 7 funciones GDPR creadas correctamente';
    END IF;
END $$;

-- ============================================================================
-- RESULTADO ESPERADO
-- ============================================================================
SELECT 
    '🎯 FUNCIONES GDPR CREADAS' as resultado,
    '7 funciones listas para producción' as estado,
    'Ahora puedes usar estas funciones desde tu frontend' as siguiente_paso;
