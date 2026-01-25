-- Enable RLS on child tables
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- 1. INVOICE ITEMS Policies

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_policy" ON public.invoice_items;

-- Select: Active company members can view items of invoices they have access to
CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

-- Insert: Owner/Admin active members can insert items
CREATE POLICY "invoice_items_insert_policy" ON public.invoice_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- Update: Owner/Admin active members can update items
CREATE POLICY "invoice_items_update_policy" ON public.invoice_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- Delete: Owner/Admin active members can delete items
CREATE POLICY "invoice_items_delete_policy" ON public.invoice_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- 2. QUOTE ITEMS Policies

-- Drop existing policies
DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_insert_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_update_policy" ON public.quote_items;
DROP POLICY IF EXISTS "quote_items_delete_policy" ON public.quote_items;

-- Select
CREATE POLICY "quote_items_select_policy" ON public.quote_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON cm.company_id = q.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
        )
    );

-- Insert
CREATE POLICY "quote_items_insert_policy" ON public.quote_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON cm.company_id = q.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- Update
CREATE POLICY "quote_items_update_policy" ON public.quote_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON cm.company_id = q.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- Delete
CREATE POLICY "quote_items_delete_policy" ON public.quote_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON cm.company_id = q.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = auth.uid()
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );
