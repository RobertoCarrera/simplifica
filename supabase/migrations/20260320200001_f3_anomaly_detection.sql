-- F3-8: Monitorización de anomalías — RGPD Art. 32 + seguridad continua
-- Detecta automáticamente accesos inusuales y genera alertas en gdpr_audit_log.
-- Los resultados se recogen por la Edge Function security-anomaly-alerts.

-- ── 1. Tabla de umbrales por empresa (configurable) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.gdpr_anomaly_thresholds (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                UUID UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
    -- Bulk export threshold: más de N registros de cliente exportados en 1 hora
    bulk_export_count         INT  NOT NULL DEFAULT 100,
    -- Off-hours window (UTC): acceso fuera de 07:00–22:00 UTC = sospechoso
    off_hours_start_utc       INT  NOT NULL DEFAULT 22, -- 22:00
    off_hours_end_utc         INT  NOT NULL DEFAULT 7,  -- 07:00
    -- Velocity: más de N accesos a datos clínicos en 5 minutos
    clinical_burst_count      INT  NOT NULL DEFAULT 30,
    clinical_burst_window_min INT  NOT NULL DEFAULT 5,
    -- Failed auth attempts before anomaly flag
    failed_auth_count         INT  NOT NULL DEFAULT 10,
    failed_auth_window_min    INT  NOT NULL DEFAULT 15,
    -- Usuario nuevo accediendo en las primeras 24h a datos clínicos
    new_user_clinical_hours   INT  NOT NULL DEFAULT 24,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gdpr_anomaly_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anomaly_thresholds_admin" ON public.gdpr_anomaly_thresholds;
CREATE POLICY "anomaly_thresholds_admin" ON public.gdpr_anomaly_thresholds
    FOR ALL
    USING (
        public.is_super_admin_real()
        OR (company_id IS NOT NULL AND public.is_company_admin(company_id))
    );

DROP TRIGGER IF EXISTS handle_anomaly_thresholds_updated_at ON public.gdpr_anomaly_thresholds;
CREATE TRIGGER handle_anomaly_thresholds_updated_at
    BEFORE UPDATE ON public.gdpr_anomaly_thresholds
    FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ── 2. Tabla de anomalías detectadas ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gdpr_anomalies (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    anomaly_type      TEXT NOT NULL,
    severity          TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    user_id           UUID,
    description       TEXT NOT NULL,
    evidence          JSONB,
    resolved          BOOLEAN NOT NULL DEFAULT false,
    resolved_at       TIMESTAMPTZ,
    resolved_by       UUID,
    alert_sent        BOOLEAN NOT NULL DEFAULT false,
    alert_sent_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_anomalies_company_unresolved
    ON public.gdpr_anomalies(company_id, created_at DESC) WHERE resolved = false;

CREATE INDEX IF NOT EXISTS idx_gdpr_anomalies_alert_pending
    ON public.gdpr_anomalies(alert_sent, created_at) WHERE alert_sent = false;

ALTER TABLE public.gdpr_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anomalies_admin_select" ON public.gdpr_anomalies;
CREATE POLICY "anomalies_admin_select" ON public.gdpr_anomalies
    FOR SELECT
    USING (
        public.is_super_admin_real()
        OR (company_id IS NOT NULL AND public.is_company_admin(company_id))
    );

-- ── 3. Core detection function ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION gdpr_detect_anomalies()
RETURNS INT   -- returns count of new anomalies found
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_found        INT := 0;
    v_thr          RECORD;
    v_since1h      TIMESTAMPTZ := now() - INTERVAL '1 hour';
    v_since15m     TIMESTAMPTZ := now() - INTERVAL '15 minutes';
    v_since24h     TIMESTAMPTZ := now() - INTERVAL '24 hours';
    v_rec          RECORD;
BEGIN

    -- ── A. Bulk export / read anomaly ────────────────────────────────────────
    -- More than threshold reads of 'clients' in 1 hour by a single user
    FOR v_rec IN
        SELECT
            al.user_id,
            al.company_id,
            COUNT(*) AS cnt,
            COALESCE(t.bulk_export_count, 100) AS threshold
        FROM public.gdpr_audit_log al
        LEFT JOIN public.gdpr_anomaly_thresholds t USING (company_id)
        WHERE al.created_at >= v_since1h
          AND al.action_type IN ('select', 'export', 'read', 'list')
          AND al.table_name = 'clients'
          AND al.user_id IS NOT NULL
        GROUP BY al.user_id, al.company_id, t.bulk_export_count
        HAVING COUNT(*) > COALESCE(t.bulk_export_count, 100)
    LOOP
        -- Deduplicate: skip if identical anomaly raised in last hour
        IF NOT EXISTS (
            SELECT 1 FROM public.gdpr_anomalies a
            WHERE a.anomaly_type = 'bulk_export'
              AND a.user_id = v_rec.user_id
              AND a.company_id = v_rec.company_id
              AND a.created_at >= v_since1h
        ) THEN
            INSERT INTO public.gdpr_anomalies (
                company_id, anomaly_type, severity, user_id, description, evidence
            ) VALUES (
                v_rec.company_id,
                'bulk_export',
                CASE WHEN v_rec.cnt > v_rec.threshold * 3 THEN 'critical'
                     WHEN v_rec.cnt > v_rec.threshold * 1.5 THEN 'high'
                     ELSE 'medium' END,
                v_rec.user_id,
                format('Bulk data access: user read %s client records in 1 hour (threshold: %s)', v_rec.cnt, v_rec.threshold),
                jsonb_build_object('count', v_rec.cnt, 'threshold', v_rec.threshold, 'window', '1h')
            );
            v_found := v_found + 1;
        END IF;
    END LOOP;

    -- ── B. Clinical notes burst access ───────────────────────────────────────
    FOR v_rec IN
        SELECT
            al.user_id,
            al.company_id,
            COUNT(*) AS cnt,
            COALESCE(t.clinical_burst_count, 30)       AS threshold,
            COALESCE(t.clinical_burst_window_min, 5)   AS window_min
        FROM public.gdpr_audit_log al
        LEFT JOIN public.gdpr_anomaly_thresholds t USING (company_id)
        WHERE al.created_at >= now() - make_interval(mins => COALESCE(t.clinical_burst_window_min, 5))
          AND al.table_name = 'client_clinical_notes'
          AND al.user_id IS NOT NULL
        GROUP BY al.user_id, al.company_id, t.clinical_burst_count, t.clinical_burst_window_min
        HAVING COUNT(*) > COALESCE(t.clinical_burst_count, 30)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.gdpr_anomalies a
            WHERE a.anomaly_type = 'clinical_burst'
              AND a.user_id = v_rec.user_id
              AND a.created_at >= v_since15m
        ) THEN
            INSERT INTO public.gdpr_anomalies (
                company_id, anomaly_type, severity, user_id, description, evidence
            ) VALUES (
                v_rec.company_id,
                'clinical_burst',
                'high',
                v_rec.user_id,
                format('Clinical data burst: %s accesses to health records in %s minutes', v_rec.cnt, v_rec.window_min),
                jsonb_build_object('count', v_rec.cnt, 'window_min', v_rec.window_min)
            );
            v_found := v_found + 1;
        END IF;
    END LOOP;

    -- ── C. Off-hours clinicial access ────────────────────────────────────────
    -- Clinical notes accessed between 22:00 and 07:00 UTC
    FOR v_rec IN
        SELECT DISTINCT
            al.user_id,
            al.company_id,
            COUNT(*) AS cnt
        FROM public.gdpr_audit_log al
        WHERE al.created_at >= v_since1h
          AND al.table_name = 'client_clinical_notes'
          AND al.user_id IS NOT NULL
          AND (
              EXTRACT(HOUR FROM al.created_at AT TIME ZONE 'UTC') >= 22
              OR EXTRACT(HOUR FROM al.created_at AT TIME ZONE 'UTC') < 7
          )
        GROUP BY al.user_id, al.company_id
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.gdpr_anomalies a
            WHERE a.anomaly_type = 'off_hours_clinical'
              AND a.user_id = v_rec.user_id
              AND a.created_at >= v_since1h
        ) THEN
            INSERT INTO public.gdpr_anomalies (
                company_id, anomaly_type, severity, user_id, description, evidence
            ) VALUES (
                v_rec.company_id,
                'off_hours_clinical',
                'medium',
                v_rec.user_id,
                format('Off-hours access to health records: %s accesses between 22:00–07:00 UTC', v_rec.cnt),
                jsonb_build_object('count', v_rec.cnt, 'hour_utc', EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC'))
            );
            v_found := v_found + 1;
        END IF;
    END LOOP;

    -- ── D. New user accessing clinical data within 24h of account creation ───
    FOR v_rec IN
        SELECT DISTINCT
            al.user_id,
            al.company_id,
            u.created_at AS user_created_at
        FROM public.gdpr_audit_log al
        JOIN public.users u ON u.id = al.user_id
        WHERE al.created_at >= v_since24h
          AND al.table_name = 'client_clinical_notes'
          AND u.created_at >= v_since24h
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.gdpr_anomalies a
            WHERE a.anomaly_type = 'new_user_clinical'
              AND a.user_id = v_rec.user_id
              AND a.created_at >= v_since24h
        ) THEN
            INSERT INTO public.gdpr_anomalies (
                company_id, anomaly_type, severity, user_id, description, evidence
            ) VALUES (
                v_rec.company_id,
                'new_user_clinical',
                'high',
                v_rec.user_id,
                'New account accessed health records within 24 hours of creation',
                jsonb_build_object(
                    'user_created_at', v_rec.user_created_at,
                    'access_time', now()
                )
            );
            v_found := v_found + 1;
        END IF;
    END LOOP;

    -- ── E. Privilege escalation attempt: role change + immediate sensitive access ──
    FOR v_rec IN
        SELECT DISTINCT
            al.user_id,
            al.company_id
        FROM public.gdpr_audit_log al
        WHERE al.created_at >= v_since15m
          AND al.action_type = 'update'
          AND al.table_name = 'users'
          AND al.new_values ? 'role'
          AND EXISTS (
              SELECT 1 FROM public.gdpr_audit_log al2
              WHERE al2.user_id = al.user_id
                AND al2.created_at BETWEEN al.created_at AND al.created_at + INTERVAL '5 minutes'
                AND al2.table_name IN ('clients', 'client_clinical_notes', 'gdpr_audit_log')
          )
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.gdpr_anomalies a
            WHERE a.anomaly_type = 'privilege_escalation'
              AND a.user_id = v_rec.user_id
              AND a.created_at >= v_since15m
        ) THEN
            INSERT INTO public.gdpr_anomalies (
                company_id, anomaly_type, severity, user_id, description, evidence
            ) VALUES (
                v_rec.company_id,
                'privilege_escalation',
                'critical',
                v_rec.user_id,
                'Possible privilege escalation: role change followed immediately by sensitive data access',
                jsonb_build_object('detected_at', now())
            );
            v_found := v_found + 1;
        END IF;
    END LOOP;

    RETURN v_found;
END;
$$;

-- ── 4. pg_cron: run detector every 30 minutes ────────────────────────────────

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('gdpr-anomaly-detection')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gdpr-anomaly-detection');

        PERFORM cron.schedule(
            'gdpr-anomaly-detection',
            '*/30 * * * *',   -- every 30 minutes
            $cron$SELECT gdpr_detect_anomalies();$cron$
        );

        -- Also schedule the Edge Function alerter every 30 minutes (offset by 5 min)
        -- This calls the security-anomaly-alerts function via net.http_post
        PERFORM cron.unschedule('gdpr-anomaly-alert-sender')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gdpr-anomaly-alert-sender');

        PERFORM cron.schedule(
            'gdpr-anomaly-alert-sender',
            '5,35 * * * *',   -- at :05 and :35 (after the detector runs at :00 and :30)
            format(
                $cron$
                SELECT net.http_post(
                    url    := %L,
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
                    ),
                    body   := '{}'::jsonb
                );
                $cron$,
                current_setting('app.supabase_url', true) || '/functions/v1/security-anomaly-alerts'
            )
        );
    END IF;
END;
$$;
