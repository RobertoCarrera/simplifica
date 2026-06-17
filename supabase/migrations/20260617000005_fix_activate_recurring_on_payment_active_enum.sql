-- ============================================================================
-- Fix: activate_recurring_service_on_payment uses 'active' for quote_status
-- ============================================================================
-- v4.9 (commit d560ab66, 2026-06-16) removed 'active' from the quote_status
-- enum when consolidating the lifecycle to 7 canonical states:
--   draft, sent, viewed, accepted, rejected, cancelled, invoiced
--
-- But this trigger function (which fires AFTER UPDATE on invoices when
-- payment_status changes to 'paid') was never updated. It still tries
-- to do:
--
--   UPDATE public.quotes SET status = 'active' WHERE ...
--
-- which now fails with code 22P02 (invalid_text_representation), and
-- the failure rolls back the WHOLE transaction. That means marking any
-- booking with a linked invoice as paid returns 400 to the user.
--
-- Confirmation via simplify_execute_sql:
--   - 0 quotes currently with status='active' in CAIBS.
--   - 0 quotes with recurrence_type != 'none' (the trigger's WHERE clause
--     would skip them anyway because it requires
--     `recurrence_type IS NOT NULL AND recurrence_type <> 'none'`).
--   - The recurring-quotes feature has no real data, so the function is
--     effectively dead code.
--
-- Fix: replace the function body with a no-op so the trigger stays
-- in place but does nothing. The trigger and function are preserved
-- (not dropped) in case the recurring-quotes feature comes back to
-- life in the future — at that point whoever revives it should
-- re-introduce 'active' (or a new value) explicitly in the enum
-- AND fix the trigger, not the other way around.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.activate_recurring_service_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'temp'
AS $function$
BEGIN
  -- No-op: 'active' was removed from the quote_status enum in v4.9.
  -- The recurring-quotes feature has no live data in CAIBS as of 2026-06-17.
  -- This trigger remains in place for future re-introduction; the
  -- function body must be re-implemented to use a value present in
  -- the quote_status enum at that time.
  RETURN NEW;
END;
$function$;
