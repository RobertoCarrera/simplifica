-- 20260520000000_fix_rls_uuid_mismatch.sql

-- SECURITY FIX: RLS UUID MISMATCH & CHILD TABLE PROTECTION
-- This migration fixes a critical issue where auth.uid() was compared directly to public.users.id.
-- It also restores missing RLS policies for child tables (invoice_items, quote_items).

-- 1. Helper Function for Performance & Security
-- Instead of repeating the subquery, let's create a stable function to get the current public user ID.
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid();
$$;

-- 2. FIX COMPANY MEMBERS RLS
-- Drop broken policies
DROP POLICY IF EXISTS "Users can view own memberships" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can view members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can update members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can delete members" ON public.company_members;

-- Recreate policies using get_current_user_id()
CREATE POLICY "Users can view own memberships" ON public.company_members
    FOR SELECT USING (user_id = get_current_user_id());

CREATE POLICY "Company admins can view members" ON public.company_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id = get_current_user_id()
            AND requester.company_id = company_members.company_id
            AND requester.status = 'active'
            AND requester.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Company admins can manage members" ON public.company_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id = get_current_user_id()
            AND requester.company_id = company_members.company_id
            AND requester.status = 'active'
            AND requester.role IN ('owner', 'admin')
        )
    );

-- 3. FIX INVOICES RLS
-- Drop broken policies (referencing 20260129160000 and 20260107022000)
DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_policy" ON public.invoices;
-- Drop legacy ones just in case
DROP POLICY IF EXISTS "invoices_select_company" ON public.invoices;

CREATE POLICY "invoices_select_policy" ON public.invoices
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = get_current_user_id()
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "invoices_insert_policy" ON public.invoices
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = get_current_user_id()
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
            -- Allow all active members to create invoices, or restrict to admin/owner?
            -- Sticking to previous logic: active members.
        )
    );

CREATE POLICY "invoices_update_policy" ON public.invoices
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = get_current_user_id()
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "invoices_delete_policy" ON public.invoices
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = get_current_user_id()
            AND cm.company_id = invoices.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin') -- Only admins can delete
        )
    );

-- 4. FIX QUOTES RLS
DROP POLICY IF EXISTS "quotes_select_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_insert_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_update_policy_new" ON public.quotes;
DROP POLICY IF EXISTS "quotes_delete_policy_new" ON public.quotes;

CREATE POLICY "quotes_select_policy" ON public.quotes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = get_current_user_id()
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quotes_insert_policy" ON public.quotes
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = get_current_user_id()
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quotes_update_policy" ON public.quotes
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = get_current_user_id()
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
        )
    );

CREATE POLICY "quotes_delete_policy" ON public.quotes
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.user_id = get_current_user_id()
            AND cm.company_id = quotes.company_id
            AND cm.status = 'active'
            AND cm.role IN ('owner', 'admin')
        )
    );

-- 5. SECURE CHILD TABLES (Invoice Items & Quote Items)
-- These tables were missing RLS. We must enable it and add policies.

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_policy" ON public.invoice_items;
DROP POLICY IF EXISTS "quote_items_policy" ON public.quote_items;

-- Invoice Items Policy: Join to Invoices -> Join to Company Members
CREATE POLICY "invoice_items_policy" ON public.invoice_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            JOIN public.company_members cm ON i.company_id = cm.company_id
            WHERE i.id = invoice_items.invoice_id
            AND cm.user_id = get_current_user_id()
            AND cm.status = 'active'
        )
    );

-- Quote Items Policy
CREATE POLICY "quote_items_policy" ON public.quote_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            JOIN public.company_members cm ON q.company_id = cm.company_id
            WHERE q.id = quote_items.quote_id
            AND cm.user_id = get_current_user_id()
            AND cm.status = 'active'
        )
    );

-- 6. FIX Convert Quote RPC (Legacy user check)
CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
DECLARE
    v_quote record;
    v_invoice_id UUID;
    v_current_user_id UUID;
    v_is_staff BOOLEAN;
    v_client_id UUID;
BEGIN
    v_current_user_id := get_current_user_id();

    -- Check if user is staff (member of any company)
    -- Optimize: check membership for the quote's company LATER.

    -- Cargar el presupuesto
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- VALIDACIÓN DE SEGURIDAD STRICTA
    -- 1. Check if user is an active member of the quote's company
    SELECT EXISTS (
        SELECT 1 FROM public.company_members
        WHERE user_id = v_current_user_id
        AND company_id = v_quote.company_id
        AND status = 'active'
    ) INTO v_is_staff;

    IF v_is_staff THEN
        -- Allowed
    ELSE
        -- 2. Check if user is the client (Portal)
        -- Assuming clients table links to auth via email or other means?
        -- The previous code used: SELECT id FROM clients WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        -- Let's keep that pattern but be careful.
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        LIMIT 1;

        IF v_client_id IS NOT NULL AND v_quote.client_id = v_client_id THEN
             -- Allowed
        ELSE
             RAISE EXCEPTION 'Acceso denegado: No tienes permiso para convertir este presupuesto.';
        END IF;
    END IF;

    -- Lógica original de conversión
    INSERT INTO public.invoices (
        company_id, client_id, invoice_date, status, total, currency,
        invoice_type, notes
    ) VALUES (
        v_quote.company_id,
        v_quote.client_id,
        CURRENT_DATE,
        'draft',
        v_quote.total_amount,
        'EUR',
        'normal',
        'Generado desde presupuesto ' || v_quote.quote_number
    ) RETURNING id INTO v_invoice_id;

    -- Copiar items
    INSERT INTO public.invoice_items (
        invoice_id, description, quantity, unit_price, tax_rate, total
    )
    SELECT
        v_invoice_id,
        description,
        quantity,
        unit_price,
        0,
        total
    FROM public.quote_items
    WHERE quote_id = p_quote_id;

    -- Marcar presupuesto como facturado
    UPDATE public.quotes
    SET status = 'invoiced', invoice_id = v_invoice_id
    WHERE id = p_quote_id;

    RETURN v_invoice_id;
END;
$$;
