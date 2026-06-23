-- Rafter v0.43 RLS hardening (Batch A)
-- Date: 2026-06-23
-- Source: docs/rafter-v43-rls-rescan.md (audit 2026-06-23)
--
-- Adds FORCE ROW LEVEL SECURITY to all public tables.
-- Previously 200 tables had RLS enabled but NOT forced, meaning
-- the table owner (postgres on all of them) could bypass RLS
-- during migrations or admin operations. Now they cannot.
--
-- Idempotent: only forces tables where relforcerowsecurity = false.
--
-- Companion migration: 20260623_rls_tighten_public_to_authenticated_v0_43.sql

BEGIN;

DO $$
DECLARE
  tname text;
  forced_count int := 0;
BEGIN
  FOR tname IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relforcerowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tname);
    forced_count := forced_count + 1;
  END LOOP;
  RAISE NOTICE 'FORCE RLS applied to % tables', forced_count;
END $$;

-- Sanity check: 0 tables with relforcerowsecurity = false (where relrowsecurity = true)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relforcerowsecurity = false
  ) THEN
    RAISE EXCEPTION 'FORCE RLS not applied to all tables';
  END IF;
  RAISE NOTICE 'OK: all RLS-enabled tables now have FORCE RLS';
END $$;

COMMIT;
