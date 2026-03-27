-- Migration: Set REPLICA IDENTITY FULL on all realtime-subscribed tables
-- Required for Supabase Realtime to broadcast full row data on DELETE events
-- and to correctly filter updates by column values.
-- Without FULL, deleted rows appear with null values in realtime listeners.

-- Core tables with realtime subscriptions (conditional — table must exist)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'clients', 'projects', 'project_tasks', 'project_activity',
    'tickets', 'ticket_comments', 'resources', 'professionals',
    'quotes', 'notifications', 'bookings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END;
$$;

-- Enable the tables in the supabase_realtime publication
-- (idempotent: does nothing if already added)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'clients', 'projects', 'project_tasks', 'project_activity',
    'tickets', 'ticket_comments', 'resources', 'professionals',
    'quotes', 'notifications', 'bookings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;
