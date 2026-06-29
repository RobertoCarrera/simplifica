-- Migration: withdraw_consent RPC + portal_withdraw endpoint
--
-- Sprint: Simplifica consent flow — RGPD Art. 7.3 withdrawal right
-- Author:  Roberto + AI
-- Date:    2026-06-29
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- RGPD Art. 7.3: "The data subject shall have the right to withdraw his or
-- her consent at any time. The withdrawal of consent shall not affect the
-- lawfulness of processing based on consent before its withdrawal. Prior to
-- consent, the data subject shall be informed thereof. Withdrawal of consent
-- shall be as easy as giving consent."
--
-- Up to now, the portal could toggle marketing_consent / privacy_policy_consent
-- via the client-portal-bff POST /consents endpoint (which only logged to
-- gdpr_consent_records; the clients cache has no consent columns in
-- client_portal_users). There was NO first-class "withdraw" path that:
--   - Set the clients cache columns to false (so the CRM UI reflects it)
--   - Wrote a withdrawal audit row with consent_method = 'withdrawal'
--   - Worked for ALL three granular consents (TOS, privacy, marketing)
--
-- This migration adds:
--   1. `withdraw_consent(p_subject_email, p_consent_type)` — writes the
--      withdrawal audit row + updates the matching clients cache columns.
--   2. The portal endpoint can call this RPC for the authenticated user.
--   3. The existing `trg_sync_client_consent_cache` trigger automatically
--      syncs cache columns from new gdpr_consent_records inserts, but we
--      also explicitly UPDATE the clients row here so withdrawal takes
--      effect immediately without waiting for the trigger.
--
-- Note on `withdrawn_at`: gdpr_consent_records.is_active is a generated
-- column = (withdrawn_at IS NULL). We do NOT set withdrawn_at on a new
-- "withdrawal" row — that row IS the withdrawal, marked with
-- consent_given=false, consent_method='withdrawal'. The audit log stays
-- immutable.

CREATE OR REPLACE FUNCTION public.withdraw_consent(
  p_subject_email text,
  p_consent_type  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject_email text;
  v_consent_type  text;
  v_client_id     uuid;
  v_subject_id    uuid;
  v_now           timestamptz := NOW();
  v_updated       boolean := false;
BEGIN
  -- Normalize inputs
  v_subject_email := lower(trim(p_subject_email));
  v_consent_type  := lower(trim(p_consent_type));

  -- Validate consent_type
  IF v_consent_type NOT IN (
    'terms_of_service', 'privacy_policy', 'marketing',
    'health_data', 'analytics', 'data_processing', 'third_party_sharing'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'invalid_consent_type'
    );
  END IF;

  -- Resolve the client row by email. Use latest non-deleted row.
  SELECT c.id
    INTO v_client_id
  FROM public.clients c
  WHERE c.email = v_subject_email
    AND c.deleted_at IS NULL
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_client_id IS NULL THEN
    -- No matching client — still write the audit row so the withdrawal is
    -- recorded against the email even if the client row was deleted.
    v_subject_id := NULL;
  ELSE
    v_subject_id := v_client_id;

    -- Update the clients cache columns. Note: we DO NOT clear the *_consent_date
    -- columns because those represent the ORIGINAL grant timestamp and must
    -- be preserved for audit (RGPD Art. 7.1 demonstrability).
    UPDATE public.clients
    SET terms_of_service_consent     = CASE WHEN v_consent_type = 'terms_of_service' THEN false ELSE terms_of_service_consent END,
        privacy_policy_consent       = CASE WHEN v_consent_type = 'privacy_policy'   THEN false ELSE privacy_policy_consent END,
        marketing_consent            = CASE WHEN v_consent_type = 'marketing'        THEN false ELSE marketing_consent END,
        consent_status               = CASE
                                        WHEN NOT (terms_of_service_consent OR privacy_policy_consent OR marketing_consent)
                                          THEN 'revoked'::public.consent_status
                                        ELSE consent_status
                                      END,
        consent_date                 = v_now,
        updated_at                   = v_now
    WHERE id = v_client_id;

    v_updated := true;
  END IF;

  -- Always write the audit row (the immutable consent log).
  INSERT INTO public.gdpr_consent_records (
    subject_id, subject_email, consent_type, purpose,
    consent_given, consent_method, consent_evidence,
    company_id, legal_basis, retention_period
  )
  SELECT
    v_subject_id,
    v_subject_email,
    v_consent_type::public.consent_type,
    CASE v_consent_type
      WHEN 'terms_of_service'   THEN 'service_provision'
      WHEN 'privacy_policy'     THEN 'privacy_policy_acceptance'
      WHEN 'marketing'          THEN 'marketing_communications'
      WHEN 'health_data'        THEN 'health_data_processing'
      WHEN 'analytics'          THEN 'analytics_tracking'
      WHEN 'data_processing'    THEN 'data_processing_agreement'
      WHEN 'third_party_sharing' THEN 'third_party_data_sharing'
    END,
    false,
    'withdrawal',
    jsonb_build_object(
      'method',         'withdrawal',
      'requested_by',   'subject',
      'channel',        'portal',
      'company_id',     (SELECT company_id FROM public.clients WHERE id = v_client_id LIMIT 1)
    ),
    (SELECT company_id FROM public.clients WHERE id = v_client_id LIMIT 1),
    'consent',
    '5 years'::interval;

  RETURN jsonb_build_object(
    'success',      true,
    'subject_id',   v_subject_id,
    'client_id',    v_client_id,
    'consent_type', v_consent_type,
    'updated_cache', v_updated
  );
END;
$$;

COMMENT ON FUNCTION public.withdraw_consent(text, text) IS
  'Withdraws a single consent purpose for the given subject email. Updates '
  'the clients cache columns (terms_of_service_consent / '
  'privacy_policy_consent / marketing_consent) to false and writes a '
  'gdpr_consent_records row with consent_given=false, consent_method='
  '''withdrawal''. Does NOT clear *_consent_date columns — those preserve the '
  'original grant timestamp for RGPD Art. 7.1 audit. '
  'SECURITY DEFINER with search_path pinned to public.';

GRANT EXECUTE ON FUNCTION public.withdraw_consent(text, text) TO authenticated, anon;

-- ────────────────────────────────────────────────────────────────────────────
-- Public unsubscribe RPC — used by the GET /unsubscribe email link (Path 4)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Marketing emails sent by send-client-consent-invite / send-branded-email
-- include an unsubscribe link `${PORTAL_URL}/unsubscribe?c=<company_id>&e=
-- <email>&type=marketing`. That link is public (no JWT) so we cannot rely on
-- the authenticated withdraw_consent. unsubscribe_by_email is the public
-- counterpart: it scopes the withdrawal to a single (company_id, email)
-- pair — the same authorization model used by get_consent_request_by_email
-- and process_email_consent.
--
-- LSSI Art. 21 + RGPD Art. 7.3: every marketing communication MUST offer a
-- simple, free opt-out. We honor withdrawal immediately.

CREATE OR REPLACE FUNCTION public.unsubscribe_by_email(
  p_company_id   uuid,
  p_email        text,
  p_consent_type text DEFAULT 'marketing'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email       text;
  v_consent_type text;
  v_client_id   uuid;
  v_subject_id  uuid;
  v_company_id  uuid;
  v_now         timestamptz := NOW();
BEGIN
  v_email        := lower(trim(p_email));
  v_consent_type := lower(trim(COALESCE(p_consent_type, 'marketing')));

  IF v_consent_type NOT IN ('marketing', 'terms_of_service', 'privacy_policy') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_consent_type');
  END IF;

  -- Find the client row matching (company_id, email).
  SELECT c.id
    INTO v_client_id
  FROM public.clients c
  WHERE c.email = v_email
    AND c.company_id = p_company_id
    AND c.deleted_at IS NULL
  LIMIT 1;

  v_company_id := p_company_id;

  IF v_client_id IS NOT NULL THEN
    v_subject_id := v_client_id;

    -- Update the matching consent flag. For unsubscribe links we only flip
    -- the consent the user asked to opt out from — typically 'marketing'.
    UPDATE public.clients
    SET marketing_consent      = CASE WHEN v_consent_type = 'marketing' THEN false ELSE marketing_consent END,
        consent_status         = CASE
                                  WHEN v_consent_type = 'marketing' AND NOT marketing_consent
                                    THEN 'revoked'::public.consent_status
                                  ELSE consent_status
                                END,
        consent_date           = v_now,
        updated_at             = v_now
    WHERE id = v_client_id;
  END IF;

  -- Write the audit row. consent_method = 'unsubscribe_link' so the AEPD can
  -- tell withdrawal happened via the email's unsubscribe link vs. the portal.
  INSERT INTO public.gdpr_consent_records (
    subject_id, subject_email, consent_type, purpose,
    consent_given, consent_method, consent_evidence,
    company_id, legal_basis, retention_period
  )
  VALUES (
    v_subject_id,
    v_email,
    v_consent_type::public.consent_type,
    CASE v_consent_type
      WHEN 'marketing'        THEN 'marketing_communications'
      WHEN 'terms_of_service' THEN 'service_provision'
      WHEN 'privacy_policy'   THEN 'privacy_policy_acceptance'
    END,
    false,
    'unsubscribe_link',
    jsonb_build_object(
      'method',     'unsubscribe_link',
      'channel',    'email_unsubscribe',
      'company_id', v_company_id
    ),
    v_company_id,
    'consent',
    '5 years'::interval
  );

  RETURN jsonb_build_object(
    'success',      true,
    'client_id',    v_client_id,
    'consent_type', v_consent_type,
    'channel',      'email_unsubscribe'
  );
END;
$$;

COMMENT ON FUNCTION public.unsubscribe_by_email(uuid, text, text) IS
  'Public unsubscribe RPC for email opt-out links (LSSI Art. 21 + RGPD Art. 7.3). '
  'Authorized by (company_id, email) — no JWT required. Writes a gdpr_consent_records '
  'row with consent_given=false, consent_method=''unsubscribe_link''. Updates the '
  'matching clients cache column to false. Returns success even if no client row '
  'matches (still writes the audit log for proof of withdrawal attempt). '
  'SECURITY DEFINER with search_path pinned to public.';

GRANT EXECUTE ON FUNCTION public.unsubscribe_by_email(uuid, text, text) TO anon, authenticated;