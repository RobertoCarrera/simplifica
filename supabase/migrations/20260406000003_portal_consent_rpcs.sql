-- =====================================================================
-- Migration: Portal self-service consent RPCs
-- Date: 2026-04-06
-- GDPR: Fase 2 — Art. 7(3) — derecho a retirar consentimiento
--
-- Crea dos RPCs SECURITY DEFINER para uso exclusivo del portal cliente:
--   portal_get_my_consents()           → lista consentimientos activos del cliente
--   portal_withdraw_my_consent(type)   → retira un consentimiento específico
--
-- Ambas se identifican por el email del usuario autenticado (auth.email())
-- para prevenir acceso cruzado entre clientes.
-- =====================================================================

-- 1. Ver consentimientos activos del cliente autenticado
CREATE OR REPLACE FUNCTION public.portal_get_my_consents()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email     TEXT;
  v_client_id UUID;
  v_result    JSONB;
BEGIN
  v_email := auth.email();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_client_id
  FROM public.clients
  WHERE email = v_email
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Devuelve el estado más reciente de cada tipo de consentimiento
  SELECT jsonb_agg(latest ORDER BY created_at DESC)
  INTO v_result
  FROM (
    SELECT DISTINCT ON (consent_type)
      id,
      consent_type,
      consent_given,
      purpose,
      is_active,
      created_at,
      withdrawn_at
    FROM public.gdpr_consent_records
    WHERE subject_id = v_client_id
    ORDER BY consent_type, created_at DESC
  ) latest;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_get_my_consents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_get_my_consents() TO authenticated, service_role;

-- 2. Retirar un consentimiento (Art. 7(3) — libre, específico, sencillo)
CREATE OR REPLACE FUNCTION public.portal_withdraw_my_consent(
  p_consent_type TEXT,
  p_evidence     JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email     TEXT;
  v_client_id UUID;
  v_count     INT;
BEGIN
  v_email := auth.email();
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validar tipo (whitelist para prevenir inyección)
  IF p_consent_type NOT IN ('data_processing', 'health_data', 'marketing', 'privacy_policy', 'terms_of_service') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid consent type');
  END IF;

  SELECT id INTO v_client_id
  FROM public.clients
  WHERE email = v_email
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found');
  END IF;

  -- Marcar como retirado todos los registros activos de este tipo
  UPDATE public.gdpr_consent_records
  SET
    withdrawn_at       = NOW(),
    withdrawal_method  = 'portal_self_service',
    withdrawal_evidence = p_evidence,
    updated_at         = NOW()
  WHERE
    subject_id    = v_client_id
    AND consent_type  = p_consent_type
    AND withdrawn_at  IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Registrar en audit log
  INSERT INTO public.gdpr_audit_log (
    action_type,
    table_name,
    user_id,
    subject_email,
    old_values
  ) VALUES (
    'consent_withdrawn',
    'gdpr_consent_records',
    auth.uid(),
    v_email,
    jsonb_build_object(
      'client_id',       v_client_id,
      'consent_type',    p_consent_type,
      'records_updated', v_count,
      'evidence',        p_evidence
    )
  );

  RETURN jsonb_build_object('success', true, 'records_updated', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_withdraw_my_consent(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_withdraw_my_consent(TEXT, JSONB) TO authenticated, service_role;

COMMENT ON FUNCTION public.portal_get_my_consents() IS
  'GDPR Art.7: Devuelve el estado más reciente de cada tipo de consentimiento para el cliente autenticado. Identificación por auth.email().';
COMMENT ON FUNCTION public.portal_withdraw_my_consent(TEXT, JSONB) IS
  'GDPR Art.7(3): Permite a un cliente retirar cualquier consentimiento no obligatorio desde el portal. Identificación por auth.email().';
