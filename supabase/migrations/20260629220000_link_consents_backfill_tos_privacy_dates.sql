-- Migration: Extend trg_link_consents_to_new_user to backfill TOS + privacy consent dates
--
-- Sprint: Simplifica consent flow — granular RGPD Art. 7 compliance
-- Author:  Roberto + AI
-- Date:    2026-06-29
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHY THIS MIGRATION
-- ────────────────────────────────────────────────────────────────────────────
--
-- The existing trigger `trg_link_consents_to_new_user` (created in
-- 20260629200000_consent_email_rpcs_and_user_trigger.sql) fires AFTER INSERT
-- on auth.users. When a portal user signs up via magic link with the SAME
-- email they previously used in the consent landing page, the trigger:
--
--   1. Backfills gdpr_consent_records.subject_id where subject_email matches
--      and subject_id IS NULL — so the user can see their prior consents.
--   2. Updates clients.auth_user_id and clients.marketing_consent_date.
--
-- However it ONLY stamps `marketing_consent_date`. After migration
-- 20260629210000_consent_email_three_types.sql there are THREE granular
-- consent dates on the clients cache:
--
--   - marketing_consent_date           (already filled by the trigger)
--   - privacy_policy_consent_date      (NOT filled — bug)
--   - terms_of_service_consent_date    (NOT filled — bug)
--
-- Without those date columns the clients cache is incomplete: the trigger
-- trg_sync_client_consent_cache fills them from gdpr_consent_records inserts,
-- but only when a new gdpr_consent_records row is inserted AFTER the trigger
-- has fired. For the account-linking path (sign-up matches a pre-existing
-- consent row) the dates never get backfilled.
--
-- ────────────────────────────────────────────────────────────────────────────
-- FIX
-- ────────────────────────────────────────────────────────────────────────────
--
-- For each consent row already linked to this user by the first UPDATE
-- (subject_id backfill), update the corresponding clients cache date column
-- ONLY if it is currently NULL — we never overwrite a previously recorded
-- grant timestamp. We use the consent row's created_at as the date to record.
--
-- We don't touch consent_status / *_consent booleans here because:
--   - the trg_sync_client_consent_cache trigger already syncs them from
--     gdpr_consent_records inserts;
--   - changing consent booleans during account creation would silently flip a
--     user's prior decision.
--
-- The backfill is idempotent: re-running the trigger on the same user (which
-- doesn't happen in normal operation since AFTER INSERT fires once) would
-- still be safe because of the COALESCE / IS NULL guards.

CREATE OR REPLACE FUNCTION public.link_consents_to_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  -- ── 1. Backfill gdpr_consent_records subject_id ─────────────────────────────
  -- The core account-linking step: a portal user with magic-link email X
  -- sees every prior gdpr_consent_records row for X where subject_id was NULL.
  UPDATE public.gdpr_consent_records
  SET subject_id = NEW.id,
      updated_at = NOW()
  WHERE subject_email = NEW.email
    AND subject_id IS NULL;

  -- ── 2. Resolve the matching client row (if any) ─────────────────────────────
  -- We resolve ONCE and use the id for all three date backfills below. The
  -- trigger does not change consent booleans — only fills the *_consent_date
  -- cache columns that were previously left NULL.
  SELECT id
    INTO v_client_id
  FROM public.clients
  WHERE email = NEW.email
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── 3. Link the client to the auth user + fill marketing_consent_date ───────
  -- (Preserves any existing marketing_consent_date — only fills if NULL.)
  UPDATE public.clients
  SET auth_user_id           = NEW.id,
      marketing_consent_date = COALESCE(marketing_consent_date, NOW()),
      updated_at             = NOW()
  WHERE id = v_client_id
    AND (auth_user_id IS NULL OR auth_user_id = NEW.id);

  -- ── 4. Backfill privacy_policy_consent_date from gdpr_consent_records ──────
  -- We pull the most recent (created_at) consent_given=true row's date. If
  -- the user has not yet granted privacy, the date stays NULL. We never
  -- overwrite an existing date (preserves audit trail of original grant).
  UPDATE public.clients c
  SET privacy_policy_consent_date = sub.first_granted_at,
      updated_at = NOW()
  FROM (
    SELECT subject_id, MIN(created_at) AS first_granted_at
    FROM public.gdpr_consent_records
    WHERE subject_id = v_client_id
      AND consent_type = 'privacy_policy'
      AND consent_given = true
    GROUP BY subject_id
  ) sub
  WHERE c.id = v_client_id
    AND c.privacy_policy_consent_date IS NULL;

  -- ── 5. Backfill terms_of_service_consent_date the same way ─────────────────
  UPDATE public.clients c
  SET terms_of_service_consent_date = sub.first_granted_at,
      updated_at = NOW()
  FROM (
    SELECT subject_id, MIN(created_at) AS first_granted_at
    FROM public.gdpr_consent_records
    WHERE subject_id = v_client_id
      AND consent_type = 'terms_of_service'
      AND consent_given = true
    GROUP BY subject_id
  ) sub
  WHERE c.id = v_client_id
    AND c.terms_of_service_consent_date IS NULL;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.link_consents_to_new_user() IS
  'Trigger: when auth.users gains a row, backfill gdpr_consent_records.subject_id '
  'and clients.auth_user_id by matching the new user email. Also fills '
  'privacy_policy_consent_date and terms_of_service_consent_date from the '
  'earliest consent_given=true row (only when currently NULL — never overwrites '
  'an existing date). Lets a user see and manage consents they gave before '
  'creating a portal account.';

-- Trigger itself is unchanged — it's already created in the earlier migration.
-- We do not DROP / CREATE it again to avoid breaking edge cases where the
-- function name changed.