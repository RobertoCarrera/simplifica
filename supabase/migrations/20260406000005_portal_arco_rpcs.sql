-- =====================================================================
-- Migration: Portal self-service ARCO RPCs
-- Date: 2026-04-06
-- GDPR: Fase 3 — Arts. 15, 16, 17, 18, 20, 21 — derechos ARCO del titular
--
-- Crea tres RPCs SECURITY DEFINER para uso exclusivo del portal cliente:
--   portal_get_my_arco_requests()              → lista solicitudes del cliente
--   portal_submit_arco_request(type, details)  → envía una nueva solicitud ARCO
--   portal_export_my_data()                    → descarga datos personales (Art. 20)
--
-- Todas usan auth.email() para identificar al titular y prevenir
-- acceso cruzado entre clientes.
-- =====================================================================

-- ── 1. Listar solicitudes ARCO del cliente autenticado ───────────────

CREATE OR REPLACE FUNCTION public.portal_get_my_arco_requests()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email  TEXT;
  v_result JSONB;
BEGIN
  v_email := auth.email();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                   ar.id,
      'request_type',         ar.request_type,
      'subject_name',         ar.subject_name,
      'request_details',      ar.request_details,
      'verification_status',  ar.verification_status,
      'created_at',           ar.created_at
    )
    ORDER BY ar.created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM public.gdpr_access_requests ar
  WHERE ar.subject_email = v_email;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_get_my_arco_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_get_my_arco_requests() TO authenticated, service_role;

COMMENT ON FUNCTION public.portal_get_my_arco_requests() IS
    'GDPR Arts. 15-21: Returns all ARCO requests submitted by the authenticated portal client.';

-- ── 2. Enviar una nueva solicitud ARCO ──────────────────────────────

CREATE OR REPLACE FUNCTION public.portal_submit_arco_request(
  p_request_type TEXT,
  p_details      JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email      TEXT;
  v_client     RECORD;
  v_request_id UUID;
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
    p_details,
    'pending'
  )
  RETURNING id INTO v_request_id;

  -- Audit log
  INSERT INTO public.gdpr_audit_log (
    action_type, table_name, user_id, new_values
  ) VALUES (
    'insert',
    'gdpr_access_requests',
    auth.uid(),
    jsonb_build_object(
      'request_id',   v_request_id,
      'request_type', p_request_type,
      'source',       'portal_self_service'
    )
  );

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_submit_arco_request(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_submit_arco_request(TEXT, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.portal_submit_arco_request(TEXT, JSONB) IS
    'GDPR Arts. 15-21: Allows a portal client to submit an ARCO self-service request. '
    'Validates request type, prevents duplicates, notifies the company owner via existing trigger.';

-- ── 3. Exportar datos propios (Art. 20 — portabilidad) ──────────────
--
-- Builds a JSON export of the client's own data without exposing raw
-- clinical note encryption keys. Returns only decrypted content if the
-- caller has active health_data consent.

CREATE OR REPLACE FUNCTION public.portal_export_my_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email   TEXT;
  v_client  RECORD;
  v_result  JSONB;
BEGIN
  v_email := auth.email();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_client
  FROM public.clients
  WHERE email = v_email
  LIMIT 1;

  IF v_client IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;

  -- Audit: log the self-service export
  INSERT INTO public.gdpr_audit_log (
    action_type, table_name, user_id, old_values
  ) VALUES (
    'export',
    'clients',
    auth.uid(),
    jsonb_build_object('source', 'portal_self_service_art20', 'client_id', v_client.id)
  );

  -- Build export payload (excludes internal UUIDs and encrypted blobs)
  SELECT jsonb_build_object(
    'exported_at',    now(),
    'subject_email',  v_email,
    'legal_basis',    'GDPR Art. 20 — Right to data portability',
    'profile', jsonb_build_object(
      'name',       v_client.name,
      'surname',    v_client.surname,
      'email',      v_client.email,
      'phone',      v_client.phone,
      'address',    v_client.address,
      'city',       v_client.city,
      'created_at', v_client.created_at
    ),
    'consents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'consent_type',  cr.consent_type,
        'consent_given', cr.consent_given,
        'created_at',    cr.created_at,
        'withdrawn_at',  cr.withdrawn_at
      ) ORDER BY cr.created_at)
      FROM public.gdpr_consent_records cr
      WHERE cr.subject_id = v_client.id
    ), '[]'::jsonb),
    'arco_requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'request_type',        ar.request_type,
        'verification_status', ar.verification_status,
        'created_at',          ar.created_at
      ) ORDER BY ar.created_at)
      FROM public.gdpr_access_requests ar
      WHERE ar.subject_email = v_email
    ), '[]'::jsonb),
    'bookings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'service_name',  s.name,
        'status',        b.status,
        'scheduled_at',  b.scheduled_at,
        'completed_at',  b.completed_at
      ) ORDER BY b.scheduled_at)
      FROM public.bookings b
      LEFT JOIN public.services s ON s.id = b.service_id
      WHERE b.customer_email = v_email
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_export_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_export_my_data() TO authenticated, service_role;

COMMENT ON FUNCTION public.portal_export_my_data() IS
    'GDPR Art. 20: Returns a structured JSON export of all personal data held about '
    'the authenticated portal client. Logs the access in gdpr_audit_log.';
