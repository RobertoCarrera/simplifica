-- Migration: Client Functions (Invoices & Quotes)

-- 1. mark_invoice_local_payment_rpc
CREATE OR REPLACE FUNCTION mark_invoice_local_payment_rpc(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_mapped_client_id uuid;
    v_mapped_company_id uuid;
    v_current_status text;
    v_payment_status text;
BEGIN
    -- 1. Resolve Client & Company (from client_portal_users or clients table)
    SELECT client_id, company_id INTO v_mapped_client_id, v_mapped_company_id
    FROM client_portal_users
    WHERE email = (SELECT email FROM auth.users WHERE id = v_user_id)
      AND is_active = true
    LIMIT 1;

    IF v_mapped_client_id IS NULL THEN
        -- Fallback to clients table
        SELECT id, company_id INTO v_mapped_client_id, v_mapped_company_id
        FROM clients
        WHERE auth_user_id = v_user_id
          AND is_active = true
        LIMIT 1;
    END IF;

    IF v_mapped_client_id IS NULL THEN
        RAISE EXCEPTION 'User profile not found or access denied';
    END IF;

    -- 2. Verify Invoice Ownership & Status
    SELECT status, payment_status INTO v_current_status, v_payment_status
    FROM invoices
    WHERE id = p_invoice_id
      AND client_id = v_mapped_client_id
      AND company_id = v_mapped_company_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found or access denied';
    END IF;

    IF v_payment_status = 'paid' THEN
        RAISE EXCEPTION 'Invoice is already paid';
    END IF;

    -- 3. Update Status
    UPDATE invoices
    SET payment_status = 'pending_local',
        updated_at = now()
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object('success', true, 'message', 'Invoice marked for local payment');
END;
$$;

-- 2. get_client_invoices_rpc
CREATE OR REPLACE FUNCTION get_client_invoices_rpc(p_invoice_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_mapped_client_id uuid;
    v_mapped_company_id uuid;
    v_result jsonb;
BEGIN
    -- 1. Resolve Client & Company
    SELECT client_id, company_id INTO v_mapped_client_id, v_mapped_company_id
    FROM client_portal_users
    WHERE email = (SELECT email FROM auth.users WHERE id = v_user_id)
      AND is_active = true
    LIMIT 1;

    IF v_mapped_client_id IS NULL THEN
        SELECT id, company_id INTO v_mapped_client_id, v_mapped_company_id
        FROM clients
        WHERE auth_user_id = v_user_id
          AND is_active = true
        LIMIT 1;
    END IF;

    IF v_mapped_client_id IS NULL THEN
        -- Return empty list or null depending on context, EF returned []
        IF p_invoice_id IS NOT NULL THEN
            RETURN NULL;
        ELSE
            RETURN '[]'::jsonb;
        END IF;
    END IF;

    -- 2. Fetch Data
    IF p_invoice_id IS NOT NULL THEN
        -- Detail
        SELECT jsonb_build_object(
            'id', i.id,
            'company_id', i.company_id,
            'client_id', i.client_id,
            'full_invoice_number', i.full_invoice_number,
            'invoice_series', i.invoice_series,
            'invoice_number', i.invoice_number,
            'status', i.status,
            'payment_status', i.payment_status,
            'payment_link_token', i.payment_link_token,
            'payment_link_expires_at', i.payment_link_expires_at,
            'stripe_payment_url', i.stripe_payment_url,
            'paypal_payment_url', i.paypal_payment_url,
            'invoice_date', i.invoice_date,
            'due_date', i.due_date,
            'total', i.total,
            'currency', i.currency,
            'items', (
                SELECT jsonb_agg(jsonb_build_object(
                    'id', ii.id,
                    'line_order', ii.line_order,
                    'description', ii.description,
                    'quantity', ii.quantity,
                    'unit_price', ii.unit_price,
                    'tax_rate', ii.tax_rate,
                    'total', ii.total
                ))
                FROM invoice_items ii
                WHERE ii.invoice_id = i.id
            )
        ) INTO v_result
        FROM invoices i
        WHERE i.id = p_invoice_id
          AND i.client_id = v_mapped_client_id
          AND i.company_id = v_mapped_company_id;
        
        RETURN v_result;
    ELSE
        -- List
        SELECT jsonb_agg(jsonb_build_object(
            'id', i.id,
            'company_id', i.company_id,
            'client_id', i.client_id,
            'full_invoice_number', i.full_invoice_number,
            'invoice_series', i.invoice_series,
            'invoice_number', i.invoice_number,
            'status', i.status,
            'payment_status', i.payment_status,
            'payment_link_token', i.payment_link_token,
            'payment_link_expires_at', i.payment_link_expires_at,
            'stripe_payment_url', i.stripe_payment_url,
            'paypal_payment_url', i.paypal_payment_url,
            'invoice_date', i.invoice_date,
            'total', i.total,
            'currency', i.currency
        ) ORDER BY i.invoice_date DESC) INTO v_result
        FROM invoices i
        WHERE i.client_id = v_mapped_client_id
          AND i.company_id = v_mapped_company_id;

        RETURN COALESCE(v_result, '[]'::jsonb);
    END IF;
END;
$$;

-- 3. get_client_quotes_rpc
CREATE OR REPLACE FUNCTION get_client_quotes_rpc(p_quote_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_mapped_client_id uuid;
    v_mapped_company_id uuid;
    v_result jsonb;
BEGIN
    SELECT client_id, company_id INTO v_mapped_client_id, v_mapped_company_id
    FROM client_portal_users
    WHERE email = (SELECT email FROM auth.users WHERE id = v_user_id)
      AND is_active = true
    LIMIT 1;

    IF v_mapped_client_id IS NULL THEN
        SELECT id, company_id INTO v_mapped_client_id, v_mapped_company_id
        FROM clients
        WHERE auth_user_id = v_user_id
          AND is_active = true
        LIMIT 1;
    END IF;

    IF v_mapped_client_id IS NULL THEN
        IF p_quote_id IS NOT NULL THEN RETURN NULL; ELSE RETURN '[]'::jsonb; END IF;
    END IF;

    IF p_quote_id IS NOT NULL THEN
        -- Detail
        SELECT jsonb_build_object(
            'id', q.id,
            'company_id', q.company_id,
            'client_id', q.client_id,
            'full_quote_number', q.full_quote_number,
            'title', q.title,
            'status', q.status,
            'quote_date', q.quote_date,
            'valid_until', q.valid_until,
            'total_amount', q.total_amount,
            'convert_policy', q.convert_policy, -- Policy computation logic left for FE or separate logic if crucial
            'items', (
                SELECT jsonb_agg(qi.*)
                FROM quote_items qi
                WHERE qi.quote_id = q.id
            )
        ) INTO v_result
        FROM quotes q
        WHERE q.id = p_quote_id
          AND q.client_id = v_mapped_client_id
          AND q.company_id = v_mapped_company_id;
        
        RETURN v_result;
    ELSE
        -- List
        SELECT jsonb_agg(q.* ORDER BY q.quote_date DESC) INTO v_result
        FROM quotes q
        WHERE q.client_id = v_mapped_client_id
          AND q.company_id = v_mapped_company_id;

        RETURN COALESCE(v_result, '[]'::jsonb);
    END IF;
END;
$$;
