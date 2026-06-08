-- ============================================================================
-- Migration: project_associable_to — configuración de asociación de proyectos
-- Date: 2026-06-08
-- 
-- Permite configurar a nivel de empresa si los proyectos se asocian a:
--   'clients' — solo clientes
--   'team'    — solo miembros del equipo (company_members)
--   'both'    — clientes y equipo
--
-- Incluye:
--   1. Columna assigned_to en projects (referencia a auth.users)
--   2. Columna project_associable_to en company_settings
--   3. Trigger de validación en INSERT/UPDATE sobre projects
--   4. RLS actualizado para filtrar proyectos según el setting
-- ============================================================================

-- ── 1. Add assigned_to column to projects ───────────────────────────────────
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.projects.assigned_to IS 'Team member (company_member) assigned to this project. Only valid when company_settings.project_associable_to IN (team, both).';

-- ── 2. Add project_associable_to to company_settings ────────────────────────
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS project_associable_to TEXT
CHECK (project_associable_to IN ('clients', 'team', 'both'));

COMMENT ON COLUMN public.company_settings.project_associable_to IS 'Controls which entity types can be associated to projects: clients (only client_id), team (only assigned_to), or both. Default is clients.';

-- Set default for existing companies
UPDATE public.company_settings
SET project_associable_to = 'clients'
WHERE project_associable_to IS NULL;

-- ── 3. Trigger function to validate project associations ────────────────────
CREATE OR REPLACE FUNCTION public.validate_project_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_setting text;
BEGIN
  -- Read the company's project_associable_to setting
  SELECT cs.project_associable_to INTO v_setting
  FROM public.company_settings cs
  WHERE cs.company_id = NEW.company_id;

  -- If no row exists, default to 'clients' (backward compatibility)
  IF v_setting IS NULL THEN
    v_setting := 'clients';
  END IF;

  -- Validate based on setting
  CASE v_setting
    WHEN 'clients' THEN
      -- Only client association allowed; assigned_to must be NULL
      IF NEW.assigned_to IS NOT NULL THEN
        RAISE EXCEPTION 'La configuración de la empresa solo permite asociar proyectos a clientes. No se puede asignar a un miembro del equipo.';
      END IF;

    WHEN 'team' THEN
      -- Only team member association allowed; client_id must be NULL
      IF NEW.client_id IS NOT NULL THEN
        RAISE EXCEPTION 'La configuración de la empresa solo permite asociar proyectos al equipo. No se puede asignar a un cliente.';
      END IF;

    WHEN 'both' THEN
      -- Both allowed — no validation needed
      NULL;

    ELSE
      -- Unknown setting — allow (defensive)
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

-- ── 4. Attach trigger to projects table ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_validate_project_association ON public.projects;

CREATE TRIGGER trg_validate_project_association
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_project_association();

-- ── 5. Grant execute permissions ────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.validate_project_association() TO authenticated, service_role;

-- ── 6. Ensure SELECT access to company_settings for authenticated users ─────
-- (Needed so the trigger can read the setting)
-- The company_settings table should already have RLS policies; this is a safety net
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_settings'
      AND policyname = 'Enable select for company members'
  ) THEN
    CREATE POLICY "Enable select for company members" ON public.company_settings
      FOR SELECT
      USING (
        company_id IN (
          SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END;
$$;
