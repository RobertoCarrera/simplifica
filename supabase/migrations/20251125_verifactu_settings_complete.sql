-- =====================================================
-- Migración: VeriFactu Settings - Tabla Completa
-- Fecha: 2025-11-25
-- Descripción: Tabla de configuración VeriFactu por empresa
--              con columnas encriptadas para certificados
-- =====================================================

BEGIN;

-- 1) Crear tabla verifactu_settings si no existe
CREATE TABLE IF NOT EXISTS public.verifactu_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    
    -- Información del software (requerido por VeriFactu)
    software_code TEXT,          -- Código de software registrado en AEAT
    software_name TEXT,          -- Nombre del software
    software_version TEXT,       -- Versión del software
    
    -- NIF del emisor (se usa para QR y comunicación AEAT)
    issuer_nif TEXT,
    
    -- Entorno: 'test' o 'production'
    environment TEXT DEFAULT 'test' CHECK (environment IN ('test', 'production')),
    
    -- Certificados encriptados (AES-256-GCM)
    cert_pem_enc TEXT,           -- Certificado PEM encriptado
    key_pem_enc TEXT,            -- Clave privada PEM encriptada
    key_pass_enc TEXT,           -- Passphrase encriptada
    
    -- Metadata del certificado (no sensible)
    cert_subject TEXT,           -- Subject del certificado (para mostrar)
    cert_valid_from TIMESTAMPTZ, -- Fecha de inicio validez
    cert_valid_to TIMESTAMPTZ,   -- Fecha de fin validez
    cert_uploaded_at TIMESTAMPTZ,-- Cuando se subió
    
    -- Estado
    is_active BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Una configuración por empresa
    CONSTRAINT verifactu_settings_company_unique UNIQUE (company_id)
);

-- 2) Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_verifactu_settings_company 
    ON public.verifactu_settings(company_id);

-- 3) Comentarios
COMMENT ON TABLE public.verifactu_settings IS 'Configuración VeriFactu por empresa. Certificados almacenados encriptados.';
COMMENT ON COLUMN public.verifactu_settings.cert_pem_enc IS 'Certificado PEM encriptado con AES-256-GCM';
COMMENT ON COLUMN public.verifactu_settings.key_pem_enc IS 'Clave privada PEM encriptada con AES-256-GCM';
COMMENT ON COLUMN public.verifactu_settings.key_pass_enc IS 'Passphrase de la clave encriptada con AES-256-GCM';

-- 4) Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_verifactu_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_verifactu_settings_updated_at ON public.verifactu_settings;
CREATE TRIGGER trigger_verifactu_settings_updated_at
    BEFORE UPDATE ON public.verifactu_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_verifactu_settings_updated_at();

-- 5) Habilitar RLS
ALTER TABLE public.verifactu_settings ENABLE ROW LEVEL SECURITY;

-- 6) Eliminar políticas existentes (idempotente)
DO $$
DECLARE
    pol TEXT;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies 
               WHERE schemaname='public' AND tablename='verifactu_settings' 
    LOOP
        EXECUTE format('DROP POLICY %I ON public.verifactu_settings', pol);
    END LOOP;
END $$;

-- 7) Crear políticas RLS (solo owner/admin pueden ver/editar)
CREATE POLICY verifactu_settings_select_policy
    ON public.verifactu_settings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.auth_user_id = auth.uid()
              AND u.company_id = verifactu_settings.company_id
              AND u.role IN ('owner', 'admin')
              AND u.deleted_at IS NULL
        )
    );

CREATE POLICY verifactu_settings_insert_policy
    ON public.verifactu_settings FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.auth_user_id = auth.uid()
              AND u.company_id = verifactu_settings.company_id
              AND u.role IN ('owner', 'admin')
              AND u.deleted_at IS NULL
        )
    );

CREATE POLICY verifactu_settings_update_policy
    ON public.verifactu_settings FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.auth_user_id = auth.uid()
              AND u.company_id = verifactu_settings.company_id
              AND u.role IN ('owner', 'admin')
              AND u.deleted_at IS NULL
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.auth_user_id = auth.uid()
              AND u.company_id = verifactu_settings.company_id
              AND u.role IN ('owner', 'admin')
              AND u.deleted_at IS NULL
        )
    );

CREATE POLICY verifactu_settings_delete_policy
    ON public.verifactu_settings FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.auth_user_id = auth.uid()
              AND u.company_id = verifactu_settings.company_id
              AND u.role = 'owner'
              AND u.deleted_at IS NULL
        )
    );

-- 8) RPC para obtener configuración (descifrado lo hace el Edge Function)
CREATE OR REPLACE FUNCTION public.get_verifactu_settings_for_company(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Verificar acceso
    IF NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.company_id = p_company_id
          AND u.role IN ('owner', 'admin')
          AND u.deleted_at IS NULL
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'access_denied');
    END IF;
    
    SELECT jsonb_build_object(
        'ok', true,
        'software_code', vs.software_code,
        'software_name', vs.software_name,
        'software_version', vs.software_version,
        'issuer_nif', vs.issuer_nif,
        'environment', vs.environment,
        'is_active', vs.is_active,
        'cert_subject', vs.cert_subject,
        'cert_valid_from', vs.cert_valid_from,
        'cert_valid_to', vs.cert_valid_to,
        'has_certificate', (vs.cert_pem_enc IS NOT NULL)
    ) INTO v_result
    FROM public.verifactu_settings vs
    WHERE vs.company_id = p_company_id;
    
    IF v_result IS NULL THEN
        RETURN jsonb_build_object(
            'ok', true,
            'exists', false,
            'message', 'No configuration found'
        );
    END IF;
    
    RETURN v_result;
END;
$$;

-- 9) RPC para upsert configuración (sin certificados, eso va por Edge Function)
CREATE OR REPLACE FUNCTION public.upsert_verifactu_settings(
    p_company_id UUID,
    p_software_code TEXT DEFAULT NULL,
    p_software_name TEXT DEFAULT NULL,
    p_software_version TEXT DEFAULT NULL,
    p_issuer_nif TEXT DEFAULT NULL,
    p_environment TEXT DEFAULT 'test',
    p_is_active BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Verificar acceso
    IF NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.company_id = p_company_id
          AND u.role IN ('owner', 'admin')
          AND u.deleted_at IS NULL
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'access_denied');
    END IF;
    
    INSERT INTO public.verifactu_settings (
        company_id,
        software_code,
        software_name,
        software_version,
        issuer_nif,
        environment,
        is_active
    ) VALUES (
        p_company_id,
        p_software_code,
        p_software_name,
        p_software_version,
        p_issuer_nif,
        p_environment,
        p_is_active
    )
    ON CONFLICT (company_id) DO UPDATE SET
        software_code = COALESCE(EXCLUDED.software_code, verifactu_settings.software_code),
        software_name = COALESCE(EXCLUDED.software_name, verifactu_settings.software_name),
        software_version = COALESCE(EXCLUDED.software_version, verifactu_settings.software_version),
        issuer_nif = COALESCE(EXCLUDED.issuer_nif, verifactu_settings.issuer_nif),
        environment = COALESCE(EXCLUDED.environment, verifactu_settings.environment),
        is_active = COALESCE(EXCLUDED.is_active, verifactu_settings.is_active),
        updated_at = NOW();
    
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 10) Tabla de historial de certificados
CREATE TABLE IF NOT EXISTS public.verifactu_cert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.verifactu_settings(company_id) ON DELETE CASCADE,
    
    -- Metadata del certificado (no el contenido encriptado)
    cert_subject TEXT,
    cert_valid_from TIMESTAMPTZ,
    cert_valid_to TIMESTAMPTZ,
    
    -- Quién y cuándo
    uploaded_by UUID REFERENCES public.users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Razón del reemplazo
    replaced_at TIMESTAMPTZ,
    replaced_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_verifactu_cert_history_company 
    ON public.verifactu_cert_history(company_id);

-- RLS para historial
ALTER TABLE public.verifactu_cert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY verifactu_cert_history_select_policy
    ON public.verifactu_cert_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.auth_user_id = auth.uid()
              AND u.company_id = verifactu_cert_history.company_id
              AND u.role IN ('owner', 'admin')
              AND u.deleted_at IS NULL
        )
    );

COMMIT;

-- =====================================================
-- NOTAS DE SEGURIDAD
-- =====================================================
-- 1. Los certificados se almacenan ENCRIPTADOS (AES-256-GCM)
-- 2. La clave de encriptación está en VERIFACTU_CERT_ENC_KEY (secret)
-- 3. Solo Edge Functions con service_role pueden leer/escribir los campos *_enc
-- 4. RLS previene acceso no autorizado incluso si alguien obtiene la API key
-- 5. Solo owner puede eliminar la configuración
