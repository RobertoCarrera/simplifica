-- =====================================================
-- Restore service_variants.is_hidden (legacy variant hiding)
-- =====================================================
-- Context: migration 20260624_centralize_visibility_at_service_level.sql
-- moved visibility to the service level and dropped is_hidden.
-- Roberto's feedback: some variants need to be hidden from the catalog
-- (e.g. previous-year pricing tiers) while remaining referenceable by
-- historical quotes/invoices. The variant ID stays the same, so old
-- documents keep working, but the variant does not appear in the
-- public catalog or the portal.
--
-- This migration re-adds is_hidden as a single boolean and includes
-- it in the consolidated_service_variants_select RLS policy so that
-- hidden variants are filtered out server-side.
--
-- Service-level visibility (is_public, is_visible_in_portal) is
-- unaffected. Variant-level hiding is an additional, independent axis.
-- =====================================================

-- 1. Re-add the column. Default false = visible (current state preserved).
ALTER TABLE public.service_variants
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- 2. Index for fast filtering on the public catalog.
CREATE INDEX IF NOT EXISTS idx_service_variants_active_visible
  ON public.service_variants (service_id, is_active, is_hidden)
  WHERE is_active = true AND is_hidden = false;

-- 3. Update consolidated_service_variants_select to also exclude
--    hidden variants for the non-staff paths. Staff users (matched
--    via company_id) still see hidden variants so they can manage them.
DROP POLICY IF EXISTS "consolidated_service_variants_select" ON public.service_variants;

CREATE POLICY "consolidated_service_variants_select"
  ON public.service_variants
  FOR SELECT
  TO authenticated, anon
  USING (
    -- Staff: see ALL variants of their company, including hidden ones.
    service_id IN (
      SELECT s.id FROM public.services s
      WHERE s.company_id = get_auth_user_company_id()
    )
    OR
    -- Public/anon: only see visible+active variants of public services.
    (
      is_active = true
      AND is_hidden = false
      AND service_id IN (
        SELECT s.id FROM public.services s WHERE s.is_public = true
      )
    )
    OR
    -- Client with assignment: see their assigned variants (variant_id set)
    -- or all visible+active variants of assigned services (variant_id null).
    id IN (
      SELECT csa.variant_id FROM public.client_service_assignments csa
      WHERE csa.client_id IN (
        SELECT clients.id FROM clients WHERE clients.auth_user_id = auth.uid()
      )
      AND (
        csa.variant_id IS NOT NULL
        OR (
          csa.variant_id IS NULL
          AND is_active = true
          AND is_hidden = false
        )
      )
    )
  );

-- 4. Comment for future readers.
COMMENT ON COLUMN public.service_variants.is_hidden IS
  'Hidden variants stay in the DB (referenced by old quotes/invoices) but do not appear in the catalog or portal. Independent from is_active (which disables the variant entirely).';