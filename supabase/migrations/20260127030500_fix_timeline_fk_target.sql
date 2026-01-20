-- Recreate FK on ticket_timeline to reference public.users instead of auth.users
-- This is necessary for PostgREST to allow embedding public.users data

ALTER TABLE public.ticket_timeline
DROP CONSTRAINT IF EXISTS ticket_timeline_actor_id_fkey;

ALTER TABLE public.ticket_timeline
ADD CONSTRAINT ticket_timeline_actor_id_fkey
FOREIGN KEY (actor_id)
REFERENCES public.users(auth_user_id)
ON DELETE SET NULL;

-- Reload schema to pick up the change
NOTIFY pgrst, 'reload schema';
