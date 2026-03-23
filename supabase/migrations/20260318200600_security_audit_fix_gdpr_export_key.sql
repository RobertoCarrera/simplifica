-- ============================================================
-- SECURITY AUDIT: Fix gdpr_export_client_data hardcoded encryption key
-- Date: 2026-03-18
-- Risk: CRITICAL — Function uses hardcoded 'simplifica-secure-key-2026'
--        to decrypt clinical notes. Must use Vault secret instead.
-- Also adds SET search_path and permission check.
-- ============================================================

CREATE OR REPLACE FUNCTION public.gdpr_export_client_data(
    client_email TEXT,
    requesting_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    client_data JSONB;
    client_record RECORD;
    v_company_id UUID;
    v_encryption_key text;
BEGIN
    -- Load encryption key from Vault (never hardcoded)
    v_encryption_key := current_setting('app.settings.clinical_notes_encryption_key', true);
    IF v_encryption_key IS NULL OR v_encryption_key = '' THEN
      RAISE EXCEPTION 'CLINICAL_NOTES_ENCRYPTION_KEY not configured. Set it in Supabase Dashboard > Settings > Vault.';
    END IF;

    SELECT * INTO client_record FROM public.clients WHERE email = client_email LIMIT 1;

    IF client_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client not found');
    END IF;

    v_company_id := client_record.company_id;

    -- Permission check: requesting user must be an active member of the same company
    IF NOT EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.users u ON u.id = cm.user_id
      WHERE u.id = requesting_user_id
        AND cm.company_id = v_company_id
        AND cm.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Access denied: requesting user is not an active member of the client company';
    END IF;

    -- Aggregate data
    SELECT jsonb_build_object(
        'profile', to_jsonb(client_record),
        'clinical_notes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', n.id,
                'content', pgp_sym_decrypt(n.content::bytea, v_encryption_key),
                'created_at', n.created_at,
                'created_by', n.created_by
            ))
            FROM public.client_clinical_notes n
            WHERE n.client_id = client_record.id
        ), '[]'::jsonb),
        'consents', COALESCE((
            SELECT jsonb_agg(to_jsonb(cr))
            FROM public.gdpr_consent_records cr
            WHERE cr.subject_email = client_email
        ), '[]'::jsonb),
        'access_requests', COALESCE((
            SELECT jsonb_agg(to_jsonb(ar))
            FROM public.gdpr_access_requests ar
            WHERE ar.subject_email = client_email
        ), '[]'::jsonb),
        'exported_at', NOW()
    )
    INTO client_data;

    -- Log Access
    INSERT INTO public.gdpr_audit_log (
        action_type, table_name, record_id, subject_email, purpose, old_values, user_id, company_id
    ) VALUES (
        'export',
        'clients',
        client_record.id,
        client_email,
        'Data Portability Request (Full Export)',
        NULL,
        requesting_user_id,
        v_company_id
    );

    RETURN client_data;
END;
$$;
