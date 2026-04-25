-- RGPD Art. 7 / Art. 5.2 (Accountability): portal_submit_arco_request() debe registrar
-- evidencia del origen de la solicitud (IP, user-agent) para demostrar la autenticidad
-- de la petición y cumplir el principio de responsabilidad proactiva.
--
-- La IP y el user-agent deben ser pasados por la Edge Function o el servicio llamante,
-- ya que PostgreSQL no tiene acceso directo a las cabeceras HTTP del request original.

CREATE OR REPLACE FUNCTION public.portal_submit_arco_request(
  p_request_type TEXT,
  p_details      JSONB    DEFAULT '{}'::JSONB,
  p_ip_address   TEXT     DEFAULT NULL,
  p_user_agent   TEXT     DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email        TEXT;
  v_client       RECORD;
  v_request_id   UUID;
  v_evidence     JSONB;
BEGIN
  v_email := auth.email();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Whitelist: only valid ARCO request types accepted
  IF p_request_type NOT IN ('access', 'rectification', 'erasure', 'portability', 'restriction', 'objection') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid request type');
  END IF;

  -- Load the client record to get company_id and full_name
  SELECT id, company_id, name, surname
  INTO v_client
  FROM public.clients
  WHERE email = v_email
  LIMIT 1;

  IF v_client IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;

  -- Prevent duplicate open (pending) requests of the same type
  IF EXISTS (
    SELECT 1 FROM public.gdpr_access_requests
    WHERE subject_email = v_email
      AND request_type  = p_request_type
      AND verification_status NOT IN ('completed', 'closed', 'rejected', 'resolved')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_open');
  END IF;

  -- Build evidence block for Art. 7.1 accountability
  v_evidence := jsonb_build_object(
    'submitted_at',  NOW(),
    'ip_address',    p_ip_address,
    'user_agent',    p_user_agent,
    'auth_method',   'supabase_jwt',
    'subject_email', v_email
  );

  -- Merge user-supplied details with the evidence block
  INSERT INTO public.gdpr_access_requests (
    request_type,
    subject_email,
    subject_name,
    company_id,
    requested_by,
    request_details,
    verification_status
  ) VALUES (
    p_request_type,
    v_email,
    trim(coalesce(v_client.name, '') || ' ' || coalesce(v_client.surname, '')),
    v_client.company_id,
    NULL,  -- self-submitted by the data subject
    p_details || jsonb_build_object('_evidence', v_evidence),
    'pending'
  )
  RETURNING id INTO v_request_id;

  -- Audit log
  INSERT INTO public.gdpr_audit_log (
    action_type, table_name, user_id, company_id,
    subject_email, ip_address, user_agent, new_values
  ) VALUES (
    'insert',
    'gdpr_access_requests',
    auth.uid(),
    v_client.company_id,
    v_email,
    p_ip_address::INET,
    p_user_agent,
    jsonb_build_object(
      'request_id',   v_request_id,
      'request_type', p_request_type,
      'source',       'portal_self_service'
    )
  );

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
END;
$$;

-- Revoke & re-grant to reflect new signature
REVOKE ALL ON FUNCTION public.portal_submit_arco_request(TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_submit_arco_request(TEXT, JSONB, TEXT, TEXT) TO authenticated, service_role;

-- Also revoke old 2-param variant in case it still exists
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.portal_submit_arco_request(TEXT, JSONB) FROM PUBLIC, anon
    RESTRICT;
EXCEPTION WHEN undefined_function THEN NULL;
END;
$$;

COMMENT ON FUNCTION public.portal_submit_arco_request(TEXT, JSONB, TEXT, TEXT) IS
  'GDPR Arts. 15-21: Allows a portal client to submit a self-service ARCO request. Captures IP address and User-Agent for accountability (Art. 5.2 / Art. 7.1). The calling layer (Edge Function / service) must supply p_ip_address and p_user_agent.';
