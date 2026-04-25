-- ============================================================
-- GDPR Art. 12(3): ARCO requests must be answered within 1 month
-- of receipt (extendable to 3 months for complex cases).
-- This migration adds daily detection of overdue requests,
-- inserting them as anomalies so the security-anomaly-alerts
-- Edge Function alerts the DPO automatically.
-- ============================================================

-- ── 1. Detection function ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.detect_overdue_arco_requests()
RETURNS INT   -- number of new anomaly records inserted
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_found  INT := 0;
    v_rec    RECORD;
BEGIN
    -- GDPR Art. 12(3): 1-month deadline from request receipt
    -- "Completed" statuses that should NOT trigger an alert:
    --   'completed', 'closed', 'rejected', 'resolved'
    FOR v_rec IN
        SELECT
            ar.id,
            ar.company_id,
            ar.request_type,
            ar.subject_email,
            ar.subject_name,
            ar.verification_status,
            ar.created_at,
            ar.created_at + INTERVAL '1 month'  AS deadline,
            EXTRACT(DAY FROM now() - (ar.created_at + INTERVAL '1 month'))::int  AS days_overdue
        FROM public.gdpr_access_requests ar
        WHERE
            ar.verification_status NOT IN ('completed', 'closed', 'rejected', 'resolved')
            AND ar.created_at + INTERVAL '1 month' < now()
    LOOP
        -- Deduplicate: skip if an identical anomaly was raised in the last 24 hours
        -- for the same request_id to avoid alert spam while still re-alerting daily.
        IF NOT EXISTS (
            SELECT 1
            FROM public.gdpr_anomalies a
            WHERE a.anomaly_type = 'arco_request_overdue'
              AND a.evidence->>'request_id' = v_rec.id::text
              AND a.created_at >= now() - INTERVAL '24 hours'
        ) THEN
            INSERT INTO public.gdpr_anomalies (
                company_id,
                anomaly_type,
                severity,
                description,
                evidence
            ) VALUES (
                v_rec.company_id,
                'arco_request_overdue',
                CASE
                    WHEN v_rec.days_overdue > 60 THEN 'critical'   -- >2 months past deadline
                    WHEN v_rec.days_overdue > 30 THEN 'high'       -- >1 month past deadline
                    ELSE 'medium'                                   -- 1–30 days past deadline
                END,
                format(
                    'ARCO request overdue: "%s" for %s — %s day(s) past the 1-month deadline (Art. 12(3) GDPR)',
                    v_rec.request_type,
                    coalesce(v_rec.subject_name, v_rec.subject_email, 'unknown'),
                    v_rec.days_overdue
                ),
                jsonb_build_object(
                    'request_id',         v_rec.id,
                    'request_type',       v_rec.request_type,
                    'subject_email',      v_rec.subject_email,
                    'subject_name',       v_rec.subject_name,
                    'verification_status', v_rec.verification_status,
                    'created_at',         v_rec.created_at,
                    'deadline',           v_rec.deadline,
                    'days_overdue',       v_rec.days_overdue
                )
            );

            v_found := v_found + 1;
        END IF;
    END LOOP;

    RETURN v_found;
END;
$$;

COMMENT ON FUNCTION public.detect_overdue_arco_requests() IS
    'GDPR Art. 12(3): Detects ARCO access requests past their 1-month deadline '
    'and inserts them as gdpr_anomaly records (severity medium/high/critical) so '
    'the security-anomaly-alerts Edge Function sends an alert email to the DPO.';

-- ── 2. Schedule daily at 08:00 UTC ─────────────────────────

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

        -- Remove old job if it exists (idempotent re-run safety)
        PERFORM cron.unschedule('gdpr-arco-overdue-check')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gdpr-arco-overdue-check');

        PERFORM cron.schedule(
            'gdpr-arco-overdue-check',
            '0 8 * * *',   -- daily at 08:00 UTC
            $cron$SELECT public.detect_overdue_arco_requests();$cron$
        );

        RAISE NOTICE 'Scheduled: gdpr-arco-overdue-check (daily 08:00 UTC)';
    ELSE
        RAISE NOTICE 'pg_cron not available — schedule gdpr-arco-overdue-check manually';
    END IF;
END;
$$;
