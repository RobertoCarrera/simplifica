-- F2-2: Automatic data retention – RGPD Art. 5(1)(e) storage limitation
-- Runs monthly via pg_cron to:
--   1. Anonymize clients whose last activity exceeds 7 years (2555 days)
--   2. Purge gdpr_audit_log entries older than 10 years (legal minimum + 3y buffer)
--   3. Purge resolved gdpr_breach_incidents older than 5 years

-- ── 1. Helper: determine last activity for a client ─────────────────────────

CREATE OR REPLACE FUNCTION gdpr_client_last_activity(p_client_id UUID)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    SELECT GREATEST(
        MAX(t.updated_at),
        MAX(s.created_at),
        MAX(al.created_at)
    )
    FROM public.clients c
    LEFT JOIN public.tickets     t  ON t.client_id  = c.id
    LEFT JOIN public.services    s  ON s.company_id = c.company_id
    LEFT JOIN public.gdpr_audit_log al ON al.record_id = c.id
    WHERE c.id = p_client_id;
$$;

-- ── 2. Retention enforcement function ───────────────────────────────────────

CREATE OR REPLACE FUNCTION gdpr_enforce_retention()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_retention_cutoff     TIMESTAMP WITH TIME ZONE := now() - INTERVAL '7 years';
    v_audit_purge_cutoff   TIMESTAMP WITH TIME ZONE := now() - INTERVAL '10 years';
    v_breach_purge_cutoff  TIMESTAMP WITH TIME ZONE := now() - INTERVAL '5 years';
    v_clients_anon         INT := 0;
    v_audit_purged         INT := 0;
    v_breaches_purged      INT := 0;
    v_client_rec           RECORD;
BEGIN
    -- 2a. Anonymize stale clients (no activity in 7+ years, not already anonymized)
    FOR v_client_rec IN
        SELECT c.id
        FROM public.clients c
        WHERE c.name != 'ANONYMIZED'
          AND c.created_at < v_retention_cutoff
          AND COALESCE(gdpr_client_last_activity(c.id), c.created_at) < v_retention_cutoff
    LOOP
        BEGIN
            PERFORM gdpr_anonymize_client(v_client_rec.id);
            v_clients_anon := v_clients_anon + 1;
        EXCEPTION WHEN OTHERS THEN
            -- Log and continue; do not abort the whole job
            INSERT INTO public.gdpr_audit_log (
                action_type, table_name, record_id, purpose
            ) VALUES (
                'retention_error', 'clients', v_client_rec.id,
                'Auto-anonymization failed: ' || SQLERRM
            );
        END;
    END LOOP;

    -- 2b. Purge old audit log entries (keep 10 years per legal requirement)
    DELETE FROM public.gdpr_audit_log
    WHERE created_at < v_audit_purge_cutoff;
    GET DIAGNOSTICS v_audit_purged = ROW_COUNT;

    -- 2c. Purge old resolved breach incidents (5 years)
    DELETE FROM public.gdpr_breach_incidents
    WHERE resolved_at IS NOT NULL
      AND resolved_at < v_breach_purge_cutoff;
    GET DIAGNOSTICS v_breaches_purged = ROW_COUNT;

    -- 2d. Log the retention run itself
    INSERT INTO public.gdpr_audit_log (
        action_type, table_name, purpose, new_values
    ) VALUES (
        'retention_run', 'system', 'Monthly GDPR retention job',
        jsonb_build_object(
            'clients_anonymized', v_clients_anon,
            'audit_rows_purged',  v_audit_purged,
            'breaches_purged',    v_breaches_purged,
            'run_at',             now()
        )
    );

    RETURN jsonb_build_object(
        'clients_anonymized', v_clients_anon,
        'audit_rows_purged',  v_audit_purged,
        'breaches_purged',    v_breaches_purged
    );
END;
$$;

-- ── 3. Schedule via pg_cron (1st of each month at 02:00 UTC) ────────────────
-- pg_cron is available on Supabase projects; the extension must be enabled.
-- If the cron job already exists it will be replaced.

DO $$
BEGIN
    -- Only schedule if pg_cron extension is present
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
    ) THEN
        PERFORM cron.unschedule('gdpr-retention-monthly')
        WHERE EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'gdpr-retention-monthly'
        );

        PERFORM cron.schedule(
            'gdpr-retention-monthly',
            '0 2 1 * *',   -- 02:00 UTC on the 1st of every month
            $cron$SELECT gdpr_enforce_retention();$cron$
        );
    END IF;
END;
$$;
