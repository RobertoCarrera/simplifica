-- Rafter ops v0.51b: cleanup audit_logs older than 30 days
-- Date: 2026-06-24
-- One-shot migration. Deletes 654k rows in 50k batches.
-- Triggers are NOT disabled (v0.51 filter means new writes are cheap).
-- VACUUM FULL reclaims disk space at the end.

DO $$
DECLARE
  total bigint := 0;
  batch int;
BEGIN
  FOR i IN 1..20 LOOP
    WITH d AS (
      DELETE FROM public.audit_logs
      WHERE id IN (
        SELECT id FROM public.audit_logs
        WHERE created_at < now() - interval '30 days'
        LIMIT 50000
      )
      RETURNING 1
    )
    SELECT count(*) INTO batch FROM d;
    total := total + batch;
    RAISE NOTICE 'batch %: deleted % (cumulative: %)', i, batch, total;
    EXIT WHEN batch = 0;
    PERFORM pg_sleep(0.5);
  END LOOP;
  RAISE NOTICE 'DONE. Total deleted: %', total;
END $$;
