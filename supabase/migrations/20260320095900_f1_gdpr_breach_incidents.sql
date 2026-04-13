-- =============================================================================
-- F1-3: GDPR breach incidents table (foundation for F2 features)
-- Purpose: Creates the gdpr_breach_incidents table as referenced by
--          20260320100001_f2_data_retention_cron.sql and
--          20260320100002_f2_breach_notification.sql.
-- Schema:  Based on production table definition, including aepd_notification_deadline
--          column and gdpr_breach_created_audit trigger.
-- Idempotent: Uses CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
--             DROP TRIGGER IF EXISTS.
-- =============================================================================

-- ── 1. Create the table (IF NOT EXISTS) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gdpr_breach_incidents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  incident_reference text NOT NULL,
  breach_type text[] NOT NULL,
  discovered_at timestamptz NOT NULL,
  reported_at timestamptz NULL,
  reported_to_dpa boolean NULL DEFAULT false,
  dpa_reference text NULL,
  data_subjects_notified boolean NULL DEFAULT false,
  notification_method text NULL,
  affected_data_categories text[] NULL,
  estimated_affected_subjects integer NULL,
  likely_consequences text NULL,
  mitigation_measures text NULL,
  preventive_measures text NULL,
  severity_level text NULL,
  company_id uuid NULL,
  reported_by uuid NULL,
  incident_details jsonb NULL DEFAULT '{}'::jsonb,
  resolution_status text NULL DEFAULT 'open'::text,
  resolved_at timestamptz NULL,
  created_at timestamptz NULL DEFAULT now(),
  updated_at timestamptz NULL DEFAULT now(),
  aepd_notification_deadline timestamptz NULL,
  CONSTRAINT gdpr_breach_incidents_pkey PRIMARY KEY (id),
  CONSTRAINT gdpr_breach_incidents_incident_reference_key UNIQUE (incident_reference),
  CONSTRAINT gdpr_breach_incidents_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT gdpr_breach_incidents_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES auth.users (id),
  CONSTRAINT valid_resolution_status CHECK (
    (
      resolution_status = ANY (
        ARRAY[
          'open'::text,
          'investigating'::text,
          'contained'::text,
          'resolved'::text
        ]
      )
    )
  ),
  CONSTRAINT valid_severity CHECK (
    (
      severity_level = ANY (
        ARRAY[
          'low'::text,
          'medium'::text,
          'high'::text,
          'critical'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

-- ── 2. Create the trigger function (same as in F2) ────────────────────────────

CREATE OR REPLACE FUNCTION gdpr_breach_created_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deadline TIMESTAMPTZ;
BEGIN
    -- Stamp the 72-hour deadline on the row (BEFORE INSERT trigger)
    v_deadline := NEW.discovered_at::timestamptz + INTERVAL '72 hours';
    NEW.aepd_notification_deadline := v_deadline;

    -- Write an immutable audit entry for the breach
    INSERT INTO public.gdpr_audit_log (
        user_id,
        company_id,
        action_type,
        table_name,
        record_id,
        purpose,
        legal_basis,
        new_values
    ) VALUES (
        NEW.reported_by::UUID,
        NEW.company_id,
        'breach_registered',
        'gdpr_breach_incidents',
        NEW.id,
        'GDPR Art. 33 breach registered – 72 h DPA notification window started',
        'legal_obligation',
        jsonb_build_object(
            'incident_reference',          NEW.incident_reference,
            'severity_level',              NEW.severity_level,
            'breach_type',                 NEW.breach_type,
            'estimated_affected_subjects', NEW.estimated_affected_subjects,
            'aepd_deadline',               v_deadline
        )
    );

    RETURN NEW;
END;
$$;

-- ── 3. Create the trigger (DROP IF EXISTS first) ──────────────────────────────

DROP TRIGGER IF EXISTS gdpr_breach_created_audit ON public.gdpr_breach_incidents;

CREATE TRIGGER gdpr_breach_created_audit
    BEFORE INSERT ON public.gdpr_breach_incidents
    FOR EACH ROW
    EXECUTE FUNCTION gdpr_breach_created_notify();

-- ── 4. Create indexes (optional, but good for performance) ────────────────────

CREATE INDEX IF NOT EXISTS idx_gdpr_breach_incidents_company_id 
    ON public.gdpr_breach_incidents (company_id);

CREATE INDEX IF NOT EXISTS idx_gdpr_breach_incidents_reported_by 
    ON public.gdpr_breach_incidents (reported_by);

CREATE INDEX IF NOT EXISTS idx_gdpr_breach_incidents_resolved_at 
    ON public.gdpr_breach_incidents (resolved_at);

CREATE INDEX IF NOT EXISTS idx_gdpr_breach_incidents_aepd_deadline 
    ON public.gdpr_breach_incidents (aepd_notification_deadline);

-- ── 5. Comments ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.gdpr_breach_incidents IS 
    'Records of GDPR personal data breaches, per Art. 33 notification requirements.';

COMMENT ON COLUMN public.gdpr_breach_incidents.aepd_notification_deadline IS 
    'Hard deadline for AEPD notification per GDPR Art. 33 (discovered_at + 72 h).';