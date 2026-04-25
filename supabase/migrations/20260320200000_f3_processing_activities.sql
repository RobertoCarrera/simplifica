-- F3-4: Registro de actividades de tratamiento (Art. 30 RGPD) [idempotent]
-- ADD COLUMN IF NOT EXISTS permite aplicar esta migración aunque la tabla ya exista
-- con un esquema anterior.

-- ── 1. Tabla principal ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gdpr_processing_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Art. 30.1(a) — Controller / DPO
ALTER TABLE public.gdpr_processing_activities
    ADD COLUMN IF NOT EXISTS company_id              UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS controller_name         TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS controller_contact      TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS dpo_contact             TEXT,
    -- Art. 30.1(b) — Purpose
    ADD COLUMN IF NOT EXISTS activity_name           TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS purpose                 TEXT NOT NULL DEFAULT '',
    -- Art. 30.1(c-d) — Data subjects / categories
    ADD COLUMN IF NOT EXISTS data_subjects           TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS data_categories         TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS special_categories      TEXT[] NOT NULL DEFAULT '{}',
    -- Art. 30.1(e) — Recipients
    ADD COLUMN IF NOT EXISTS recipients              TEXT[] NOT NULL DEFAULT '{}',
    -- Art. 30.1(f) — Third country transfers
    ADD COLUMN IF NOT EXISTS third_country_transfers JSONB,
    -- Art. 30.1(g) — Retention
    ADD COLUMN IF NOT EXISTS retention_period        TEXT,
    ADD COLUMN IF NOT EXISTS retention_basis         TEXT,
    -- Legal basis (Art. 6 / Art. 9)
    ADD COLUMN IF NOT EXISTS legal_basis             TEXT NOT NULL DEFAULT '',
    -- Security measures (Art. 30.1(h))
    ADD COLUMN IF NOT EXISTS security_measures       TEXT[] NOT NULL DEFAULT '{}',
    -- Processor info (Art. 30.2)
    ADD COLUMN IF NOT EXISTS is_processor_activity   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS processor_name          TEXT,
    ADD COLUMN IF NOT EXISTS processor_contact       TEXT,
    ADD COLUMN IF NOT EXISTS on_behalf_of_controller TEXT,
    -- Lifecycle
    ADD COLUMN IF NOT EXISTS status                  TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS last_reviewed_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_reviewed_by        UUID REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_schema = 'public'
          AND constraint_name = 'gdpr_processing_activities_status_check'
    ) THEN
        ALTER TABLE public.gdpr_processing_activities
            ADD CONSTRAINT gdpr_processing_activities_status_check
            CHECK (status IN ('active', 'under_review', 'retired'));
    END IF;
END;
$$;

COMMENT ON TABLE public.gdpr_processing_activities
    IS 'Registro de Actividades de Tratamiento – Art. 30 RGPD';

CREATE INDEX IF NOT EXISTS idx_gdpr_activities_company
    ON public.gdpr_processing_activities(company_id);

CREATE INDEX IF NOT EXISTS idx_gdpr_activities_status
    ON public.gdpr_processing_activities(status);

-- Auto-updated_at
DROP TRIGGER IF EXISTS handle_gdpr_activities_updated_at ON public.gdpr_processing_activities;
CREATE TRIGGER handle_gdpr_activities_updated_at
    BEFORE UPDATE ON public.gdpr_processing_activities
    FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.gdpr_processing_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gdpr_activities_select" ON public.gdpr_processing_activities;
CREATE POLICY "gdpr_activities_select" ON public.gdpr_processing_activities
    FOR SELECT
    USING (
        public.is_super_admin_real()
        OR company_id IS NULL
        OR public.is_company_admin(company_id)
    );

DROP POLICY IF EXISTS "gdpr_activities_insert_admin" ON public.gdpr_processing_activities;
CREATE POLICY "gdpr_activities_insert_admin" ON public.gdpr_processing_activities
    FOR INSERT
    WITH CHECK (
        public.is_super_admin_real()
        OR (company_id IS NOT NULL AND public.is_company_admin(company_id))
    );

DROP POLICY IF EXISTS "gdpr_activities_update_admin" ON public.gdpr_processing_activities;
CREATE POLICY "gdpr_activities_update_admin" ON public.gdpr_processing_activities
    FOR UPDATE
    USING (
        public.is_super_admin_real()
        OR (company_id IS NOT NULL AND public.is_company_admin(company_id))
    );

-- Note: retention_period and retention_basis may already exist as interval type
-- with a view depending on them; we leave them as-is and seed without them.

-- ── 3. Seed: tratamientos de Simplifica CRM (company_id NULL = plantilla global) ──
-- Sólo inserta si aún no hay registros globales (idempotente)

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.gdpr_processing_activities WHERE company_id IS NULL) THEN
INSERT INTO public.gdpr_processing_activities (
    company_id, controller_name, controller_contact, dpo_contact,
    activity_name, purpose, data_subjects, data_categories, special_categories,
    recipients, third_country_transfers,
    legal_basis, is_processor_activity
) VALUES

-- 3.1 Gestión de clientes
(NULL,
 'Empresa usuaria de Simplifica CRM',
 'admin@empresa.es',
 'dpo@empresa.es',
 'Gestión de clientes',
 'Gestión de la relación comercial con clientes: facturación, presupuestos, comunicaciones y seguimiento.',
 ARRAY['Clientes', 'Contactos de empresa'],
 ARRAY['Nombre y apellidos', 'Email', 'Teléfono', 'Dirección', 'NIF/CIF', 'Datos de facturación'],
 ARRAY[]::TEXT[],
 ARRAY['Supabase (encargado de tratamiento, UE)', 'Vercel (prestador de alojamiento, EE.UU. — Cláusulas Contractuales Tipo)'],
 '{"Vercel": {"country": "USA", "safeguard": "Standard Contractual Clauses (Art. 46.2c)"}}',
 'Ejecución de contrato (Art. 6.1.b) / Obligación legal (Art. 6.1.c)',
 false
),

-- 3.2 Notas clínicas (datos de salud)
(NULL,
 'Empresa usuaria de Simplifica CRM',
 'admin@empresa.es',
 'dpo@empresa.es',
 'Registro de notas clínicas',
 'Gestión de historial clínico de pacientes/clientes para profesionales sanitarios.',
 ARRAY['Pacientes', 'Usuarios del portal de cliente'],
 ARRAY['Nombre', 'Email', 'Historial de tratamientos'],
 ARRAY['Datos de salud (Art. 9.1 RGPD)'],
 ARRAY['Supabase (encargado de tratamiento, UE — cifrado mediante Vault)'],
 NULL,
 'Interés vital o consentimiento explícito (Art. 9.2.a) / Atención sanitaria (Art. 9.2.h)',
 false
),

-- 3.3 Facturación y VeriFACTU
(NULL,
 'Empresa usuaria de Simplifica CRM',
 'admin@empresa.es',
 'dpo@empresa.es',
 'Facturación electrónica y VeriFACTU',
 'Emisión de facturas, envío a la AEAT mediante VeriFACTU y archive fiscal.',
 ARRAY['Clientes', 'Proveedores'],
 ARRAY['Nombre / Razón social', 'NIF/CIF', 'Dirección fiscal', 'Datos bancarios (IBAN)'],
 ARRAY[]::TEXT[],
 ARRAY['AEAT (obligación legal)', 'Supabase (encargado de tratamiento, UE)'],
 NULL,
 'Obligación legal (Art. 6.1.c)',
 false
),

-- 3.4 Comunicaciones de marketing
(NULL,
 'Empresa usuaria de Simplifica CRM',
 'admin@empresa.es',
 'dpo@empresa.es',
 'Comunicaciones comerciales y campañas de marketing',
 'Envío de newsletters, ofertas y comunicaciones comerciales a clientes y prospectos.',
 ARRAY['Clientes', 'Suscriptores'],
 ARRAY['Nombre', 'Email', 'Historial de interacciones'],
 ARRAY[]::TEXT[],
 ARRAY['Proveedor de email marketing (SES/AWS, EE.UU. — Cláusulas Contractuales Tipo)', 'Supabase (encargado de tratamiento, UE)'],
 '{"AWS SES": {"country": "USA", "safeguard": "Standard Contractual Clauses (Art. 46.2c)"}}',
 'Consentimiento (Art. 6.1.a) / LSSI Art. 21',
 false
),

-- 3.5 Gestión de empleados
(NULL,
 'Empresa usuaria de Simplifica CRM',
 'admin@empresa.es',
 'dpo@empresa.es',
 'Gestión de empleados y usuarios del sistema',
 'Administración de cuentas de usuario, asignación de roles y permisos en Simplifica CRM.',
 ARRAY['Empleados', 'Colaboradores'],
 ARRAY['Nombre', 'Email corporativo', 'Rol', 'Registros de actividad'],
 ARRAY[]::TEXT[],
 ARRAY['Supabase (encargado de tratamiento, UE)'],
 NULL,
 'Ejecución de contrato (Art. 6.1.b) / Obligación legal (Art. 6.1.c)',
 false
),

-- 3.6 Portal de cliente
(NULL,
 'Empresa usuaria de Simplifica CRM',
 'admin@empresa.es',
 'dpo@empresa.es',
 'Portal de autoservicio para clientes',
 'Acceso de clientes a sus facturas, presupuestos y tickets de soporte a través del portal web.',
 ARRAY['Clientes finales', 'Contactos de empresa'],
 ARRAY['Email', 'Nombre', 'Historial de facturas y presupuestos', 'Tickets de soporte'],
 ARRAY[]::TEXT[],
 ARRAY['Supabase (encargado de tratamiento, UE)', 'Vercel (alojamiento, EE.UU. — CCT)'],
 '{"Vercel": {"country": "USA", "safeguard": "Standard Contractual Clauses (Art. 46.2c)"}}',
 'Ejecución de contrato (Art. 6.1.b) / Interés legítimo (Art. 6.1.f)',
 false
);
    END IF;
END;
$$;

-- ── 4. Helper: exportar Art. 30 como JSONB (para descarga PDF/auditoría) ─────

CREATE OR REPLACE FUNCTION gdpr_export_processing_registry(p_company_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT jsonb_build_object(
        'exported_at',   now(),
        'version',       '1.0',
        'activities',    jsonb_agg(to_jsonb(a) ORDER BY a.activity_name)
    )
    FROM public.gdpr_processing_activities a
    WHERE a.status = 'active'
      AND (p_company_id IS NULL OR a.company_id IS NULL OR a.company_id = p_company_id);
$$;
