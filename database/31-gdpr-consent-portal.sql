-- ========================================
-- GDPR CONSENT PORTAL (PUBLIC FLOW)
-- ========================================
-- Provides tokenized consent requests that subjects can open without login.
-- Includes RPCs to create requests (auth users) and accept/decline (anon).

BEGIN;

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Table to track consent requests sent to data subjects
CREATE TABLE IF NOT EXISTS public.gdpr_consent_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
    client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
    subject_email text NOT NULL,
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    consent_types text[] NOT NULL, -- e.g. ['data_processing','marketing','analytics']
    purpose text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz DEFAULT (now() + interval '30 days'),
    accepted_at timestamptz,
    evidence jsonb DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gcr_company ON public.gdpr_consent_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_gcr_email ON public.gdpr_consent_requests(subject_email);
CREATE INDEX IF NOT EXISTS idx_gcr_status ON public.gdpr_consent_requests(status);

-- Enable RLS; RPCs run as SECURITY DEFINER
ALTER TABLE public.gdpr_consent_requests ENABLE ROW LEVEL SECURITY;

-- Company users can list their requests
CREATE POLICY gcr_company_policy ON public.gdpr_consent_requests
FOR SELECT USING (
  company_id IN (SELECT company_id FROM public.users WHERE auth_user_id = auth.uid())
);

-- ========================================
-- RPC: create consent request (authenticated)
-- ========================================
CREATE OR REPLACE FUNCTION public.gdpr_create_consent_request(
    p_client_id uuid,
    p_subject_email text,
    p_consent_types text[],
    p_purpose text DEFAULT NULL,
    p_expires interval DEFAULT '30 days'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
  v_request_id uuid;
  v_token text;
BEGIN
  -- Determine company of current user
  SELECT company_id INTO v_company_id FROM public.users WHERE auth_user_id = auth.uid() AND active = true LIMIT 1;
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  INSERT INTO public.gdpr_consent_requests (client_id, subject_email, company_id, consent_types, purpose, expires_at)
  VALUES (p_client_id, lower(trim(p_subject_email)), v_company_id, p_consent_types, p_purpose, now() + COALESCE(p_expires, interval '30 days'))
  RETURNING id, token INTO v_request_id, v_token;

  -- Log audit
  PERFORM gdpr_log_access(auth.uid(), 'consent', 'gdpr_consent_requests', v_request_id, p_subject_email, 'consent_request_created');

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id, 'token', v_token, 'path', '/consent?t='||v_token);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ========================================
-- RPC: get consent request by token (anon)
-- ========================================
CREATE OR REPLACE FUNCTION public.gdpr_get_consent_request(
    p_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r record;
  v_expired boolean;
BEGIN
  SELECT gcr.*, c.name AS company_name INTO r
  FROM public.gdpr_consent_requests gcr
  JOIN public.companies c ON c.id = gcr.company_id
  WHERE gcr.token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  v_expired := (r.expires_at < now());

  RETURN jsonb_build_object(
    'success', true,
    'status', CASE WHEN v_expired AND r.status='pending' THEN 'expired' ELSE r.status END,
    'subject_email', r.subject_email,
    'client_id', r.client_id,
    'company_id', r.company_id,
    'company_name', r.company_name,
    'consent_types', r.consent_types,
    'purpose', r.purpose,
    'expires_at', r.expires_at
  );
END;
$$;

-- ========================================
-- RPC: accept consent (anon)
-- preferences example: {"data_processing": true, "marketing": false, "analytics": true}
-- ========================================
CREATE OR REPLACE FUNCTION public.gdpr_accept_consent(
    p_token text,
    p_preferences jsonb,
    p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r public.gdpr_consent_requests;
  v_now timestamptz := now();
  v_type text;
  v_given boolean;
BEGIN
  SELECT * INTO r FROM public.gdpr_consent_requests WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF r.status <> 'pending' OR r.expires_at < v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending');
  END IF;

  -- Insert one consent record per requested type
  FOREACH v_type IN ARRAY r.consent_types LOOP
    v_given := COALESCE((p_preferences ->> v_type)::boolean, false);
    INSERT INTO public.gdpr_consent_records (
      subject_id, subject_email, consent_type, purpose, consent_given, consent_method,
      consent_evidence, company_id, processed_by, legal_basis
    ) VALUES (
      r.client_id,
      r.subject_email,
      v_type,
      COALESCE(r.purpose, 'consent_portal'),
      v_given,
      'website',
      jsonb_build_object('source','consent_portal','token',p_token,'evidence',p_evidence),
      r.company_id,
      NULL,
      CASE WHEN v_type = 'data_processing' THEN 'consent' ELSE NULL END
    );
  END LOOP;

  -- Update convenience fields on clients when present
  IF r.client_id IS NOT NULL THEN
    UPDATE public.clients SET
      data_processing_consent = COALESCE((p_preferences->>'data_processing')::boolean, data_processing_consent),
      data_processing_consent_date = CASE WHEN (p_preferences->>'data_processing')::boolean IS NOT NULL THEN v_now ELSE data_processing_consent_date END,
      marketing_consent = COALESCE((p_preferences->>'marketing')::boolean, marketing_consent),
      marketing_consent_date = CASE WHEN (p_preferences->>'marketing')::boolean IS NOT NULL THEN v_now ELSE marketing_consent_date END,
      marketing_consent_method = 'website'
    WHERE id = r.client_id;
  END IF;

  UPDATE public.gdpr_consent_requests
  SET status = 'accepted', accepted_at = v_now, evidence = p_evidence
  WHERE id = r.id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ========================================
-- RPC: decline consent (anon)
-- ========================================
CREATE OR REPLACE FUNCTION public.gdpr_decline_consent(
    p_token text,
    p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r public.gdpr_consent_requests;
BEGIN
  SELECT * INTO r FROM public.gdpr_consent_requests WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  UPDATE public.gdpr_consent_requests
  SET status = 'declined', accepted_at = now(), evidence = p_evidence
  WHERE id = r.id;

  -- Optional: record explicit refusal entries for traceability (consent_given = false)
  INSERT INTO public.gdpr_consent_records (
    subject_id, subject_email, consent_type, purpose, consent_given, consent_method,
    consent_evidence, company_id, processed_by, legal_basis
  )
  SELECT r.client_id, r.subject_email, ct, COALESCE(r.purpose,'consent_portal'), false, 'website',
         jsonb_build_object('source','consent_portal','token',p_token,'evidence',p_evidence), r.company_id, NULL, NULL
  FROM unnest(r.consent_types) AS ct;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.gdpr_create_consent_request(uuid, text, text[], text, interval) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_get_consent_request(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_accept_consent(text, jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_decline_consent(text, jsonb) TO anon, authenticated;

COMMIT;
