-- Migration: Email-based consent capture RPCs + auth.users trigger
--
-- Sprint: Simplifica consent flow redesign — third-party UX (no tokens)
-- Author:  Roberto + AI
-- Date:    2026-06-29
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- The previous consent-migration flow used a per-client UUID token in the URL.
-- That made the email longer, required client.invitation_token rotation, and
-- forced the portal page to do a token-lookup RPC that had been revoked from
-- the anon role (forcing migrations on the token RPC path every time the
-- security model tightened).
--
-- The new flow uses email + company in the URL (no token):
--
--   https://portal.simplificacrm.es/consent?c=<company_id>&e=<urlencoded_email>
--
-- The user is identified by (company_id, email) — the email is the
-- already-known identifier we email them at. The portal page is a 1-tap form:
-- "Hola X, <company> quiere enviarte comunicaciones comerciales. ¿Aceptas?"
-- with two equally prominent buttons (Aceptar / Rechazar) and a subtle
-- "Crear cuenta" link for users who want to manage their data permanently.
--
-- Storage rule:
--   - gdpr_consent_records is the canonical audit log. subject_id is nullable
--     for users that don't yet have a portal account — when they later sign
--     up, a trigger on auth.users backfills subject_id from subject_email.
--   - clients is the cache table (marketing_consent, consent_status, etc.).
--     Existing trigger trg_sync_client_consent_cache already syncs these from
--     gdpr_consent_records when subject_id is set.
--
-- ────────────────────────────────────────────────────────────────────────────
-- RPC 1: get_consent_request_by_email(p_company_id uuid, p_email text)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Returns the consent-request info for a (company, email) pair. Powers the
-- portal consent landing page (route /consent?c=...&e=...).
--
-- SECURITY DEFINER so the anon caller can read the client/company rows
-- without needing a per-row RLS policy that would otherwise require a
-- tenant-scoped claim. search_path pinned to public.
--
-- Returns one row only when a matching client exists. If no client matches
-- we return zero rows — the portal shows the friendly "enlace no válido" view.
--
-- has_account: true if an auth.users row already exists for this email
-- (so the portal can offer "Iniciar sesión" instead of "Crear cuenta").

CREATE OR REPLACE FUNCTION public.get_consent_request_by_email(
  p_company_id uuid,
  p_email text
)
RETURNS TABLE (
  client_id uuid,
  client_name text,
  subject_email text,
  company_id uuid,
  company_name text,
  company_nif text,
  invitation_status text,
  consent_status text,
  privacy_policy_url text,
  has_account boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_client record;
  v_company record;
BEGIN
  -- Normalize email so a typo in the URL doesn't change the lookup
  p_email := lower(trim(p_email));

  SELECT c.id,
         c.name,
         c.email,
         c.company_id,
         c.invitation_status::text AS invitation_status,
         c.consent_status::text   AS consent_status
    INTO v_client
  FROM public.clients c
  WHERE c.email = p_email
    AND c.company_id = p_company_id
    AND c.deleted_at IS NULL
  LIMIT 1;

  -- No matching client → empty result. The portal handles this gracefully.
  IF v_client.id IS NULL THEN
    RETURN;
  END IF;

  SELECT name, nif
    INTO v_company
  FROM public.companies
  WHERE id = p_company_id
  LIMIT 1;

  RETURN QUERY SELECT
    v_client.id,
    v_client.name::text,
    v_client.email::text,
    p_company_id,
    COALESCE(v_company.name, '')::text,
    COALESCE(v_company.nif, '')::text,
    COALESCE(v_client.invitation_status, 'not_sent'),
    COALESCE(v_client.consent_status, 'pending'),
    -- Privacy policy URL: prefer a company-specific URL if stored on
    -- companies (added in a later migration), otherwise the default app URL.
    COALESCE(
      NULLIF(
        (SELECT c2.privacy_policy_url::text FROM public.companies c2 WHERE c2.id = p_company_id LIMIT 1),
        ''
      ),
      'https://app.simplificacrm.es/privacidad'
    ),
    -- has_account: TRUE if a portal auth user already exists for this email.
    -- Drives "Iniciar sesión" vs "Crear cuenta" copy in the portal page.
    EXISTS(SELECT 1 FROM auth.users au WHERE lower(trim(au.email)) = p_email);
END;
$$;

COMMENT ON FUNCTION public.get_consent_request_by_email(uuid, text) IS
  'Email-based consent-request lookup. Powers the /consent?c=&e= portal page. '
  'SECURITY DEFINER with search_path pinned to public. Returns one row when a '
  'client matches (company_id, email) and is not soft-deleted; otherwise empty.';

GRANT EXECUTE ON FUNCTION public.get_consent_request_by_email(uuid, text) TO anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC 2: process_email_consent(p_company_id uuid, p_email text, p_marketing_consent boolean, ...)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Writes the user's accept/reject decision:
--   - Updates clients (marketing_consent, marketing_consent_date, consent_*)
--     if a matching client exists.
--   - Always inserts a gdpr_consent_records row (the immutable audit log).
--     subject_id is set when a client row exists, otherwise NULL — the
--     auth.users trigger backfills subject_id later if the user signs up.
--
-- Returns jsonb so the portal can branch on success/error without parsing
-- multiple result sets.
--
-- SECURITY DEFINER because:
--   - the anon caller writes to clients and gdpr_consent_records without a
--     per-tenant claim;
--   - search_path pinned to public to satisfy the Supabase advisory.

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
  -- Normalize email so a case/whitespace typo doesn't create duplicate audit rows
  p_email := lower(trim(p_email));

  -- Find the client by (company_id, email). Soft-deleted clients are skipped.
  SELECT c.id
    INTO v_client_id
  FROM public.clients c
  WHERE c.email = p_email
    AND c.company_id = p_company_id
    AND c.deleted_at IS NULL
  LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    v_subject_id := v_client_id;

    -- Update the client cache. consent_status mirrors accept/reject verbatim.
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

  -- Always write the audit row. When v_subject_id IS NULL, the row sits
  -- waiting for the auth.users trigger to backfill subject_id from email.
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
    retention_period,
    is_active,
    created_at,
    updated_at
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
    '5 years'::interval,
    true,
    v_now,
    v_now
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

-- ────────────────────────────────────────────────────────────────────────────
-- Trigger: link consents to a new auth.users record
-- ────────────────────────────────────────────────────────────────────────────
--
-- When a user signs up via magic link and auth.users gains a row, link any
-- pre-existing consent records to that user so they can see / manage them
-- from their portal account.
--
--   - gdpr_consent_records.subject_id is backfilled where subject_email
--     matches the new user's email and subject_id IS NULL.
--   - clients.auth_user_id is set where email matches and auth_user_id IS NULL.
--     marketing_consent_date is only filled when missing — we don't want to
--     overwrite an already-recorded consent date.
--
-- SECURITY DEFINER because the trigger fires as the calling user when inserting
-- into auth.users — without it the anon / authenticated caller cannot touch
-- other schemas.

CREATE OR REPLACE FUNCTION public.link_consents_to_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Backfill gdpr_consent_records subject_id where email matches and is null.
  -- This is the core account-linking feature: the consent the user gave
  -- before creating the account becomes visible from the portal.
  UPDATE public.gdpr_consent_records
  SET subject_id = NEW.id,
      updated_at = NOW()
  WHERE subject_email = NEW.email
    AND subject_id IS NULL;

  -- Link the clients row to the auth user when email matches and not already
  -- linked. Preserves any existing marketing_consent_date.
  UPDATE public.clients
  SET auth_user_id            = NEW.id,
      marketing_consent_date  = COALESCE(marketing_consent_date, NOW()),
      updated_at              = NOW()
  WHERE email = NEW.email
    AND auth_user_id IS NULL
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.link_consents_to_new_user() IS
  'Trigger: when auth.users gains a row, backfill gdpr_consent_records.subject_id '
  'and clients.auth_user_id by matching the new user email. Lets a user see '
  'and manage consents they gave before creating a portal account.';

DROP TRIGGER IF EXISTS trg_link_consents_to_new_user ON auth.users;
CREATE TRIGGER trg_link_consents_to_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_consents_to_new_user();