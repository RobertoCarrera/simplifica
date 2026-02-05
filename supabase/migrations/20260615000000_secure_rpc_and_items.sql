-- Migration: Secure RPC and Child Tables
-- Date: 2026-06-15
-- Objective: Fix insecure reliance on public.users.company_id and enforce RLS on invoice_items/quote_items

-- 1. FIX RPC convert_quote_to_invoice
CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(p_quote_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, temp
AS $$
DECLARE
    v_quote record;
    v_invoice_id UUID;
    v_user_company_id UUID;
    v_client_id UUID;
BEGIN
    -- Check if user is a staff member of the quote's company
    SELECT company_id INTO v_user_company_id
    FROM public.company_members
    WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND status = 'active'
    LIMIT 1;

    -- If not staff, check if user is a client
    IF v_user_company_id IS NULL THEN
        SELECT id INTO v_client_id
        FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        LIMIT 1;
    END IF;

    -- Load the quote
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;

    IF v_quote IS NULL THEN
        RAISE EXCEPTION 'Presupuesto no encontrado';
    END IF;

    -- SECURITY CHECK
    IF v_user_company_id IS NOT NULL THEN
        -- Staff: Must belong to the same company
        IF v_quote.company_id != v_user_company_id THEN
             RAISE EXCEPTION 'Acceso denegado: El presupuesto pertenece a otra organización';
        END IF;
    ELSIF v_client_id IS NOT NULL THEN
        -- Client: Must be the owner of the quote
        IF v_quote.client_id != v_client_id THEN
             RAISE EXCEPTION 'Acceso denegado: No eres el titular de este presupuesto';
        END IF;
    ELSE
        RAISE EXCEPTION 'Usuario no autorizado para esta operación';
    END IF;

    -- Proceed with conversion
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

    -- Copy items
    INSERT INTO public.invoice_items (
        invoice_id, description, quantity, unit_price, tax_rate, total
    )
    SELECT
        v_invoice_id,
        description,
        quantity,
        unit_price,
        0, -- Default tax rate
        total
    FROM public.quote_items
    WHERE quote_id = p_quote_id;

    -- Update quote status
    UPDATE public.quotes
    SET status = 'invoiced', invoice_id = v_invoice_id
    WHERE id = p_quote_id;

    RETURN v_invoice_id;
END;
$$;

-- 2. ENABLE RLS ON CHILD TABLES (invoice_items, quote_items)
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- Policy for invoice_items (SELECT)
DROP POLICY IF EXISTS "invoice_items_select_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_select_policy" ON public.invoice_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    LEFT JOIN public.company_members cm ON (
        cm.company_id = i.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
    )
    WHERE i.id = invoice_items.invoice_id
    AND (
      cm.id IS NOT NULL -- User is staff of the company
      OR
      i.client_id IN ( -- OR User is the client
        SELECT id FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    )
  )
);

-- Policy for invoice_items (INSERT/UPDATE/DELETE) - Staff Only
DROP POLICY IF EXISTS "invoice_items_write_policy" ON public.invoice_items;
CREATE POLICY "invoice_items_write_policy" ON public.invoice_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.company_members cm ON cm.company_id = i.company_id
    WHERE i.id = invoice_items.invoice_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
  )
);

-- Policy for quote_items (SELECT)
DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
CREATE POLICY "quote_items_select_policy" ON public.quote_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    LEFT JOIN public.company_members cm ON (
        cm.company_id = q.company_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
    )
    WHERE q.id = quote_items.quote_id
    AND (
      cm.id IS NOT NULL
      OR
      q.client_id IN (
        SELECT id FROM public.clients
        WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
      )
    )
  )
);

-- Policy for quote_items (WRITE) - Staff Only
DROP POLICY IF EXISTS "quote_items_write_policy" ON public.quote_items;
CREATE POLICY "quote_items_write_policy" ON public.quote_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    WHERE q.id = quote_items.quote_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.company_members cm ON cm.company_id = q.company_id
    WHERE q.id = quote_items.quote_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
  )
);
