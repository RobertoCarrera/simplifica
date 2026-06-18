-- ============================================================================
-- Migration: 20260618000000_fix_consent_sync_trigger_cast.sql
--
-- Bug: trigger trg_sync_client_consent_cache on public.gdpr_consent_records
-- updates public.clients.consent_status with a CASE expression that returns
-- text literals ('accepted' / 'revoked' / 'pending'), but consent_status is of
-- type public.consent_status (enum). Postgres raises:
--   "column consent_status is of type public.consent_status but expression
--    is of type text"
-- which aborts the entire transaction, which means gdpr_accept_consent
-- rolls back both the consent record AND the clients column updates.
-- Net effect: the patient clicks "Acepto" in the portal, gets a 500-style
-- error, and the consent is NOT recorded anywhere.
--
-- Impact:
--   - The whole GDPR consent audit trail is broken
--   - gdpr_accept_consent is silently failing for every patient
--   - clients.health_data_consent stays at its previous value
--   - The Marketing consent-collection flow that the user is about to ship
--     cannot work
--   - The clinical-notes import wizard cannot get new consents via the portal
--
-- Fix: cast the CASE result to public.consent_status. Single-line change.
--
-- Pre-conditions: the function trg_sync_client_consent_cache() exists with
-- the broken CASE (see supabase/migrations/20260422000002_add_consent_sync_triggers.sql
-- for the original). This migration replaces the function body and reattaches
-- the trigger so we don't have to drop+create the trigger (which would lose
-- audit trail of trigger changes).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_sync_client_consent_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id      uuid;
  v_consent_given  boolean;
  v_type           text;
BEGIN
  -- ── 1. Resolve the (client_id, consent_type) of this record ─────────
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_client_id     := NEW.subject_id;
    v_consent_given := NEW.consent_given;
    v_type          := NEW.consent_type;
  ELSIF TG_OP = 'DELETE' THEN
    v_client_id     := OLD.subject_id;
    v_consent_given := OLD.consent_given;
    v_type          := OLD.consent_type;
  ELSE
    RETURN NEW;
  END IF;

  -- ── 2. Only sync the consent types that have a clients cache column ──
  IF v_type NOT IN (
    'marketing', 'health_data', 'privacy_policy',
    'data_processing', 'parental_consent'
  ) THEN
    RETURN NEW;
  END IF;

  -- ── 3. Update the type-specific boolean column on clients ───────────
  CASE v_type
    WHEN 'marketing' THEN
      UPDATE public.clients SET
        marketing_consent      = v_consent_given,
        marketing_consent_date = CASE WHEN v_consent_given THEN NEW.created_at ELSE marketing_consent_date END,
        updated_at             = NOW()
      WHERE id = v_client_id;

    WHEN 'health_data' THEN
      UPDATE public.clients SET
        health_data_consent     = v_consent_given,
        health_data_consent_date = CASE WHEN v_consent_given THEN NEW.created_at ELSE health_data_consent_date END,
        updated_at              = NOW()
      WHERE id = v_client_id;

    WHEN 'privacy_policy' THEN
      UPDATE public.clients SET
        privacy_policy_consent      = v_consent_given,
        privacy_policy_consent_date = CASE WHEN v_consent_given THEN NEW.created_at ELSE privacy_policy_consent_date END,
        updated_at                  = NOW()
      WHERE id = v_client_id;

    WHEN 'data_processing' THEN
      -- Deprecated 2026-04: synced for backward compatibility only
      UPDATE public.clients SET
        data_processing_consent      = v_consent_given,
        data_processing_consent_date = CASE WHEN v_consent_given THEN NEW.created_at ELSE data_processing_consent_date END,
        updated_at                   = NOW()
      WHERE id = v_client_id;

    WHEN 'parental_consent' THEN
      UPDATE public.clients SET
        parental_consent_verified = v_consent_given,
        parental_consent_date     = CASE WHEN v_consent_given THEN NEW.created_at ELSE parental_consent_date END,
        updated_at                = NOW()
      WHERE id = v_client_id;
  END CASE;

  -- ── 4. Update consent_status + consent_date from latest record ─────
  -- FIX: cast CASE result to the public.consent_status enum.
  -- Without the cast, this UPDATE fails with a type mismatch and
  -- rolls back the entire transaction.
  UPDATE public.clients SET
    consent_status = (CASE
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
$function$;

COMMENT ON FUNCTION public.trg_sync_client_consent_cache() IS
'Trigger function: after INSERT/UPDATE on gdpr_consent_records, syncs the relevant consent boolean + date columns on clients. Also updates clients.consent_status (cast to public.consent_status enum — see migration 20260618000000_fix_consent_sync_trigger_cast) from latest record state.';

NOTIFY pgrst, 'reload schema';
