-- =====================================================
-- FIX: Aplicar función verifactu_preflight_issue
-- Esta función es llamada por issue-invoice Edge Function
-- Ejecutar en Supabase Dashboard > SQL Editor
-- =====================================================

-- Drop existing function to avoid return type conflict
DROP FUNCTION IF EXISTS public.verifactu_preflight_issue(uuid, text, text);

CREATE OR REPLACE FUNCTION public.verifactu_preflight_issue(
    pinvoice_id uuid,
    pdevice_id text default null,
    psoftware_id text default null
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invoice_status text;
    v_series text;
    v_result json;
BEGIN
    -- Check invoice status and get series
    SELECT i.state, s.series_code INTO v_invoice_status, v_series
    FROM public.invoices i
    JOIN public.invoice_series s ON s.id = i.series_id
    WHERE i.id = pinvoice_id;
    
    IF v_invoice_status IS NULL THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;

    -- Allow 'draft' AND 'approved'
    IF v_invoice_status NOT IN ('draft', 'approved') THEN
        RAISE EXCEPTION 'invalid_status_state';
    END IF;

    -- Call finalize_invoice to perform the actual work (hashing, chaining, updating status)
    v_result := public.finalize_invoice(pinvoice_id, v_series, pdevice_id, psoftware_id);
    
    RETURN json_build_object('ok', true, 'data', v_result);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.verifactu_preflight_issue(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verifactu_preflight_issue(UUID, TEXT, TEXT) TO service_role;

-- Verification
DO $$
BEGIN
    RAISE NOTICE '✅ verifactu_preflight_issue function created successfully';
END $$;
