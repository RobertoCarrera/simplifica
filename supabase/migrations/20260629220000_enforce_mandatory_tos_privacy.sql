-- Enforce mandatory TOS + privacy consent at the RPC layer (defense in depth).
-- The portal UI now locks TOS and Privacy to true, but the RPC is publicly
-- reachable (via the BFF) so a direct API caller could otherwise decline them.
-- If TOS=false or Privacy=false, the RPC refuses and returns an error.
-- Marketing is still optional.

CREATE OR REPLACE FUNCTION public.process_email_consent(
  p_company_id        uuid,
  p_email             text,
  p_tos_consent       boolean,
  p_privacy_consent   boolean,
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

  -- Server-side guard: TOS and Privacy are mandatory for using the service.
  -- If a caller (even a malicious one) tries to decline them, refuse and
  -- surface a clear error so the client knows what's wrong.
  IF NOT p_tos_consent THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'tos_required',
      'message', 'Los términos de uso y servicio son obligatorios para poder prestarte el servicio. Si no los aceptas, no podemos mantener tus datos en el sistema.'
    );
  END IF;
  IF NOT p_privacy_consent THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'privacy_required',
      'message', 'La política de privacidad es obligatoria para el tratamiento de tus datos personales conforme al RGPD. Si no la aceptas, no podemos mantener tus datos en el sistema.'
    );
  END IF;

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
    SET terms_of_service_consent    = p_tos_consent,
        terms_of_service_consent_date = v_now,
        privacy_policy_consent      = p_privacy_consent,
        privacy_policy_consent_date  = v_now,
        marketing_consent            = p_marketing_consent,
        marketing_consent_date       = CASE WHEN p_marketing_consent THEN v_now
                                             ELSE marketing_consent_date END,
        marketing_consent_method     = p_consent_method,
        consent_date                 = v_now,
        consent_ip                   = p_ip,
        consent_status               = CASE
                                          WHEN p_marketing_consent THEN 'accepted'::public.consent_status
                                          ELSE 'revoked'::public.consent_status
                                        END,
        updated_at                   = v_now
    WHERE id = v_client_id;
  END IF;

  INSERT INTO public.gdpr_consent_records (
    subject_id, subject_email, consent_type, purpose, consent_given,
    consent_method, consent_evidence, company_id, legal_basis, retention_period
  )
  VALUES
    (v_subject_id, p_email, 'terms_of_service', 'service_provision', p_tos_consent,
     p_consent_method,
     jsonb_build_object('email', p_email, 'company_id', p_company_id, 'token_used', v_token_used, 'ip', p_ip, 'user_agent', p_ua, 'method', 'email_link'),
     p_company_id, 'consent', '5 years'::interval),
    (v_subject_id, p_email, 'privacy_policy', 'privacy_policy_acceptance', p_privacy_consent,
     p_consent_method,
     jsonb_build_object('email', p_email, 'company_id', p_company_id, 'token_used', v_token_used, 'ip', p_ip, 'user_agent', p_ua, 'method', 'email_link'),
     p_company_id, 'consent', '5 years'::interval),
    (v_subject_id, p_email, 'marketing', 'marketing_communications', p_marketing_consent,
     p_consent_method,
     jsonb_build_object('email', p_email, 'company_id', p_company_id, 'token_used', v_token_used, 'ip', p_ip, 'user_agent', p_ua, 'method', 'email_link'),
     p_company_id, 'consent', '5 years'::interval);

  RETURN jsonb_build_object(
    'success', true,
    'subject_id', v_subject_id,
    'client_id', v_client_id,
    'consent_method', p_consent_method,
    'consents', jsonb_build_object(
      'terms_of_service', p_tos_consent,
      'privacy_policy', p_privacy_consent,
      'marketing', p_marketing_consent
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_email_consent(uuid, text, boolean, boolean, boolean, text, text, text) TO anon, authenticated;