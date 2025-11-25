-- =====================================================
-- Migración: Añadir campo NIF a la tabla companies
-- Fecha: 2025-11-25
-- Descripción: El NIF/CIF es obligatorio para emitir facturas
--              y para generar el QR de VeriFactu/AEAT
-- =====================================================

-- Añadir columna nif a companies (nullable inicialmente para no romper datos existentes)
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS nif VARCHAR(20);

-- Índice para búsquedas por NIF (útil para validaciones)
CREATE INDEX IF NOT EXISTS idx_companies_nif ON public.companies(nif) WHERE nif IS NOT NULL;

-- Comentario explicativo
COMMENT ON COLUMN public.companies.nif IS 'NIF/CIF de la empresa. Obligatorio para facturación y VeriFactu.';

-- =====================================================
-- Actualizar la tabla pending_users para incluir el NIF
-- =====================================================
ALTER TABLE public.pending_users
ADD COLUMN IF NOT EXISTS company_nif VARCHAR(20);

COMMENT ON COLUMN public.pending_users.company_nif IS 'NIF/CIF de la empresa a crear tras la confirmación del registro.';

-- =====================================================
-- Actualizar la función confirm_user_registration 
-- para que propague el NIF al crear la empresa
-- =====================================================

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
        -- Marcar como confirmado y retornar
        UPDATE pending_users SET confirmed_at = NOW() WHERE id = v_pending.id;
        RETURN jsonb_build_object('success', true, 'already_exists', true);
    END IF;

    -- 3. Verificar si la empresa ya existe (por nombre exacto)
    SELECT id INTO v_existing_company
    FROM companies
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_pending.company_name))
    LIMIT 1;

    IF v_existing_company.id IS NOT NULL THEN
        -- Empresa existe: crear usuario como member (requiere aprobación del owner)
        -- Por ahora, marcamos que requiere invitación
        RETURN jsonb_build_object(
            'success', false, 
            'requires_invitation_approval', true,
            'company_id', v_existing_company.id,
            'company_name', v_pending.company_name
        );
    END IF;

    -- 4. Crear empresa nueva (con NIF si está disponible)
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

    -- 6. Marcar pending como confirmado
    UPDATE pending_users SET confirmed_at = NOW() WHERE id = v_pending.id;

    RETURN jsonb_build_object(
        'success', true,
        'company_id', v_company_id,
        'user_id', v_user_id
    );
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.confirm_user_registration(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_user_registration(UUID) TO service_role;
