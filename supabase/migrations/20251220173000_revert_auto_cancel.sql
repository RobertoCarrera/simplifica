-- Revert "Auto-Cancel on Soft Delete" automation
-- User requested that deleted tickets should NOT change stage to 'Cancelled', only set deleted_at.

DROP TRIGGER IF EXISTS trigger_auto_cancel_on_delete ON public.tickets;
DROP FUNCTION IF EXISTS public.handle_ticket_soft_delete();
