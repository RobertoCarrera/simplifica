-- Backfill profile_type for existing notifications based on their type
-- This ensures proper filtering after adding the profile_type column

-- Session-related notifications are for professionals
UPDATE public.notifications 
SET profile_type = 'professional'
WHERE type IN ('session_created', 'session_end')
  AND profile_type IS NULL;

-- Owner-level notifications (GDPR, digests, general info, invitations)
UPDATE public.notifications 
SET profile_type = 'owner'
WHERE type IN ('daily_digest', 'gdpr_request', 'invitation', 'client_transfer', 'project_comment', 'ticket_created', 'ticket_comment', 'ticket_assigned', 'info', 'new_booking')
  AND profile_type IS NULL;

-- Any remaining NULL notifications default to owner (safe fallback)
UPDATE public.notifications 
SET profile_type = 'owner'
WHERE profile_type IS NULL;
