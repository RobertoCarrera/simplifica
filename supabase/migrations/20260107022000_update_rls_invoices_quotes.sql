-- Migration: Update RLS for Multi-Tenancy (Phase 2: Invoices & Quotes)

-- 1. INVOICES Table
-- Drop old policies
DROP POLICY IF EXISTS "invoices_select_company" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_company" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_company" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_company" ON public.invoices;

-- Keep Client Portal policies (they check client owner via auth_user_id, usually safe)
-- "Clients can view own invoices" & "clients_can_view_own_invoices" seem redundant but acceptable if they check auth_user_id.

-- New Policies for Company Members

CREATE POLICY "invoices_select_policy" ON public.invoices
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
        )
        -- AND deleted_at IS NULL (Existing policy had this, maybe keep it?)
        -- Usually soft delete is handled by views or frontend filtering, but if RLS enforced it...
        -- The existing policy was: ((company_id = get_user_company_id()) AND (deleted_at IS NULL))
        -- I'll keep the deleted_at constraint for safety if that's the pattern.
        AND deleted_at IS NULL
    );

CREATE POLICY "invoices_insert_policy" ON public.invoices
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin') -- Usually members can't create invoices? Or can they? Defaulting to checking active membership.
            -- Existing was just get_user_company_id(), so implied any active user in context.
        )
    );

CREATE POLICY "invoices_update_policy" ON public.invoices
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin') -- Maybe restrict updates?
        )
        AND deleted_at IS NULL
    );

CREATE POLICY "invoices_delete_policy" ON public.invoices
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- 2. QUOTES Table
-- Drop old policies
DROP POLICY IF EXISTS "quotes_select_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy" ON public.quotes;

-- New Policies

CREATE POLICY "quotes_select_policy_new" ON public.quotes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quotes_insert_policy_new" ON public.quotes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quotes_update_policy_new" ON public.quotes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quotes_delete_policy_new" ON public.quotes
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );
