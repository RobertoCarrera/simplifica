-- ============================================================================
-- Helper RPC: count_orphan_invoices()
--
-- Returns the number of active invoices in the current user's company whose
-- linked booking is NOT in the past-facturable set. Used by the invoice-list
-- reconciliation pill (descuadre inverso).
--
-- An invoice is "orphan" if ANY of these is true:
--   1. source_quote_id IS NULL — manual invoice or test data
--   2. The linked quote has no booking — accepted quote without a session
--   3. The linked booking's start_time >= now() — pre-payment of a future
--      session (legitimate but should be tracked separately)
--   4. The linked booking's status is cancelled/no_show — invoice for a
--      session that was cancelled (probably needs review)
--
-- All four cases are surfaced together as "orphan" because the user
-- should know they exist; the pill is informational, not an error state.
--
-- Resolves the company from auth.uid() — no parameter needed. SECURITY
-- DEFINER lets it run with the function owner's privileges, bypassing
-- RLS, so we filter explicitly by company_id.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.count_orphan_invoices()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_count integer;
BEGIN
  -- Resolve the current user's company
  SELECT company_id INTO v_company_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND active = true
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::integer INTO v_count
  FROM public.invoices i
  WHERE i.company_id = v_company_id
    AND i.deleted_at IS NULL
    AND (
      i.source_quote_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.quotes q
        JOIN public.bookings b ON b.quote_id = q.id
        WHERE q.id = i.source_quote_id
          AND b.start_time < now()
          AND LOWER(b.status) NOT IN (
            'cancelled', 'canceled', 'no_show', 'no-show',
            'anulada', 'anulado'
          )
      )
    );

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.count_orphan_invoices() IS
  'Count of active invoices in the current user''s company that are not linked to a past, non-cancelled booking. Used for the reconciliation pill in the invoice-list.';

GRANT EXECUTE ON FUNCTION public.count_orphan_invoices() TO authenticated;
