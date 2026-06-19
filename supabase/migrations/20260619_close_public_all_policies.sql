-- ============================================================================
-- Migration: Restrict public ALL policies on global catalog tables
-- ============================================================================
-- Security fix (Rafter v0.2 audit): 7 tables had policies with
-- roles={public} and cmd=ALL, allowing ANY visitor (no auth) to
-- INSERT/UPDATE/DELETE rows in:
--   - class_type_levels
--   - class_types (two duplicate policies)
--   - levels
--   - programa_bonos
--   - programa_clases
--   - programas
--
-- These tables are global catalogs with no company_id. The correct
-- model is: backend manages them, frontend reads via service_role
-- or RPC. Drop ALL policies on PUBLIC role and replace with a single
-- authenticated-read policy (no anon reads either).
-- ============================================================================

DROP POLICY IF EXISTS public_read_write_ctl ON public.class_type_levels;
DROP POLICY IF EXISTS public_read_write ON public.class_types;
DROP POLICY IF EXISTS public_read_write_class_types ON public.class_types;
DROP POLICY IF EXISTS public_read_write_levels ON public.levels;
DROP POLICY IF EXISTS "Allow all access to programa_bonos" ON public.programa_bonos;
DROP POLICY IF EXISTS "Allow all access to programa_clases" ON public.programa_clases;
DROP POLICY IF EXISTS "Allow all access to programas" ON public.programas;

CREATE POLICY class_type_levels_read ON public.class_type_levels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY class_types_read ON public.class_types
  FOR SELECT TO authenticated USING (true);

CREATE POLICY levels_read ON public.levels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY programa_bonos_read ON public.programa_bonos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY programa_clases_read ON public.programa_clases
  FOR SELECT TO authenticated USING (true);

CREATE POLICY programas_read ON public.programas
  FOR SELECT TO authenticated USING (true);

-- service_role retains full access implicitly (bypasses RLS)