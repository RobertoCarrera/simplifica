-- 20260204_fix_quotes_rls_and_permissions.sql

-- SECURITY FIX: Update Quotes RLS to match robust Invoices logic
-- Solves "new row violates row-level security policy for table quotes"

-- 1. Drop potentially outdated/conflicting policies on quotes
DROP POLICY IF EXISTS "quotes_select_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_select_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy_new" ON public.quotes;

-- 2. Create standardized policies using company_members check
-- SELECT: Members can view quotes of their company
CREATE POLICY "quotes_select_policy" ON public.quotes
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

-- INSERT: Members can create quotes for their company
CREATE POLICY "quotes_insert_policy" ON public.quotes
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

-- UPDATE: Members can update quotes of their company (logic for status changes handled by app usually)
CREATE POLICY "quotes_update_policy" ON public.quotes
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

-- DELETE: Members (maybe restricted to Owner/Admin in future) can delete quotes
CREATE POLICY "quotes_delete_policy" ON public.quotes
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

-- 3. Ensure Invoices policies are also correct (Redundant safety check)
-- Dropping old ones just in case loose ends remain
DROP POLICY IF EXISTS "invoices_insert_company" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_company" ON public.invoices;

-- (The policies involving company_members created in 20260129... are good, we leave them or recreate if missing)
-- Checking existence before creating avoids errors if they already exist, but "CREATE POLICY IF NOT EXISTS" isn't standard PG.
-- We assume 20260129... migration ran. If not, these would need to be created.
-- For safety, let's explicitly recreate the INSERT policy for invoices to be 100% sure the "Nueva Factura" button works.

DROP POLICY IF EXISTS "invoices_insert_policy" ON public.invoices;
CREATE POLICY "invoices_insert_policy" ON public.invoices
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND cm.company_id = invoices.company_id
    AND cm.status = 'active'
  )
);
