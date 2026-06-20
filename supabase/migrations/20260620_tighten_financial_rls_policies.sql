-- ============================================================================
-- Migration: Tighten RLS policies on financial tables (Rafter v0.7 audit)
-- ============================================================================
-- Rafter v0.7 audit: 8 RLS policies on critical financial tables
-- (invoice_items, quote_items, invoices_professional_select) had
-- roles={public} with qual clauses that depend on get_user_company_id().
-- While the qual evaluated to NULL for anon users (correctly denying
-- access), the pattern is dangerous:
--
--   1. It relies on get_user_company_id() returning NULL for anon,
--      which depends on auth.uid() being NULL — a fragile invariant
--      if the JWT layer is ever misconfigured.
--   2. It allows future maintenance to accidentally widen the
--      qual without remembering to update roles.
--   3. It signals to anyone reading the policy that anon access
--      is intended, which it is not.
--
-- Fix: change roles to {authenticated}. The qual clauses are
-- unchanged — they continue to verify company ownership via
-- get_user_company_id() (which returns the user's company for
-- authenticated users, NULL otherwise).
-- ============================================================================

-- invoice_items: tighten 4 policies from {public} to {authenticated}
DROP POLICY IF EXISTS invoice_items_select_company ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_insert_company ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_update_company ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_delete_company ON public.invoice_items;

CREATE POLICY invoice_items_select_company ON public.invoice_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND invoices.company_id = get_user_company_id()
    )
  );

CREATE POLICY invoice_items_insert_company ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND invoices.company_id = get_user_company_id()
    )
  );

CREATE POLICY invoice_items_update_company ON public.invoice_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND invoices.company_id = get_user_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND invoices.company_id = get_user_company_id()
    )
  );

CREATE POLICY invoice_items_delete_company ON public.invoice_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
        AND invoices.company_id = get_user_company_id()
    )
  );

-- quote_items: tighten 3 policies from {public} to {authenticated}
DROP POLICY IF EXISTS quote_items_insert_policy ON public.quote_items;
DROP POLICY IF EXISTS quote_items_update_policy ON public.quote_items;
DROP POLICY IF EXISTS quote_items_delete_policy ON public.quote_items;

CREATE POLICY quote_items_insert_policy ON public.quote_items
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY quote_items_update_policy ON public.quote_items
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY quote_items_delete_policy ON public.quote_items
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- invoices: tighten 1 policy from {public} to {authenticated}
DROP POLICY IF EXISTS invoices_professional_select ON public.invoices;
CREATE POLICY invoices_professional_select ON public.invoices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM professionals p
      JOIN company_members cm ON ((cm.user_id = p.user_id AND cm.company_id = invoices.company_id))
      WHERE p.user_id = auth.uid()
        AND cm.status = 'active'
        AND EXISTS (
          SELECT 1 FROM client_assignments ca
          WHERE ca.professional_id = p.id AND ca.client_id = invoices.client_id
        )
    )
  );

COMMENT ON POLICY invoice_items_select_company ON public.invoice_items IS
  'Authenticated users only. Anon access denied (Rafter v0.7 audit).';
COMMENT ON POLICY quote_items_select_policy ON public.quote_items IS
  'Authenticated users only. Anon access denied (Rafter v0.7 audit).';
COMMENT ON POLICY invoices_professional_select ON public.invoices IS
  'Authenticated users only. Anon access denied (Rafter v0.7 audit).';