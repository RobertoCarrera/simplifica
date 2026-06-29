-- Borrar audit_logs con más de 30 días, en batches para no bloquear
DO $$
DECLARE
  deleted_total bigint := 0;
  deleted_batch bigint;
  cutoff timestamp := now() - interval '30 days';
BEGIN
  LOOP
    WITH deleted AS (
      DELETE FROM public.audit_logs
      WHERE id IN (
        SELECT id FROM public.audit_logs
        WHERE created_at < cutoff
        LIMIT 50000
      )
      RETURNING 1
    )
    SELECT count(*) INTO deleted_batch FROM deleted;
    deleted_total := deleted_total + deleted_batch;
    RAISE NOTICE 'Deleted batch: % (total: %)', deleted_batch, deleted_total;
    EXIT WHEN deleted_batch = 0;
    -- Small pause to let other queries interleave
    PERFORM pg_sleep(0.2);
  END LOOP;
  RAISE NOTICE 'Done. Total deleted: %', deleted_total;
END $$;

-- Reclaim disk space
VACUUM FULL ANALYZE public.audit_logs;
