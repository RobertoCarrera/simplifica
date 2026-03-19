-- F2-3: AEPD (GDPR Art. 33) breach notification workflow
-- Adds:
--   1. aepd_notification_deadline column (discovered_at + 72 h)
--   2. Trigger on INSERT → logs to gdpr_audit_log + stamps deadline
--   3. get_pending_breach_notifications() – returns overdue unnotified breaches
--   4. pg_cron daily check that inserts a reminder audit row for overdue breaches

-- ── 1. Add deadline column (regular, idempotent) ────────────────────────────
-- GENERATED ALWAYS AS is not used because the cast from the stored type to
-- timestamptz is not considered IMMUTABLE by PostgreSQL.
-- The column is computed by the INSERT trigger below instead.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'gdpr_breach_incidents'
          AND column_name  = 'aepd_notification_deadline'
    ) THEN
        ALTER TABLE public.gdpr_breach_incidents
            ADD COLUMN aepd_notification_deadline TIMESTAMPTZ;
    END IF;
END;
$$;

COMMENT ON COLUMN public.gdpr_breach_incidents.aepd_notification_deadline
    IS 'Hard deadline for AEPD notification per GDPR Art. 33 (discovered_at + 72 h)';

-- ── 2. Trigger function: auto-log new breach to gdpr_audit_log ───────────────

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

DROP TRIGGER IF EXISTS gdpr_breach_created_audit ON public.gdpr_breach_incidents;

-- BEFORE INSERT so we can set NEW.aepd_notification_deadline before the row lands
CREATE TRIGGER gdpr_breach_created_audit
    BEFORE INSERT ON public.gdpr_breach_incidents
    FOR EACH ROW
    EXECUTE FUNCTION gdpr_breach_created_notify();

-- ── 3. Helper: query overdue unnotified breaches ─────────────────────────────

CREATE OR REPLACE FUNCTION get_pending_breach_notifications(p_company_id UUID DEFAULT NULL)
RETURNS TABLE (
    id                          UUID,
    company_id                  UUID,
    incident_reference          TEXT,
    severity_level              TEXT,
    discovered_at               TIMESTAMPTZ,
    aepd_notification_deadline  TIMESTAMPTZ,
    hours_overdue               NUMERIC,
    estimated_affected_subjects INT,
    breach_type                 TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT
        b.id,
        b.company_id,
        b.incident_reference,
        b.severity_level,
        b.discovered_at::timestamptz,
        b.aepd_notification_deadline,
        ROUND(EXTRACT(EPOCH FROM (now() - b.aepd_notification_deadline)) / 3600, 1) AS hours_overdue,
        b.estimated_affected_subjects,
        b.breach_type
    FROM public.gdpr_breach_incidents b
    WHERE
        (b.reported_to_dpa IS NULL OR b.reported_to_dpa = false)
        AND now() > b.aepd_notification_deadline
        AND (p_company_id IS NULL OR b.company_id = p_company_id)
    ORDER BY b.aepd_notification_deadline ASC;
$$;

-- ── 4. pg_cron: daily reminder for overdue unnotified breaches ───────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        -- Remove old schedule if it exists
        PERFORM cron.unschedule('gdpr-breach-overdue-check')
        WHERE EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'gdpr-breach-overdue-check'
        );

        PERFORM cron.schedule(
            'gdpr-breach-overdue-check',
            '0 8 * * *',  -- 08:00 UTC daily
            $cron$
                INSERT INTO public.gdpr_audit_log (
                    action_type, table_name, purpose, new_values
                )
                SELECT
                    'breach_overdue_reminder',
                    'gdpr_breach_incidents',
                    'AEPD notification overdue – immediate action required',
                    jsonb_build_object(
                        'incident_reference', incident_reference,
                        'hours_overdue',      hours_overdue,
                        'severity_level',     severity_level
                    )
                FROM get_pending_breach_notifications();
            $cron$
        );
    END IF;
END;
$$;
