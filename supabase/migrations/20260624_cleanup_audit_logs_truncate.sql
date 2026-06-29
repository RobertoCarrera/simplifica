-- v0.51b: TRUNCATE approach (faster than DELETE batches)
-- Strategy: keep only 30 days, free disk instantly.
--
-- CREATE TABLE AS is fast (just a metadata op + bulk file copy)
-- TRUNCATE is instantaneous
-- INSERT ... SELECT is bulk

-- Step 1: preserve rows we want to keep
CREATE TEMPORARY TABLE audit_logs_keep AS
SELECT * FROM public.audit_logs
WHERE created_at >= now() - interval '30 days';

-- Step 2: TRUNCATE the original (frees 2.6GB instantly)
TRUNCATE TABLE public.audit_logs;

-- Step 3: restore the kept rows
INSERT INTO public.audit_logs
SELECT * FROM audit_logs_keep;

DROP TABLE audit_logs_keep;

-- Step 4: reclaim disk (PostgreSQL shrinks the file)
VACUUM FULL public.audit_logs;
ANALYZE public.audit_logs;
