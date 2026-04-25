-- Enable Realtime for client_assignments so that professionals receive
-- live updates when clients are assigned to / removed from them.
-- The existing RLS policies already restrict each professional to only
-- see rows where professional_id matches their own professionals.id.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.client_assignments;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already in publication, nothing to do
END
$$;
