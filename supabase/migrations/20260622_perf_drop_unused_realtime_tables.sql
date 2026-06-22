-- =============================================================================
-- Perf: Trim supabase_realtime publication — drop 4 unused tables
-- =============================================================================
-- Source: Rafter v0.35 DB perf audit (docs/rafter-v35-db-perf.md, F-01)
--
-- The Realtime change feed scans every table in the publication on every tick.
-- Cost scales with (active subscriptions x publication set size x tick rate).
-- Four tables in the publication had zero frontend postgres_changes subscriptions,
-- so they were pure overhead.
--
-- Audit method:
--   1. SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
--   2. grep -rn "postgres_changes" src/app/ to find frontend subscriptions
--   3. diff the two lists
--
-- Tables dropped (verified no frontend subscriber):
--   - public.company_invitations  (only Edge Function / RPC writes)
--   - public.project_comments     (frontend reads via REST, no realtime)
--   - public.project_permissions  (RBAC, no realtime needed)
--   - public.ticket_stages        (static workflow config, no realtime needed)
--
-- Tables KEPT in publication (each has a verified frontend subscriber):
--   public.bookings, client_assignments, clients, mail_messages, notifications,
--   professionals, project_activity, project_tasks, projects, quotes, resources,
--   ticket_comments, tickets,
--   verifactu.events, verifactu.invoice_meta
--
-- Reversible:
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.<table>;
--
-- Why a DO block: ALTER PUBLICATION ... DROP TABLE does not support IF EXISTS,
-- so we guard each drop with a pg_publication_tables lookup.
-- =============================================================================

DO $$
DECLARE
  tbl text;
  candidates text[] := ARRAY[
    'company_invitations',
    'project_comments',
    'project_permissions',
    'ticket_stages'
  ];
BEGIN
  FOREACH tbl IN ARRAY candidates LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', tbl);
      RAISE NOTICE 'Dropped public.% from supabase_realtime', tbl;
    ELSE
      RAISE NOTICE 'public.% not in publication - skipped', tbl;
    END IF;
  END LOOP;
END $$;