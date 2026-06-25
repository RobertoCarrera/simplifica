-- ============================================================================
-- Migration: Centralize visibility at service level
-- ============================================================================
-- Replaces per-variant visibility (variant_channel_visibility + is_hidden)
-- with per-service visibility in services table:
--   - is_public (existing): controls Agenda visibility
--   - is_visible_in_portal (NEW): controls Portal visibility
--
-- Replaces client_variant_assignments with client_service_assignments where
-- variant_id becomes nullable. If variant_id is set, the client sees only
-- that variant. If null, the client sees all variants of that service.
--
-- Removes variant_channel_visibility (no more per-variant visibility).
-- Removes is_hidden from service_variants (deprecated).
-- ============================================================================

-- 1. Add new column to services
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_visible_in_portal boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.services.is_visible_in_portal IS
  'When true, the service appears in the client portal catalog. Independent of is_public (Agenda).';

-- 2. Rename client_variant_assignments -> client_service_assignments
--    and make variant_id nullable (NULL = all variants of this service)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'client_variant_assignments'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'client_service_assignments'
  ) THEN
    ALTER TABLE public.client_variant_assignments RENAME TO client_service_assignments;
  END IF;
END $$;

ALTER TABLE public.client_service_assignments
  ALTER COLUMN variant_id DROP NOT NULL;

COMMENT ON TABLE public.client_service_assignments IS
  'Per-client service overrides. variant_id NULL = client sees all variants of the service. variant_id set = client sees only that variant (precio personalizado).';

-- 3. Drop variant_channel_visibility (per-variant visibility removed)
DROP TABLE IF EXISTS public.variant_channel_visibility CASCADE;

-- 4. Drop is_hidden column from service_variants (deprecated, visibility now service-level)
ALTER TABLE public.service_variants
  DROP COLUMN IF EXISTS is_hidden;

-- 5. Update the consolidated_service_variants_select policy.
--    Previously it filtered by (is_active = true AND is_hidden = false).
--    Now: variants inherit visibility from their parent service.
--    The check moves to:
--      - staff: see all variants
--      - anon/visitor: see variants of services where is_public=true (Agenda) — handled by BFF filtering, not RLS
--      - authenticated client with assignment: see assigned variants (variant_id set) OR all variants of assigned services (variant_id null)
DROP POLICY IF EXISTS "consolidated_service_variants_select" ON public.service_variants;

CREATE POLICY "consolidated_service_variants_select"
  ON public.service_variants
  FOR SELECT
  TO authenticated, anon
  USING (
    service_id IN (
      SELECT s.id FROM public.services s
      WHERE (s.company_id = get_auth_user_company_id())
         OR (s.is_public = true)
         OR (s.id IN (
              SELECT qi.service_id
              FROM quote_items qi
              JOIN quotes q ON q.id = qi.quote_id
              WHERE q.client_id IN (SELECT clients.id FROM clients WHERE clients.auth_user_id = auth.uid())
         ))
    )
    AND (
      -- 1. Staff of the company: see everything
      service_id IN (SELECT id FROM public.services WHERE company_id = get_auth_user_company_id())
      OR
      -- 2. Authenticated client with explicit assignment to this service or variant
      (
        is_active = true
        AND service_id IN (
          SELECT csa.service_id FROM public.client_service_assignments csa
          JOIN clients c ON c.id = csa.client_id
          WHERE c.auth_user_id = auth.uid()
            AND (csa.variant_id IS NULL OR csa.variant_id = service_variants.id)
        )
      )
    )
  );

-- 6. Update RLS policies for client_service_assignments (renamed from client_variant_assignments)
--    Drop old ones, recreate with same logic but on new table name
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.client_service_assignments;
DROP POLICY IF EXISTS "Company users can manage client variant assignments" ON public.client_service_assignments;
DROP POLICY IF EXISTS "Members can manage own company variant assignments" ON public.client_service_assignments;
DROP POLICY IF EXISTS "Clients can view their own variant assignments" ON public.client_service_assignments;
DROP POLICY IF EXISTS "Company users can view client variant assignments" ON public.client_service_assignments;
DROP POLICY IF EXISTS "Members can view own company variant assignments" ON public.client_service_assignments;

-- Recreate with new table name
CREATE POLICY "Staff can view service assignments"
  ON public.client_service_assignments
  FOR SELECT
  TO authenticated
  USING (
    service_id IN (
      SELECT s.id FROM public.services s
      JOIN public.company_members cm ON cm.company_id = s.company_id
      JOIN public.users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
    )
  );

CREATE POLICY "Staff can manage service assignments"
  ON public.client_service_assignments
  FOR ALL
  TO authenticated
  USING (
    service_id IN (
      SELECT s.id FROM public.services s
      JOIN public.company_members cm ON cm.company_id = s.company_id
      JOIN public.users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
    )
  )
  WITH CHECK (
    service_id IN (
      SELECT s.id FROM public.services s
      JOIN public.company_members cm ON cm.company_id = s.company_id
      JOIN public.users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
    )
  );

CREATE POLICY "Clients can view their own service assignments"
  ON public.client_service_assignments
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE auth_user_id = auth.uid()
    )
  );
