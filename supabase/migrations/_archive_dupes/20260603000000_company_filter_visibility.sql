-- ============================================
-- Company Filter Visibility
-- ============================================
-- Adds filter_definitions (system-wide booking filters)
-- and company_filter_visibility (per-company toggles).
-- Replaces the JSONB companies.settings.enabled_filters pattern
-- with a proper relational model for the "Filtros Visibles en el Portal"
-- section of Reservas > Configuración > General.
-- ============================================

-- STEP 1: Create filter_definitions table
-- These are the canonical list of all available filters
-- for the public booking portal.

CREATE TABLE IF NOT EXISTS public.filter_definitions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.filter_definitions IS
  'System-wide booking portal filter definitions. Seeded once, never deleted.';

COMMENT ON COLUMN public.filter_definitions.id IS
  'Unique filter key (e.g. services, professionals, duration)';
COMMENT ON COLUMN public.filter_definitions.icon IS
  'FontAwesome icon class (e.g. fa-concierge-bell)';

-- STEP 2: Seed the three known filters

INSERT INTO public.filter_definitions (id, label, icon, sort_order)
VALUES
  ('services', 'Por Servicio', 'fa-concierge-bell', 1),
  ('professionals', 'Por Profesional', 'fa-user-tie', 2),
  ('duration', 'Por Duración', 'fa-clock', 3)
ON CONFLICT (id) DO NOTHING;

-- STEP 3: Create company_filter_visibility table

CREATE TABLE IF NOT EXISTS public.company_filter_visibility (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  filter_id TEXT NOT NULL REFERENCES public.filter_definitions(id) ON DELETE CASCADE,
  visible BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (company_id, filter_id)
);

COMMENT ON TABLE public.company_filter_visibility IS
  'Per-company filter visibility toggles. Absence of a row = filter is visible (default).';

-- STEP 4: Enable RLS

ALTER TABLE public.filter_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_filter_visibility ENABLE ROW LEVEL SECURITY;

-- STEP 5: RLS policies for filter_definitions (read-only for all authenticated)

DROP POLICY IF EXISTS "filter_definitions_select" ON public.filter_definitions;
CREATE POLICY "filter_definitions_select" ON public.filter_definitions
  FOR SELECT USING (true);  -- public read, system table

-- STEP 6: RLS policies for company_filter_visibility

-- SELECT: any authenticated user in the company can read
DROP POLICY IF EXISTS "company_filter_visibility_select" ON public.company_filter_visibility;
CREATE POLICY "company_filter_visibility_select" ON public.company_filter_visibility
  FOR SELECT USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- INSERT/UPDATE/DELETE: only owner, super_admin, or admin
DROP POLICY IF EXISTS "company_filter_visibility_write" ON public.company_filter_visibility;
CREATE POLICY "company_filter_visibility_write" ON public.company_filter_visibility
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = company_filter_visibility.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = company_filter_visibility.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'super_admin', 'admin')
    )
  );

-- STEP 7: Public read access for filter_definitions (needed by unauthenticated public portal)
-- The public portal needs to read filter_definitions to know what filters exist.
-- RLS on filter_definitions already allows public SELECT (policy above).

-- STEP 8: Helper function to seed default visibility for a company
-- Called when a new company is created (or for backfill).

CREATE OR REPLACE FUNCTION public.seed_company_filter_visibility(p_company_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_filter_visibility (company_id, filter_id, visible)
  SELECT p_company_id, fd.id, true
  FROM public.filter_definitions fd
  ON CONFLICT (company_id, filter_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_company_filter_visibility TO authenticated;

-- STEP 9: Backfill existing companies with default (all visible)
DO $$
DECLARE
  rec UUID;
BEGIN
  FOR rec IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_company_filter_visibility(rec);
  END LOOP;
END;
$$;
