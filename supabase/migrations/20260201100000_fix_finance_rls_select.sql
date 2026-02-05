-- Migration: Fix RLS SELECT policies for Invoices and Quotes (Security Critical)
-- Date: 2026-02-01 10:00:00
-- Description: Previous policies incorrectly compared auth.uid() (Auth UUID) with company_members.user_id (Public UUID).
--              This migration fixes the comparison by using public.get_my_public_id() or a subquery.

-- 1. FIX INVOICES SELECT POLICY
DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;

CREATE POLICY "invoices_select_policy" ON public.invoices
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = public.get_my_public_id()
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
        )
        AND deleted_at IS NULL
    );

-- 2. FIX QUOTES SELECT POLICY
DROP POLICY IF EXISTS "quotes_select_policy_new" ON public.quotes;

CREATE POLICY "quotes_select_policy_new" ON public.quotes
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = public.get_my_public_id()
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

-- 3. VERIFICATION (Commented out, for manual execution)
-- SELECT count(*) FROM public.invoices; -- Should now return rows for the logged-in user's company.
