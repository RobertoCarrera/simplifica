-- Migration: Consent sync triggers from gdpr_consent_records to clients
-- Part of GDPR duplicate cleanup (audit: docs/gdpr-duplicate-audit.md)
--
-- This migration creates triggers so that when gdpr_consent_records is modified,
-- the corresponding cache columns on clients are updated automatically.
--
-- Canonical source: gdpr_consent_records
-- Cache target: clients (marketing_consent, health_data_consent, privacy_policy_consent)
--
-- Design decision: We use a single trigger function per consent type to keep logic
-- explicit and debuggable. A trigger on gdpr_consent_records fires after INSERT/UPDATE.

-- ── 1. Trigger function: sync client cache on consent changes ───────────────────
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
  -- Determine if this is an INSERT or UPDATE (including withdraw)
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

  -- Only sync consent_type records (ignore access_requests, breach_incidents etc)
  IF v_consent_type NOT IN ('marketing', 'health_data', 'privacy_policy', 'data_processing', 'parental_consent') THEN
    RETURN NEW;
  END IF;

  -- Update client cache based on consent type
  CASE v_consent_type
    WHEN 'marketing' THEN
      UPDATE public.clients
      SET
        marketing_consent = v_consent_given,
        marketing_consent_date = CASE WHEN v_consent_given THEN NEW.created_at ELSE marketing_consent_date END,
        -- On withdraw, keep the date but mark consent as false
        -- marketing_consent_method is set on grant; on withdraw it's not updated (already recorded in consent record)
        updated_at = NOW()
      WHERE id = v_client_id;

    WHEN 'health_data' THEN
      UPDATE public.clients
      SET
        health_data_consent = v_consent_given,
        -- No dedicated health_data_consent_date column in clients; use updated_at
        updated_at = NOW()
      WHERE id = v_client_id;

    WHEN 'privacy_policy' THEN
      UPDATE public.clients
      SET
        privacy_policy_consent = v_consent_given,
        privacy_policy_consent_date = CASE WHEN v_consent_given THEN NEW.created_at ELSE privacy_policy_consent_date END,
        updated_at = NOW()
      WHERE id = v_client_id;

    WHEN 'data_processing' THEN
      -- data_processing_consent is deprecated — sync but log for visibility
      UPDATE public.clients
      SET
        data_processing_consent = v_consent_given,
        data_processing_consent_date = CASE WHEN v_consent_given THEN NEW.created_at ELSE data_processing_consent_date END,
        updated_at = NOW()
      WHERE id = v_client_id;

    WHEN 'parental_consent' THEN
      UPDATE public.clients
      SET
        parental_consent_verified = v_consent_given,
        parental_consent_date = CASE WHEN v_consent_given THEN NEW.created_at ELSE parental_consent_date END,
        updated_at = NOW()
      WHERE id = v_client_id;

    ELSE
      -- No-op for unknown consent types
      NULL;
  END CASE;

  -- Also update consent_status on the client to reflect latest state
  -- We take the most recent consent record and update consent_status accordingly
  UPDATE public.clients
  SET
    consent_status = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.gdpr_consent_records
        WHERE subject_id = v_client_id
          AND consent_given = true
          AND withdrawn_at IS NULL
      )
      THEN 'accepted'
      WHEN EXISTS (
        SELECT 1 FROM public.gdpr_consent_records
        WHERE subject_id = v_client_id
          AND consent_given = false
      )
      THEN 'revoked'
      ELSE 'pending'
    END,
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

COMMENT ON FUNCTION public.trg_sync_client_consent_cache() IS
'Trigger function: after INSERT/UPDATE on gdpr_consent_records, syncs the relevant consent boolean + date columns on clients. Also updates clients.consent_status from latest record state.';

-- ── 2. Attach trigger to gdpr_consent_records ────────────────────────────────────
-- Drop existing trigger if present (allows re-running this migration)
DROP TRIGGER IF EXISTS trg_gdpr_consent_sync_client_cache
  ON public.gdpr_consent_records;

CREATE TRIGGER trg_gdpr_consent_sync_client_cache
  AFTER INSERT OR UPDATE OF consent_given, withdrawn_at
  ON public.gdpr_consent_records
  FOR EACH ROW
  WHEN (NEW.subject_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_sync_client_consent_cache();

COMMENT ON TRIGGER trg_gdpr_consent_sync_client_cache
  ON public.gdpr_consent_records IS
  'Auto-syncs clients cache columns (marketing_consent, health_data_consent, privacy_policy_consent, etc.) from gdpr_consent_records. Keeps clients.consent_status derived from latest consent record.';

-- ── 3. Also trigger on DELETE to handle consent record removal ──────────────────
DROP TRIGGER IF EXISTS trg_gdpr_consent_sync_client_cache_delete
  ON public.gdpr_consent_records;

CREATE TRIGGER trg_gdpr_consent_sync_client_cache_delete
  AFTER DELETE
  ON public.gdpr_consent_records
  FOR EACH ROW
  WHEN (OLD.subject_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_sync_client_consent_cache();

COMMENT ON TRIGGER trg_gdpr_consent_sync_client_cache_delete
  ON public.gdpr_consent_records IS
  'Handles consent cache update when a consent record is deleted (marks client cache for re-evaluation).';

-- ── 4. RPC for manual re-sync (for admin use) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_all_client_consents(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sync marketing
  PERFORM public.sync_client_privacy_consent(p_client_id);

  -- Sync marketing from latest marketing record
  UPDATE public.clients c
  SET
    marketing_consent = sub.latest_given,
    marketing_consent_date = sub.latest_date,
    updated_at = NOW()
  FROM (
    SELECT DISTINCT ON (subject_id)
      subject_id,
      consent_given AS latest_given,
      created_at AS latest_date
    FROM public.gdpr_consent_records
    WHERE subject_type = 'client' AND subject_id = p_client_id AND consent_type = 'marketing'
    ORDER BY subject_id, created_at DESC
  ) AS sub
  WHERE sub.subject_id = c.id;

  -- Sync health_data
  UPDATE public.clients c
  SET
    health_data_consent = sub.latest_given,
    updated_at = NOW()
  FROM (
    SELECT DISTINCT ON (subject_id)
      subject_id,
      consent_given AS latest_given
    FROM public.gdpr_consent_records
    WHERE subject_type = 'client' AND subject_id = p_client_id AND consent_type = 'health_data'
    ORDER BY subject_id, created_at DESC
  ) AS sub
  WHERE sub.subject_id = c.id;

END;
$$;

COMMENT ON FUNCTION public.sync_all_client_consents(uuid) IS
'Manually re-syncs all consent cache columns on a client from gdpr_consent_records. Use after bulk import or data repair.';