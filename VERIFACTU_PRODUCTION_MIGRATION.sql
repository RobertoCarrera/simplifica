-- =====================================================
-- VERIFACTU PRODUCCIÓN - SQL CONSOLIDADO
-- Ejecutar en Supabase Dashboard > SQL Editor
-- Fecha: 2025-11-25
-- =====================================================
-- Este archivo combina todas las migraciones necesarias
-- para poner VeriFactu en producción.
-- =====================================================

-- ===== PARTE 1: AÑADIR NIF A COMPANIES =====

-- Añadir columna nif a companies
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS nif VARCHAR(20);

-- Índice para búsquedas por NIF
CREATE INDEX IF NOT EXISTS idx_companies_nif ON public.companies(nif) WHERE nif IS NOT NULL;

COMMENT ON COLUMN public.companies.nif IS 'NIF/CIF de la empresa. Obligatorio para facturación y VeriFactu.';

-- Añadir NIF a pending_users
ALTER TABLE public.pending_users
ADD COLUMN IF NOT EXISTS company_nif VARCHAR(20);

COMMENT ON COLUMN public.pending_users.company_nif IS 'NIF/CIF de la empresa a crear tras la confirmación del registro.';

-- Actualizar función confirm_user_registration para propagar el NIF
CREATE OR REPLACE FUNCTION public.confirm_user_registration(p_auth_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pending RECORD;
    v_company_id UUID;
    v_user_id UUID;
    v_existing_company RECORD;
BEGIN
    -- 1. Buscar registro pendiente
    SELECT * INTO v_pending
    FROM pending_users
    WHERE auth_user_id = p_auth_user_id
      AND confirmed_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_pending IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No pending registration found');
    END IF;

    -- 2. Verificar si ya existe usuario en la tabla users
    SELECT id INTO v_user_id
    FROM users
    WHERE auth_user_id = p_auth_user_id;

    IF v_user_id IS NOT NULL THEN
        UPDATE pending_users SET confirmed_at = NOW() WHERE id = v_pending.id;
        RETURN jsonb_build_object('success', true, 'already_exists', true);
    END IF;

    -- 3. Verificar si la empresa ya existe
    SELECT id INTO v_existing_company
    FROM companies
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_pending.company_name))
    LIMIT 1;

    IF v_existing_company.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'requires_invitation_approval', true,
            'company_id', v_existing_company.id,
            'company_name', v_pending.company_name
        );
    END IF;

    -- 4. Crear empresa nueva CON NIF
    INSERT INTO companies (name, slug, nif)
    VALUES (
        COALESCE(v_pending.company_name, 'Mi Empresa'),
        LOWER(REGEXP_REPLACE(COALESCE(v_pending.company_name, 'mi-empresa'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || FLOOR(RANDOM() * 1000000000)::TEXT,
        v_pending.company_nif
    )
    RETURNING id INTO v_company_id;

    -- 5. Crear usuario como owner
    INSERT INTO users (email, name, surname, role, active, company_id, auth_user_id, permissions)
    VALUES (
        v_pending.email,
        COALESCE(v_pending.given_name, SPLIT_PART(v_pending.full_name, ' ', 1), 'Usuario'),
        v_pending.surname,
        'owner',
        true,
        v_company_id,
        p_auth_user_id,
        '{}'::JSONB
    )
    RETURNING id INTO v_user_id;

    -- 6. Marcar como confirmado
    UPDATE pending_users SET confirmed_at = NOW() WHERE id = v_pending.id;

    RETURN jsonb_build_object(
        'success', true,
        'company_id', v_company_id,
        'user_id', v_user_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_user_registration(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_user_registration(UUID) TO service_role;


-- ===== PARTE 2: TABLA VERIFACTU_SETTINGS =====

-- Crear tabla verifactu_settings si no existe
CREATE TABLE IF NOT EXISTS public.verifactu_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    
    -- Información del software
    software_code TEXT,
    software_name TEXT,
    software_version TEXT,
    
    -- NIF del emisor
    issuer_nif TEXT,
    
    -- Entorno
    environment TEXT DEFAULT 'test' CHECK (environment IN ('test', 'production')),
    
    -- Certificados encriptados (AES-256-GCM)
    cert_pem_enc TEXT,
    key_pem_enc TEXT,
    key_pass_enc TEXT,
    
    -- Metadata del certificado
    cert_subject TEXT,
    cert_valid_from TIMESTAMPTZ,
    cert_valid_to TIMESTAMPTZ,
    cert_uploaded_at TIMESTAMPTZ,
    
    -- Estado
    is_active BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT verifactu_settings_company_unique UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_verifactu_settings_company 
    ON public.verifactu_settings(company_id);

COMMENT ON TABLE public.verifactu_settings IS 'Configuración VeriFactu por empresa. Certificados almacenados encriptados.';

-- Trigger para updated_at
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

-- Habilitar RLS
ALTER TABLE public.verifactu_settings ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes
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

-- Políticas RLS
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

-- RPC para obtener configuración (eliminar primero si existe con otro nombre de param)
DROP FUNCTION IF EXISTS public.get_verifactu_settings_for_company(UUID);

CREATE OR REPLACE FUNCTION public.get_verifactu_settings_for_company(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
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
        RETURN jsonb_build_object('ok', true, 'exists', false, 'message', 'No configuration found');
    END IF;
    
    RETURN v_result;
END;
$$;

-- RPC para upsert configuración (eliminar primero si existe con otro nombre de params)
DROP FUNCTION IF EXISTS public.upsert_verifactu_settings(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);

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
        company_id, software_code, software_name, software_version,
        issuer_nif, environment, is_active
    ) VALUES (
        p_company_id, p_software_code, p_software_name, p_software_version,
        p_issuer_nif, p_environment, p_is_active
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

-- Tabla historial de certificados
CREATE TABLE IF NOT EXISTS public.verifactu_cert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    cert_subject TEXT,
    cert_valid_from TIMESTAMPTZ,
    cert_valid_to TIMESTAMPTZ,
    uploaded_by UUID REFERENCES public.users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    replaced_at TIMESTAMPTZ,
    replaced_reason TEXT
);

-- Añadir FK solo si la tabla verifactu_settings existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'verifactu_cert_history_company_fk'
    ) THEN
        BEGIN
            ALTER TABLE public.verifactu_cert_history 
            ADD CONSTRAINT verifactu_cert_history_company_fk 
            FOREIGN KEY (company_id) REFERENCES public.verifactu_settings(company_id) ON DELETE CASCADE;
        EXCEPTION WHEN OTHERS THEN
            NULL; -- Ignorar si falla (tabla puede no tener datos)
        END;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_verifactu_cert_history_company 
    ON public.verifactu_cert_history(company_id);

ALTER TABLE public.verifactu_cert_history ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes de cert_history
DO $$
DECLARE
    pol TEXT;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies 
               WHERE schemaname='public' AND tablename='verifactu_cert_history' 
    LOOP
        EXECUTE format('DROP POLICY %I ON public.verifactu_cert_history', pol);
    END LOOP;
END $$;

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

-- Permisos para funciones RPC
GRANT EXECUTE ON FUNCTION public.get_verifactu_settings_for_company(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_verifactu_settings(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ===== FIN DE MIGRACIONES =====

-- Verificación final
DO $$
BEGIN
    RAISE NOTICE '✅ Migración completada exitosamente';
    RAISE NOTICE '✅ Tabla companies.nif añadida';
    RAISE NOTICE '✅ Tabla verifactu_settings creada con RLS';
    RAISE NOTICE '✅ Tabla verifactu_cert_history creada';
    RAISE NOTICE '✅ Funciones RPC creadas';
END $$;
