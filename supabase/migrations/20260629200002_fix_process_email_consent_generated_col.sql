-- Fix: process_email_consent tried to insert into generated column is_active
-- (computed from withdrawn_at IS NULL). Drop the explicit INSERT for it.

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
  v_now        timestamptz := NOW();
BEGIN
  p_email := lower(trim(p_email));

  SELECT c.id
    INTO v_client_id
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

  -- Note: is_active is a generated column (withdrawn_at IS NULL), so we don't
  -- insert into it. created_at / updated_at default to now().
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
      'ip',         p_ip,
      'user_agent', p_ua,
      'method',     'email_link',
      'company_id', p_company_id
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

COMMENT ON FUNCTION public.process_email_consent(uuid, text, boolean, text, text, text) IS
  'Email-based consent decision writer. Updates clients (when matched) and '
  'always inserts gdpr_consent_records for the immutable audit log. '
  'subject_id is NULL when no clients row exists — backfilled later by the '
  'auth.users trigger when the user signs up. '
  'SECURITY DEFINER with search_path pinned to public.';

GRANT EXECUTE ON FUNCTION public.process_email_consent(uuid, text, boolean, text, text, text) TO anon, authenticated;