-- RGPD Art. 18: gdpr_export_client_data() debe incluir el estado de restricción
-- en la exportación y anotarlo en el log de auditoría.
-- La exportación sigue siendo legal bajo Art. 15/20 aunque haya restricción activa,
-- pero el estado debe reflejarse claramente en el JSON exportado.

CREATE OR REPLACE FUNCTION public.gdpr_export_client_data(
  client_email       TEXT,
  requesting_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  client_data   JSONB;
  client_record RECORD;
  v_company_id  UUID;
  v_restriction JSONB;
BEGIN
  -- Verify the requesting user has DPO or elevated access
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = requesting_user_id
      AND (is_dpo = true OR data_access_level IN ('elevated', 'admin') OR is_super_admin = true)
  ) THEN
    RAISE EXCEPTION 'Access denied: data export requires elevated privileges or DPO role';
  END IF;

  SELECT * INTO client_record FROM public.clients WHERE email = client_email LIMIT 1;

  IF client_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;

  v_company_id := client_record.company_id;

  -- Art. 18: Compose restriction notice if applicable
  IF client_record.processing_restricted = TRUE THEN
    v_restriction := jsonb_build_object(
      'active',       true,
      'reason',       client_record.processing_restriction_reason,
      'restricted_at', client_record.processing_restricted_at,
      'legal_notice', 'Processing is currently restricted under GDPR Art. 18. ' ||
                      'Data export is still permitted under Art. 15/20 (rights of access and portability).'
    );
  ELSE
    v_restriction := jsonb_build_object('active', false);
  END IF;

  -- Aggregate data – clinical notes are decrypted inline per key version
  SELECT jsonb_build_object(
    'profile', to_jsonb(client_record),
    'processing_restriction', v_restriction,
    'clinical_notes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',         n.id,
        'content',    extensions.pgp_sym_decrypt(
                        n.content::bytea,
                        (SELECT decrypted_secret
                         FROM vault.decrypted_secrets
                         WHERE name = 'clinical_encryption_key_v' || n.key_version::TEXT)
                      ),
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

  -- Audit log – note restriction state at export time
  INSERT INTO public.gdpr_audit_log (
    action_type, table_name, record_id, subject_email, purpose, user_id, company_id, new_values
  ) VALUES (
    'export',
    'clients',
    client_record.id,
    client_email,
    'Data Portability Request — Art. 20 GDPR',
    requesting_user_id,
    v_company_id,
    jsonb_build_object(
      'processing_restricted_at_export', client_record.processing_restricted
    )
  );

  RETURN client_data;
END;
$$;

COMMENT ON FUNCTION public.gdpr_export_client_data(text, uuid) IS
  'GDPR Arts. 15, 18, 20: Exports all client data. Includes processing_restriction status in the payload. Export is still lawful even when restriction is active (Art. 15/20 rights prevail).';
