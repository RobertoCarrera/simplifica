-- Migration: Extend process_email_consent to capture THREE granular RGPD consents
--
-- Sprint: Simplifica consent flow — granular RGPD Art. 7 compliance
-- Author:  Roberto + AI
-- Date:    2026-06-29
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHY THIS MIGRATION
-- ────────────────────────────────────────────────────────────────────────────
--
-- The previous version of `process_email_consent` accepted ONE boolean
-- (p_marketing_consent) and wrote ONE gdpr_consent_records row. That is
-- insufficient under RGPD Art. 7 (Conditions for consent) and the EDPB
-- Guidelines 05/2020 on consent, which require:
--
--   - "the controller must be able to demonstrate that the data subject
--      has consented" (Art. 7.1)
--   - Granular per-purpose consent: separate tick boxes for each processing
--     purpose, not a single all-or-nothing toggle.
--
-- This migration extends the function to accept THREE booleans:
--
--   p_tos_consent       → service provision (terms of service acceptance)
--   p_privacy_consent   → privacy policy acceptance
--   p_marketing_consent → marketing communications (optional)
--
-- All three are written as separate gdpr_consent_records rows (the canonical
-- immutable audit log). The clients cache is updated for all three.
--
-- The function signature changes — callers must pass all three booleans.
-- The token-based process_client_consent RPC is NOT touched (separate path
-- used by the CRM-side consent landing page).
--
-- ────────────────────────────────────────────────────────────────────────────
-- 1. New cache columns on clients
-- ────────────────────────────────────────────────────────────────────────────
--
-- terms_of_service_consent + date are new. privacy_policy_consent / date
-- and marketing_consent / date already exist (see migrations 20260422000001
-- and earlier).

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS terms_of_service_consent       boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_of_service_consent_date  timestamptz;

COMMENT ON COLUMN clients.terms_of_service_consent IS
  'Cache of the latest terms-of-service consent row in gdpr_consent_records '
  '(consent_type=terms_of_service). Synced by trg_sync_client_consent_cache.';

COMMENT ON COLUMN clients.terms_of_service_consent_date IS
  'When the user accepted the terms of service (UTC). NULL until the user '
  'accepts. Never cleared on revocation (audit trail).';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Extend trg_sync_client_consent_cache to handle terms_of_service
-- ────────────────────────────────────────────────────────────────────────────
--
-- The existing trigger (20260422000002) knows about: marketing, health_data,
-- privacy_policy, data_processing, parental_consent. We add a new branch
-- for terms_of_service. We REPLACE the function in place so this migration
-- is self-contained — no separate "fix" migration needed.

CREATE OR REPLACE FUNCTION public.trg_sync_client_consent_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_consent_given boolean;
  v_consent_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_client_id := NEW.subject_id;
    v_consent_given := NEW.consent_given;
    v_consent_type := NEW.consent_type;
  ELSIF TG_OP = 'UPDATE' THEN
    v_client_id := NEW.subject_id;
    v_consent_given := NEW.consent_given;
    v_consent_type := NEW.consent_type;
  ELSE
    RETURN NEW;
  END IF;

  IF v_consent_type NOT IN (
    'marketing', 'health_data', 'privacy_policy',
    'data_processing', 'parental_consent', 'terms_of_service'
  ) THEN
    RETURN NEW;
  END IF;

  CASE v_consent_type
    WHEN 'marketing' THEN
      UPDATE public.clients
      SET marketing_consent = v_consent_given,
          marketing_consent_date = CASE WHEN v_consent_given THEN NEW.created_at
                                         ELSE marketing_consent_date END,
          updated_at = NOW()
      WHERE id = v_client_id;

    WHEN 'health_data' THEN
      UPDATE public.clients
      SET health_data_consent = v_consent_given,
          updated_at = NOW()
      WHERE id = v_client_id;

    WHEN 'privacy_policy' THEN
      UPDATE public.clients
      SET privacy_policy_consent = v_consent_given,
          privacy_policy_consent_date = CASE WHEN v_consent_given THEN NEW.created_at
                                               ELSE privacy_policy_consent_date END,
          updated_at = NOW()
      WHERE id = v_client_id;

    WHEN 'terms_of_service' THEN
      UPDATE public.clients
      SET terms_of_service_consent = v_consent_given,
          terms_of_service_consent_date = CASE WHEN v_consent_given THEN NEW.created_at
                                                 ELSE terms_of_service_consent_date END,
          updated_at = NOW()
      WHERE id = v_client_id;

    WHEN 'data_processing' THEN
      UPDATE public.clients
      SET data_processing_consent = v_consent_given,
          data_processing_consent_date = CASE WHEN v_consent_given THEN NEW.created_at
                                                ELSE data_processing_consent_date END,
          updated_at = NOW()
      WHERE id = v_client_id;

    WHEN 'parental_consent' THEN
      UPDATE public.clients
      SET parental_consent_verified = v_consent_given,
          parental_consent_date = CASE WHEN v_consent_given THEN NEW.created_at
                                         ELSE parental_consent_date END,
          updated_at = NOW()
      WHERE id = v_client_id;
  END CASE;

  UPDATE public.clients
  SET consent_status = (CASE
        WHEN EXISTS (
          SELECT 1 FROM public.gdpr_consent_records
          WHERE subject_id = v_client_id
            AND consent_given = true
            AND withdrawn_at IS NULL
        ) THEN 'accepted'::public.consent_status
        WHEN EXISTS (
          SELECT 1 FROM public.gdpr_consent_records
          WHERE subject_id = v_client_id
            AND consent_given = false
        ) THEN 'revoked'::public.consent_status
        ELSE 'pending'::public.consent_status
      END),
      consent_date = (
        SELECT created_at FROM public.gdpr_consent_records
        WHERE subject_id = v_client_id
        ORDER BY created_at DESC
        LIMIT 1
      ),
      updated_at = NOW()
  WHERE id = v_client_id;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Replace process_email_consent with the 3-boolean signature
-- ────────────────────────────────────────────────────────────────────────────
--
-- Behavior:
--   1. Find the client by (company_id, email). Soft-deleted rows are skipped.
--   2. If a client exists, update its cache columns (terms_of_service_consent,
--      privacy_policy_consent, marketing_consent + matching date columns).
--      consent_status reflects whether the user gave the service-essential
--      consents (tos OR privacy). A full "rejected" path requires all three
--      to be false; we use 'revoked' when none are granted.
--   3. Insert three gdpr_consent_records rows — one per consent_type. Each
--      row carries its own consent_type + purpose. subject_id is set when
--      a client row exists, otherwise NULL (the auth.users trigger backfills
--      later if the user signs up).
--   4. Returns jsonb with success flag, client_id, and a consents object
--      summarizing the three decisions.
--
-- SECURITY DEFINER + search_path pinned to public: see
-- 20260629200000_consent_email_rpcs_and_user_trigger.sql for the rationale.

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
  v_client_id    uuid;
  v_subject_id   uuid;
  v_token_used   text;
  v_now          timestamptz := NOW();
  v_any_granted  boolean;
BEGIN
  -- Normalize email so a case/whitespace typo doesn't create duplicate audit rows.
  p_email := lower(trim(p_email));

  -- Find the client by (company_id, email). Soft-deleted clients are skipped.
  SELECT c.id, c.invitation_token::text
    INTO v_client_id, v_token_used
  FROM public.clients c
  WHERE c.email = p_email
    AND c.company_id = p_company_id
    AND c.deleted_at IS NULL
  LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    v_subject_id := v_client_id;
    v_any_granted := p_tos_consent OR p_privacy_consent OR p_marketing_consent;

    -- Update the client cache. Date columns are stamped only on grant — never
    -- overwritten on revoke (preserves the original grant timestamp for audit).
    -- consent_status mirrors the latest decision: any-granted → 'accepted',
    -- none-granted → 'revoked'.
    UPDATE public.clients
    SET terms_of_service_consent       = p_tos_consent,
        terms_of_service_consent_date  = CASE WHEN p_tos_consent THEN v_now
                                              ELSE terms_of_service_consent_date END,
        privacy_policy_consent         = p_privacy_consent,
        privacy_policy_consent_date    = CASE WHEN p_privacy_consent THEN v_now
                                              ELSE privacy_policy_consent_date END,
        marketing_consent              = p_marketing_consent,
        marketing_consent_date         = CASE WHEN p_marketing_consent THEN v_now
                                              ELSE marketing_consent_date END,
        marketing_consent_method       = p_consent_method,
        consent_date                   = v_now,
        consent_ip                     = p_ip,
        consent_status                 = CASE WHEN v_any_granted
                                              THEN 'accepted'::public.consent_status
                                              ELSE 'revoked'::public.consent_status
                                         END,
        updated_at                     = v_now
    WHERE id = v_client_id;
  END IF;

  -- ── Write 3 audit rows (the immutable consent log) ────────────────────────
  -- One row per consent_type. Same evidence payload; consent_method comes
  -- from the caller and reflects the UI path the user took.
  --
  -- purpose values follow the convention used elsewhere in the codebase
  -- (see handleConsents in client-portal-bff and earlier migrations).
  INSERT INTO public.gdpr_consent_records (
    subject_id, subject_email, consent_type, purpose,
    consent_given, consent_method, consent_evidence,
    company_id, legal_basis, retention_period
  )
  VALUES
    (
      v_subject_id, p_email, 'terms_of_service', 'service_provision',
      p_tos_consent, p_consent_method,
      jsonb_build_object(
        'email', p_email, 'company_id', p_company_id,
        'token_used', v_token_used, 'ip', p_ip, 'user_agent', p_ua,
        'method', 'email_link'
      ),
      p_company_id, 'consent', '5 years'::interval
    ),
    (
      v_subject_id, p_email, 'privacy_policy', 'privacy_policy_acceptance',
      p_privacy_consent, p_consent_method,
      jsonb_build_object(
        'email', p_email, 'company_id', p_company_id,
        'token_used', v_token_used, 'ip', p_ip, 'user_agent', p_ua,
        'method', 'email_link'
      ),
      p_company_id, 'consent', '5 years'::interval
    ),
    (
      v_subject_id, p_email, 'marketing', 'marketing_communications',
      p_marketing_consent, p_consent_method,
      jsonb_build_object(
        'email', p_email, 'company_id', p_company_id,
        'token_used', v_token_used, 'ip', p_ip, 'user_agent', p_ua,
        'method', 'email_link'
      ),
      p_company_id, 'consent', '5 years'::interval
    );

  RETURN jsonb_build_object(
    'success',        true,
    'subject_id',     v_subject_id,
    'client_id',      v_client_id,
    'consent_method', p_consent_method,
    'consents',       jsonb_build_object(
                        'terms_of_service', p_tos_consent,
                        'privacy_policy',  p_privacy_consent,
                        'marketing',       p_marketing_consent
                      )
  );
END;
$$;

COMMENT ON FUNCTION public.process_email_consent(uuid, text, boolean, boolean, boolean, text, text, text) IS
  'Email-based consent decision writer — granular RGPD (3 separate purposes). '
  'Updates clients cache (terms_of_service_consent, privacy_policy_consent, '
  'marketing_consent + dates) when a matching client is found; always writes '
  '3 gdpr_consent_records rows (terms_of_service, privacy_policy, marketing) '
  'for the immutable audit log. subject_id is NULL when no client row exists '
  '— backfilled later by the auth.users trigger when the user signs up. '
  'SECURITY DEFINER with search_path pinned to public.';

GRANT EXECUTE ON FUNCTION public.process_email_consent(uuid, text, boolean, boolean, boolean, text, text, text) TO anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Drop the old single-boolean overload (PostgreSQL overloads by signature)
-- ────────────────────────────────────────────────────────────────────────────
--
-- `CREATE OR REPLACE FUNCTION` only replaces when the argument TYPES match
-- exactly. The old signature had 6 parameters; the new one has 8. PostgreSQL
-- treats them as distinct overloads and keeps BOTH unless we drop the old one
-- explicitly. Leaving the old overload in place would let callers invoke the
-- old path and bypass the new 3-purpose semantics — defeating the purpose of
-- this migration.

DROP FUNCTION IF EXISTS public.process_email_consent(uuid, text, boolean, text, text, text);