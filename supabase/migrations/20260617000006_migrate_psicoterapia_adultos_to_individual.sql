-- ============================================================================
-- Migrate ALL 276 remaining quote_items 'Psicoterapia adultos' to
-- 'Psicoterapia Individual' (70 EUR, 0% tax).
-- Follow-up to the initial Part 1 migration which only targeted
-- orphaned items (service_id IS NULL). This pass handles the rest of the
-- quote_items that were created with the old service correctly (i.e.
-- had service_id set) but still need to be migrated to the new catalog.
--
-- Recalculates quotes.subtotal/tax_amount/total_amount and the 213 linked
-- invoices (subtotal/tax_amount/total/total_tax_base/total_vat/total_gross).
--
-- Result:
-- - 276 quote_items migrated (unit_price 60 + 21% -> 70 + 0%)
-- - 276 quotes recalculated
-- - 213 invoices recalculated
-- - 0 quotes without total remaining
-- ============================================================================

DO $$
DECLARE
  v_psicoterapia_id uuid := '767463d6-893f-4869-9c63-e286b978c5f3';
  v_n_items int := 0;
  v_n_quotes int := 0;
  v_n_inv_items int := 0;
  v_n_invoices int := 0;
BEGIN
  UPDATE public.quote_items qi
  SET service_id = v_psicoterapia_id,
      unit_price = 70.00,
      description = 'Psicoterapia Individual',
      tax_rate = 0
  WHERE qi.description = 'Psicoterapia adultos';
  GET DIAGNOSTICS v_n_items = ROW_COUNT;

  UPDATE public.quotes q
  SET subtotal = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0)), 0) FROM public.quote_items WHERE quote_id = q.id),
      tax_amount = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * COALESCE(tax_rate, 0) / 100), 0) FROM public.quote_items WHERE quote_id = q.id),
      total_amount = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * (1 + COALESCE(tax_rate, 0) / 100)), 0) FROM public.quote_items WHERE quote_id = q.id),
      updated_at = now()
  WHERE q.id IN (
    SELECT DISTINCT quote_id FROM public.quote_items
    WHERE description = 'Psicoterapia Individual' AND service_id = v_psicoterapia_id
  );
  GET DIAGNOSTICS v_n_quotes = ROW_COUNT;

  UPDATE public.invoice_items ii
  SET service_id = v_psicoterapia_id,
      unit_price = 70.00,
      description = 'Psicoterapia Individual',
      tax_rate = 0
  WHERE ii.description = 'Psicoterapia adultos';
  GET DIAGNOSTICS v_n_inv_items = ROW_COUNT;

  UPDATE public.invoices inv
  SET subtotal = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0)), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      tax_amount = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * COALESCE(tax_rate, 0) / 100), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      total = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * (1 + COALESCE(tax_rate, 0) / 100)), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      total_tax_base = subtotal,
      total_vat = tax_amount,
      total_gross = total,
      updated_at = now()
  WHERE inv.id IN (
    SELECT DISTINCT ii.invoice_id FROM public.invoice_items ii
    WHERE ii.description = 'Psicoterapia Individual'
  );
  GET DIAGNOSTICS v_n_invoices = ROW_COUNT;

  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'quote_items migrated:    %', v_n_items;
  RAISE NOTICE 'quotes recalculated:     %', v_n_quotes;
  RAISE NOTICE 'invoice_items updated:   %', v_n_inv_items;
  RAISE NOTICE 'invoices recalculated:   %', v_n_invoices;
END $$;