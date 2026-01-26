-- Fix RLS Regression: UUID Mismatch in company_members and Missing Child Table Policies

-- 1. Fix company_members Policies (UUID Mismatch)
DROP POLICY IF EXISTS "Users can view own memberships" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can view members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can update members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can delete members" ON public.company_members;

-- Policy: Users can view their own memberships
CREATE POLICY "Users can view own memberships" ON public.company_members
    FOR SELECT USING (
        user_id = (
            SELECT id FROM public.users
            WHERE auth_user_id = auth.uid()
            LIMIT 1
        )
    );

-- Policy: Company Admins/Owners can view members
CREATE POLICY "Company admins can view members" ON public.company_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            JOIN public.users u ON u.id = requester.user_id
            WHERE u.auth_user_id = auth.uid()
            AND requester.company_id = company_members.company_id
            AND requester.role IN ('owner', 'admin')
            AND requester.status = 'active'
        )
    );

-- Policy: Company Admins/Owners can update members
CREATE POLICY "Company admins can update members" ON public.company_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            JOIN public.users u ON u.id = requester.user_id
            WHERE u.auth_user_id = auth.uid()
            AND requester.company_id = company_members.company_id
            AND requester.role IN ('owner', 'admin')
            AND requester.status = 'active'
        )
    );

-- Policy: Company Admins/Owners can delete members
CREATE POLICY "Company admins can delete members" ON public.company_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            JOIN public.users u ON u.id = requester.user_id
            WHERE u.auth_user_id = auth.uid()
            AND requester.company_id = company_members.company_id
            AND requester.role IN ('owner', 'admin')
            AND requester.status = 'active'
        )
    );

-- 2. Secure Child Tables (invoice_items, quote_items)

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- invoice_items policies (Read/Write for Company Members)
CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            JOIN public.users u ON u.id = cm.user_id
            WHERE i.id = invoice_items.invoice_id
            AND u.auth_user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

CREATE POLICY "invoice_items_write_policy" ON public.invoice_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            JOIN public.users u ON u.id = cm.user_id
            WHERE i.id = invoice_items.invoice_id
            AND u.auth_user_id = auth.uid()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- quote_items policies (Read/Write for Company Members)
CREATE POLICY "quote_items_select_policy" ON public.quote_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON cm.company_id = q.company_id
            JOIN public.users u ON u.id = cm.user_id
            WHERE q.id = quote_items.quote_id
            AND u.auth_user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quote_items_write_policy" ON public.quote_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON cm.company_id = q.company_id
            JOIN public.users u ON u.id = cm.user_id
            WHERE q.id = quote_items.quote_id
            AND u.auth_user_id = auth.uid()
            AND cm.status = 'active'
        )
    );
