-- Stamp clients.invitation_token into consent_evidence so the audit row links
-- back to the invite that triggered the consent. The EF still generates the
-- token but doesn't expose it in the URL.

CREATE OR REPLACE FUNCTION public.process_email_consent(
  p_company_id        uuid,
  p_email             text,
  p_marketing_consent boolean,
  p_ip                text DEFAULT NULL,
  p_ua                text DEFAULT NULL,
  p_consent_method    text DEFAULT 'email_link'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id  uuid;
  v_subject_id uuid;
  v_token_used text;
  v_now        timestamptz := NOW();
BEGIN
  p_email := lower(trim(p_email));

  SELECT c.id, c.invitation_token::text
    INTO v_client_id, v_token_used
  FROM public.clients c
  WHERE c.email = p_email
    AND c.company_id = p_company_id
    AND c.deleted_at IS NULL
  LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    v_subject_id := v_client_id;

    UPDATE public.clients
    SET marketing_consent         = p_marketing_consent,
        marketing_consent_date    = CASE WHEN p_marketing_consent THEN v_now
                                          ELSE marketing_consent_date END,
        marketing_consent_method  = p_consent_method,
        consent_date              = v_now,
        consent_ip                = p_ip,
        consent_status            = CASE WHEN p_marketing_consent
                                        THEN 'accepted'::public.consent_status
                                        ELSE 'revoked'::public.consent_status
                                   END,
        updated_at                = v_now
    WHERE id = v_client_id;
  END IF;

  INSERT INTO public.gdpr_consent_records (
    subject_id,
    subject_email,
    consent_type,
    purpose,
    consent_given,
    consent_method,
    consent_evidence,
    company_id,
    legal_basis,
    retention_period
  )
  VALUES (
    v_subject_id,
    p_email,
    'marketing',
    'marketing_communications',
    p_marketing_consent,
    p_consent_method,
    jsonb_build_object(
      'email',       p_email,
      'company_id',  p_company_id,
      'token_used',  v_token_used,
      'ip',          p_ip,
      'user_agent',  p_ua,
      'method',      'email_link'
    ),
    p_company_id,
    'consent',
    '5 years'::interval
  );

  RETURN jsonb_build_object(
    'success',        true,
    'subject_id',     v_subject_id,
    'client_id',      v_client_id,
    'consent_method', p_consent_method,
    'consent_given',  p_marketing_consent
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_email_consent(uuid, text, boolean, text, text, text) TO anon, authenticated;