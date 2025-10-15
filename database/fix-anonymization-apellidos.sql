-- ============================================================================
-- FIX: Anonimización Completa - Incluir Apellidos
-- ============================================================================
-- Fecha: 15 de Octubre, 2025
-- Propósito: Corregir función de anonimización para incluir apellidos
-- Ejecutar en: Supabase SQL Editor
-- ============================================================================

-- 1. Actualizar función anonymize_client_data (usada por el servicio)
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
    
    -- ✅ Anonimizar datos del cliente (INCLUYENDO APELLIDOS)
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
        subject_email = 'anonymized.' || SUBSTRING(MD5(subject_email) FROM 1 FOR 8) || '@anonymized.local'
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
        created_at
    ) VALUES (
        COALESCE(p_requesting_user_id, auth.uid()),
        v_company_id,
        'anonymize',
        'clients',
        p_client_id,
        'anonymized.' || SUBSTRING(MD5(v_original_email) FROM 1 FOR 8) || '@anonymized.local',
        p_reason,
        now()
    );
    
    -- Retornar resultado exitoso
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Cliente anonimizado correctamente',
        'anonymized_count', v_anonymized_count,
        'client_id', p_client_id,
        'anonymized_at', now()
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;

COMMENT ON FUNCTION anonymize_client_data IS 'Anonimiza todos los datos personales de un cliente incluyendo apellidos (Art. 17 GDPR)';

-- ============================================================================
-- 2. Actualizar función gdpr_anonymize_client (función alternativa)
-- ============================================================================

CREATE OR REPLACE FUNCTION gdpr_anonymize_client(
    client_id uuid,
    requesting_user_id uuid,
    anonymization_reason text DEFAULT 'gdpr_erasure_request'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    client_record record;
    anonymized_data jsonb;
BEGIN
    -- Get client record
    SELECT * INTO client_record FROM public.clients WHERE id = client_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client not found');
    END IF;
    
    -- Verificar si ya está anonimizado
    IF client_record.anonymized_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Client already anonymized',
            'anonymized_at', client_record.anonymized_at
        );
    END IF;
    
    -- Create anonymized data structure
    anonymized_data := jsonb_build_object(
        'original_id', client_record.id,
        'anonymized_at', now(),
        'anonymized_by', requesting_user_id,
        'reason', anonymization_reason,
        'original_email_hash', md5(client_record.email),
        'original_dni_hash', md5(COALESCE(client_record.dni, ''))
    );
    
    -- ✅ Update client with anonymized data (INCLUYENDO APELLIDOS)
    UPDATE public.clients SET
        name = 'ANONYMIZED_' || left(md5(client_record.name), 8),
        apellidos = 'ANONYMIZED_' || left(md5(COALESCE(client_record.apellidos, '')), 8),
        email = 'anonymized.' || left(md5(client_record.email), 8) || '@anonymized.local',
        phone = NULL,
        dni = NULL,
        address = jsonb_build_object('anonymized', true),
        metadata = jsonb_build_object('anonymized', true, 'original_metadata', anonymized_data),
        anonymized_at = now(),
        last_accessed_at = now(),
        access_count = COALESCE(access_count, 0) + 1,
        updated_at = now()
    WHERE id = client_id;
    
    -- Log the anonymization
    INSERT INTO public.gdpr_audit_log (
        user_id, action_type, table_name, record_id, 
        subject_email, purpose, created_at
    ) VALUES (
        requesting_user_id, 'anonymize', 'clients', client_id,
        client_record.email, anonymization_reason, now()
    );
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Client data anonymized successfully',
        'anonymized_id', client_id,
        'anonymized_at', now()
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false, 
        'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION gdpr_anonymize_client IS 'Anonimiza todos los datos personales de un cliente incluyendo apellidos (Art. 17 GDPR)';

-- ============================================================================
-- 3. Test de la función actualizada
-- ============================================================================

-- Crear cliente de prueba
/*
INSERT INTO clients (company_id, name, apellidos, email, phone, dni)
VALUES (
    'tu-company-id-aquí',
    'Test Final GDPR',
    'Apellido Prueba',
    'test-final-gdpr@test.com',
    '666111222',
    '88888888X'
);

-- Copiar el UUID del cliente creado y usarlo aquí:
SELECT anonymize_client_data('uuid-del-cliente-aquí', 'gdpr_test');

-- Verificar resultado:
SELECT id, name, apellidos, email, phone, dni, anonymized_at
FROM clients
WHERE email LIKE '%@anonymized.local'
ORDER BY created_at DESC
LIMIT 1;
*/

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
