-- Add FK to ticket_timeline referencing public.users via auth_user_id
-- This allows joining public user data when querying timeline events
ALTER TABLE public.ticket_timeline
ADD CONSTRAINT ticket_timeline_actor_id_fkey
FOREIGN KEY (actor_id)
REFERENCES public.users(auth_user_id)
ON DELETE SET NULL;

-- Comment for clarity
COMMENT ON COLUMN public.ticket_timeline.actor_id IS 'References public.users.auth_user_id (which matches auth.users.id)';
