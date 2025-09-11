-- ========================================
-- CORRECCIÓN DE ESTRUCTURA GDPR EN SUPABASE  
-- ========================================
-- Correcciones basadas en esquema real de Supabase

-- REALIDAD: Solo tienes tabla 'clients' (con GDPR completo)
-- Las funciones hacen referencia a 'customers' que NO EXISTE

-- PROBLEMA 1: FUNCIONES APUNTAN A TABLA INEXISTENTE
-- ==================================================

-- Corregir función create_customer_dev para usar 'clients'
CREATE OR REPLACE FUNCTION public.create_customer_dev(
    target_user_id uuid, 
    p_nombre character varying, 
    p_apellidos character varying, 
    p_email character varying, 
    p_telefono character varying DEFAULT NULL::character varying, 
    p_dni character varying DEFAULT NULL::character varying
) 
RETURNS uuid 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
    new_client_id uuid;
    user_company_id uuid;
BEGIN
    -- Obtener company_id del usuario
    SELECT company_id INTO user_company_id 
    FROM public.users 
    WHERE auth_user_id = target_user_id;
    
    IF user_company_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no tiene empresa asignada';
    END IF;
    
    -- Insertar en clients (no customers)
    INSERT INTO public.clients (
        company_id,
        name,
        apellidos,
        email,
        phone,
        dni,
        -- Campos GDPR obligatorios
        marketing_consent,
        data_processing_consent,
        data_processing_consent_date,
        data_processing_legal_basis,
        is_minor,
        access_count
    ) VALUES (
        user_company_id,
        p_nombre,
        p_apellidos,
        p_email,
        p_telefono,
        p_dni,
        false,  -- Marketing consent por defecto NO
        true,   -- Processing consent por defecto SÍ
        now(),
        'contract',
        false,
        0
    )
    RETURNING id INTO new_client_id;
    
    RETURN new_client_id;
END;
$$;

-- Corregir función count_customers_by_user para usar 'clients'
CREATE OR REPLACE FUNCTION public.count_customers_by_user(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    customer_count INTEGER;
    user_company_id uuid;
BEGIN
    -- Obtener company_id del usuario
    SELECT company_id INTO user_company_id 
    FROM public.users 
    WHERE auth_user_id = target_user_id;
    
    -- Contar clientes de la empresa del usuario
    SELECT COUNT(*)
    INTO customer_count
    FROM public.clients c
    WHERE c.company_id = user_company_id
    AND c.deleted_at IS NULL
    AND c.anonymized_at IS NULL;  -- No contar anonimizados
    
    RETURN COALESCE(customer_count, 0);
END;
$$;

-- Corregir función delete_customer_dev para usar 'clients'
CREATE OR REPLACE FUNCTION public.delete_customer_dev(client_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_rows INTEGER;
    user_company_id uuid;
BEGIN
    -- Obtener company_id del usuario
    SELECT company_id INTO user_company_id 
    FROM public.users 
    WHERE auth_user_id = target_user_id;
    
    -- Borrado suave con marca GDPR
    UPDATE public.clients 
    SET 
        deleted_at = now(),
        deletion_reason = 'User deletion request'
    WHERE 
        id = client_id 
        AND company_id = user_company_id
        AND deleted_at IS NULL;
    
    GET DIAGNOSTICS deleted_rows = ROW_COUNT;
    
    RETURN deleted_rows > 0;
END;
$$;

-- PROBLEMA 2: POLÍTICAS RLS FALTANTES PARA GDPR
-- ==============================================

-- Política para gdpr_processing_activities (corregir sintaxis)
DROP POLICY IF EXISTS "gdpr_processing_activities_admin_only" ON public.gdpr_processing_activities;
CREATE POLICY "gdpr_processing_activities_admin_only" 
ON public.gdpr_processing_activities
FOR ALL
TO public
USING (
    EXISTS (
        SELECT 1 FROM public.users u 
        WHERE u.auth_user_id = auth.uid() 
        AND (u.is_dpo = true OR u.data_access_level IN ('admin', 'elevated'))
    )
);

-- Política para gdpr_breach_incidents (corregir sintaxis)
DROP POLICY IF EXISTS "gdpr_breach_incidents_dpo_admin" ON public.gdpr_breach_incidents;
CREATE POLICY "gdpr_breach_incidents_dpo_admin" 
ON public.gdpr_breach_incidents
FOR ALL
TO public
USING (
    EXISTS (
        SELECT 1 FROM public.users u 
        WHERE u.auth_user_id = auth.uid() 
        AND (u.is_dpo = true OR u.data_access_level IN ('admin', 'elevated'))
    )
);

-- PROBLEMA 3: MEJORAR POLÍTICA CLIENTS PARA GDPR
-- ===============================================
-- La política actual de clients no considera datos anonimizados

DROP POLICY IF EXISTS "clients_company_only" ON public.clients;
CREATE POLICY "clients_gdpr_company_access" 
ON public.clients
FOR ALL
TO public
USING (
    company_id IN (SELECT company_id FROM user_company_context)
    AND deleted_at IS NULL
    AND anonymized_at IS NULL  -- No mostrar datos anonimizados
)
WITH CHECK (
    company_id IN (SELECT company_id FROM user_company_context)
);

-- PROBLEMA 4: FALTA COMPANY_ID EN ALGUNAS TABLAS GDPR
-- ====================================================
-- Asegurar que todas las operaciones están limitadas por empresa

ALTER TABLE public.gdpr_processing_activities 
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- PROBLEMA 5: TRIGGERS GDPR PARA CLIENTS
-- ====================================

-- Función para registrar accesos a datos de clientes (GDPR Article 15)
CREATE OR REPLACE FUNCTION log_client_access()
RETURNS TRIGGER AS $$
BEGIN
    -- Registrar acceso en audit log
    INSERT INTO public.gdpr_audit_log (
        user_id,
        company_id,
        action_type,
        table_name,
        record_id,
        subject_email,
        legal_basis,
        purpose
    ) VALUES (
        auth.uid(),
        NEW.company_id,
        CASE TG_OP
            WHEN 'INSERT' THEN 'create'
            WHEN 'UPDATE' THEN 'update'
            WHEN 'DELETE' THEN 'delete'
            ELSE 'read'
        END,
        TG_TABLE_NAME,
        NEW.id,
        NEW.email,
        'legitimate_interest',
        'Client data management for business operations'
    );
    
    -- Actualizar contador de accesos solo en SELECT/UPDATE
    IF TG_OP IN ('SELECT', 'UPDATE') THEN
        UPDATE public.clients 
        SET 
            last_accessed_at = now(),
            access_count = COALESCE(access_count, 0) + 1
        WHERE id = NEW.id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar trigger a clients
DROP TRIGGER IF EXISTS trigger_log_client_gdpr_access ON public.clients;
CREATE TRIGGER trigger_log_client_gdpr_access
    AFTER INSERT OR UPDATE OR DELETE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION log_client_access();

-- PROBLEMA 6: DEVICES APUNTA A CLIENTS PERO SIN CONTROL GDPR
-- ===========================================================

-- Política mejorada para devices que considera clientes anonimizados
DROP POLICY IF EXISTS "Users can view devices from their company" ON public.devices;
CREATE POLICY "devices_gdpr_company_access" 
ON public.devices
FOR SELECT
TO public
USING (
    company_id IN (
        SELECT user_companies.company_id
        FROM user_companies
        WHERE user_companies.user_id = auth.uid()
    )
    AND client_id NOT IN (
        -- Excluir devices de clientes anonimizados
        SELECT id FROM public.clients WHERE anonymized_at IS NOT NULL
    )
);

-- PROBLEMA 7: ACTUALIZAR MODELO TYPESCRIPT
-- =========================================
-- NOTA: Necesitarás actualizar src/app/models/customer.ts
-- para que apunte a 'clients' en lugar de 'customers'
