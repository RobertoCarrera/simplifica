-- RPC to get verifactu certificate status and history
-- Returns JSON object with 'ok', 'settings', and 'history'
CREATE OR REPLACE FUNCTION public.get_verifactu_cert_status(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_settings RECORD;
    v_history JSONB;
    v_result JSONB;
BEGIN
    -- Check permissions (must be member of company)
    IF NOT EXISTS (
        SELECT 1 FROM public.company_members cm 
        WHERE cm.company_id = p_company_id 
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Permission denied');
    END IF;

    -- Get Settings
    SELECT 
        software_code, 
        issuer_nif, 
        environment, 
        (cert_pem_enc IS NOT NULL AND key_pem_enc IS NOT NULL) as configured,
        CASE WHEN cert_pem_enc IS NOT NULL THEN 'encrypted'::text ELSE 'none'::text END as mode
    INTO v_settings
    FROM public.verifactu_settings
    WHERE company_id = p_company_id;

    IF NOT FOUND THEN
         -- Return valid structure but empty/unconfigured
         RETURN jsonb_build_object(
            'ok', true,
            'settings', jsonb_build_object(
                'configured', false,
                'mode', 'none',
                'software_code', null,
                'issuer_nif', null,
                'environment', null
            ),
            'history', '[]'::jsonb
         );
    END IF;

    -- Get History (recent 5)
    SELECT jsonb_agg(h)
    INTO v_history
    FROM (
        SELECT 
            version, 
            stored_at, 
            rotated_by, 
            integrity_hash, 
            notes, 
            cert_len, 
            key_len, 
            (key_pass_enc IS NOT NULL) as pass_present
        FROM public.verifactu_cert_history
        WHERE company_id = p_company_id
        ORDER BY stored_at DESC
        LIMIT 5
    ) h;

    RETURN jsonb_build_object(
        'ok', true,
        'settings', jsonb_build_object(
            'configured', v_settings.configured,
            'mode', v_settings.mode,
            'software_code', v_settings.software_code,
            'issuer_nif', v_settings.issuer_nif,
            'environment', v_settings.environment
        ),
        'history', COALESCE(v_history, '[]'::jsonb)
    );
END;
$$;
