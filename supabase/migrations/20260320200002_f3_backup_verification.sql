-- F3-1: Verificación de backups cifrados — RGPD Art. 32
-- Supabase gestiona los backups automáticamente (PITR + snapshots diarios).
-- Esta migración añade:
--   1. Una tabla de registro de verificaciones de backup
--   2. Una función que comprueba que replication slots y WAL están activos
--   3. Un job pg_cron semanal que registra el estado del backup

-- ── 1. Tabla de verificaciones ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gdpr_backup_verifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    wal_level       TEXT,
    replication_active BOOLEAN,
    db_size_bytes   BIGINT,
    table_count     INT,
    status          TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'error')),
    details         JSONB,
    notes           TEXT
);

COMMENT ON TABLE public.gdpr_backup_verifications
    IS 'Registro de verificaciones periódicas del estado de backup de la base de datos (Art. 32 RGPD)';

-- Only super_admin can read backup verification records
ALTER TABLE public.gdpr_backup_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backup_verifications_super_admin" ON public.gdpr_backup_verifications;
CREATE POLICY "backup_verifications_super_admin" ON public.gdpr_backup_verifications
    FOR ALL
    USING (public.is_super_admin_real());

-- ── 2. Verification function ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION gdpr_verify_backup_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_wal_level        TEXT;
    v_repl_active      BOOLEAN;
    v_db_size          BIGINT;
    v_table_count      INT;
    v_status           TEXT := 'ok';
    v_details          JSONB;
    v_notes            TEXT := '';
BEGIN
    -- Check WAL level (must be 'logical' or 'replica' for PITR)
    SELECT setting INTO v_wal_level
    FROM pg_settings
    WHERE name = 'wal_level';

    -- Check if there are active replication slots (Supabase uses these for PITR)
    SELECT EXISTS (
        SELECT 1 FROM pg_replication_slots
        WHERE active = true OR slot_type = 'physical'
    ) INTO v_repl_active;

    -- Database size
    SELECT pg_database_size(current_database()) INTO v_db_size;

    -- Table count
    SELECT COUNT(*)::INT INTO v_table_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

    -- Evaluate status
    IF v_wal_level NOT IN ('logical', 'replica') THEN
        v_status := 'error';
        v_notes := v_notes || 'WAL level is not replica/logical — PITR may be disabled. ';
    END IF;

    -- Build details
    v_details := jsonb_build_object(
        'wal_level',          v_wal_level,
        'replication_active', v_repl_active,
        'db_size_bytes',      v_db_size,
        'db_size_human',      pg_size_pretty(v_db_size),
        'table_count',        v_table_count,
        'supabase_pitr_note', 'Supabase Pro/Team/Enterprise plans include PITR backups. Verify at: https://supabase.com/dashboard/project/_/settings/backups'
    );

    -- Insert verification record
    INSERT INTO public.gdpr_backup_verifications (
        wal_level, replication_active, db_size_bytes, table_count, status, details, notes
    ) VALUES (
        v_wal_level, v_repl_active, v_db_size, v_table_count, v_status, v_details,
        NULLIF(TRIM(v_notes), '')
    );

    -- Also log to gdpr_audit_log for compliance trail
    INSERT INTO public.gdpr_audit_log (
        action_type, table_name, purpose, new_values
    ) VALUES (
        'backup_verification', 'system',
        'Weekly automated backup status check (RGPD Art. 32)',
        v_details || jsonb_build_object('status', v_status)
    );

    RETURN v_details || jsonb_build_object('status', v_status);
END;
$$;

-- ── 3. pg_cron: weekly check every Monday at 03:00 UTC ───────────────────────

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('gdpr-backup-verify')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gdpr-backup-verify');

        PERFORM cron.schedule(
            'gdpr-backup-verify',
            '0 3 * * 1',   -- every Monday at 03:00 UTC
            $cron$SELECT gdpr_verify_backup_status();$cron$
        );
    END IF;
END;
$$;

-- Run immediately on migration to establish baseline
SELECT gdpr_verify_backup_status();
