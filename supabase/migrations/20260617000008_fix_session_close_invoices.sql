-- ============================================================================
-- Fix 3 invoices created by trg_session_close_to_invoice (from migration
-- 20260617000007) that had stale invoice_items:
-- - 333: created from booking with total_price=0 (calculation bug in
--   create_invoice_for_booking reading total_price not quote_items)
-- - 364, 366: created before today's migration 20260617000006, so they
--   still had 60+21% data instead of 70+0%
-- This migration copies current quote_items values to invoice_items and
-- recalculates invoice totals.
-- ============================================================================

DO $$
DECLARE
  v_n int := 0;
BEGIN
  UPDATE public.invoice_items ii
  SET service_id = qi.service_id,
      unit_price = qi.unit_price,
      description = qi.description,
      tax_rate = qi.tax_rate
  FROM public.invoices i
  JOIN public.quotes q ON q.id = i.source_quote_id
  JOIN public.quote_items qi ON qi.quote_id = q.id
  WHERE ii.invoice_id = i.id
    AND i.invoice_number IN ('333', '364', '366');
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.invoices inv
  SET subtotal = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0)), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      tax_amount = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * COALESCE(tax_rate, 0) / 100), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      total = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * (1 + COALESCE(tax_rate, 0) / 100)), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      total_tax_base = subtotal,
      total_vat = tax_amount,
      total_gross = total,
      updated_at = now()
  WHERE inv.invoice_number IN ('333', '364', '366');
END $$;