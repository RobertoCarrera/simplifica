-- ============================================================================
-- Consolidate services: 14 Psicoterapia + 9 Sexologia/Fisio recalc + delete 26 Reserva
-- ============================================================================
-- Part 1: 14 quote_items "Psicoterapia adultos"/"Psicoterapia de Pareja"
--         -> "Psicoterapia Individual" (70€, 0% tax).
-- Part 2: 9 quote_items "Sexología clinica"/"Fisioterapia general"
--         -> "Sexología"/"Fisioterapia" (70€, 0% tax).
-- Part 3: Delete 26 historical "Reserva"/"Servicio reservado" quotes that
--         came from a Docplanner batch without service mapping.
--
-- Recalculates quotes.subtotal/tax_amount/total_amount and invoices
-- (subtotal/tax_amount/total/total_tax_base/total_vat/total_gross)
-- to keep DB consistent with item-level unit_price changes.
--
-- NOTE: ROW_COUNT is a reserved keyword in PL/pgSQL — cannot be used as
-- an expression. Each ROW_COUNT usage is captured into a separate variable.
-- ============================================================================

DO $$
DECLARE
  v_psicoterapia_id uuid := '767463d6-893f-4869-9c63-e286b978c5f3';
  v_sexologia_id    uuid := 'c0c9bc48-3f79-4dc8-a530-d0a0145802b3';
  v_fisio_id        uuid := 'ece221a6-8497-451c-9846-4a48389ad0d1';

  v_old_psico_adultos text[] := ARRAY['Psicoterapia adultos', 'Psicoterapia de Pareja'];
  v_old_sexologia_clinica uuid := '039cb949-0bde-4b1d-90df-28b064e60344';
  v_old_fisio_general     uuid := '2c15879d-1ce1-44a4-abbc-c32f9c03fb08';

  v_n_psico int := 0;
  v_n_sexolog int := 0;
  v_n_fisio int := 0;
  v_n_quotes_recalc int := 0;
  v_n_inv_items_p1 int := 0;
  v_n_inv_items_p2a int := 0;
  v_n_inv_items_p2b int := 0;
  v_n_invoices_recalc int := 0;
  v_n_reserva_deleted int := 0;
BEGIN
  -- PART 1: 14 Psicoterapia -> Psicoterapia Individual
  UPDATE public.quote_items qi
  SET service_id = v_psicoterapia_id, unit_price = 70.00, description = 'Psicoterapia Individual', tax_rate = 0
  WHERE qi.description = ANY(v_old_psico_adultos) AND qi.service_id IS NULL;
  GET DIAGNOSTICS v_n_psico = ROW_COUNT;

  UPDATE public.quotes q
  SET subtotal = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0)), 0) FROM public.quote_items WHERE quote_id = q.id),
      tax_amount = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * COALESCE(tax_rate, 0) / 100), 0) FROM public.quote_items WHERE quote_id = q.id),
      total_amount = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * (1 + COALESCE(tax_rate, 0) / 100)), 0) FROM public.quote_items WHERE quote_id = q.id),
      updated_at = now()
  WHERE q.id IN (SELECT DISTINCT qi.quote_id FROM public.quote_items qi WHERE qi.description = 'Psicoterapia Individual' AND qi.service_id = v_psicoterapia_id);
  GET DIAGNOSTICS v_n_quotes_recalc = ROW_COUNT;

  UPDATE public.invoice_items ii
  SET service_id = v_psicoterapia_id, unit_price = 70.00, description = 'Psicoterapia Individual', tax_rate = 0
  WHERE ii.description = ANY(v_old_psico_adultos)
    AND ii.invoice_id IN (
      SELECT inv.id FROM public.invoices inv
      JOIN public.quotes q ON q.id = inv.source_quote_id
      WHERE EXISTS (SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = q.id AND qi.service_id = v_psicoterapia_id)
    );
  GET DIAGNOSTICS v_n_inv_items_p1 = ROW_COUNT;

  UPDATE public.invoices inv
  SET subtotal = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0)), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      tax_amount = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * COALESCE(tax_rate, 0) / 100), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      total = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * (1 + COALESCE(tax_rate, 0) / 100)), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      total_tax_base = subtotal,
      total_vat = tax_amount,
      total_gross = total,
      updated_at = now()
  WHERE inv.source_quote_id IN (SELECT q.id FROM public.quotes q WHERE EXISTS (SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = q.id AND qi.service_id = v_psicoterapia_id));
  GET DIAGNOSTICS v_n_invoices_recalc = ROW_COUNT;

  -- PART 2: 9 Sexologia clinica/Fisio general -> Sexologia/Fisioterapia
  UPDATE public.quote_items qi
  SET service_id = v_sexologia_id, unit_price = 70.00, description = 'Sexología', tax_rate = 0
  WHERE qi.service_id = v_old_sexologia_clinica;
  GET DIAGNOSTICS v_n_sexolog = ROW_COUNT;

  UPDATE public.quote_items qi
  SET service_id = v_fisio_id, unit_price = 70.00, description = 'Fisioterapia', tax_rate = 0
  WHERE qi.service_id = v_old_fisio_general;
  GET DIAGNOSTICS v_n_fisio = ROW_COUNT;

  UPDATE public.quotes q
  SET subtotal = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0)), 0) FROM public.quote_items WHERE quote_id = q.id),
      tax_amount = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * COALESCE(tax_rate, 0) / 100), 0) FROM public.quote_items WHERE quote_id = q.id),
      total_amount = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * (1 + COALESCE(tax_rate, 0) / 100)), 0) FROM public.quote_items WHERE quote_id = q.id),
      updated_at = now()
  WHERE q.id IN (
    SELECT DISTINCT qi.quote_id FROM public.quote_items qi
    WHERE qi.service_id IN (v_sexologia_id, v_fisio_id)
      AND qi.description IN ('Sexología', 'Fisioterapia')
      AND qi.unit_price = 70
  );
  GET DIAGNOSTICS v_n_quotes_recalc = ROW_COUNT;

  UPDATE public.invoice_items ii
  SET service_id = v_sexologia_id, unit_price = 70.00, description = 'Sexología', tax_rate = 0
  WHERE ii.service_id = v_old_sexologia_clinica;
  GET DIAGNOSTICS v_n_inv_items_p2a = ROW_COUNT;

  UPDATE public.invoice_items ii
  SET service_id = v_fisio_id, unit_price = 70.00, description = 'Fisioterapia', tax_rate = 0
  WHERE ii.service_id = v_old_fisio_general;
  GET DIAGNOSTICS v_n_inv_items_p2b = ROW_COUNT;
  v_n_invoices_recalc := v_n_inv_items_p2a + v_n_inv_items_p2b;

  UPDATE public.invoices inv
  SET subtotal = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0)), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      tax_amount = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * COALESCE(tax_rate, 0) / 100), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      total = (SELECT COALESCE(SUM(quantity * COALESCE(unit_price, 0) * (1 + COALESCE(tax_rate, 0) / 100)), 0) FROM public.invoice_items WHERE invoice_id = inv.id),
      total_tax_base = subtotal,
      total_vat = tax_amount,
      total_gross = total,
      updated_at = now()
  WHERE inv.source_quote_id IN (
    SELECT q.id FROM public.quotes q
    WHERE EXISTS (SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = q.id AND qi.service_id IN (v_sexologia_id, v_fisio_id))
  );

  -- PART 3: Delete 26 "Reserva"/"Servicio reservado" quotes
  UPDATE public.bookings
  SET quote_id = NULL
  WHERE quote_id IN (
    SELECT DISTINCT quote_id FROM public.quote_items
    WHERE service_id IS NULL AND description IN ('Reserva', 'Servicio reservado')
  );

  DELETE FROM public.quote_items
  WHERE quote_id IN (
    SELECT DISTINCT quote_id FROM public.quote_items
    WHERE service_id IS NULL AND description IN ('Reserva', 'Servicio reservado')
  );

  DELETE FROM public.quotes
  WHERE id IN (
    SELECT DISTINCT quote_id FROM public.quote_items
    WHERE service_id IS NULL AND description IN ('Reserva', 'Servicio reservado')
  );
  GET DIAGNOSTICS v_n_reserva_deleted = ROW_COUNT;

  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'Psicoterapia items migrated:    %', v_n_psico;
  RAISE NOTICE 'Sexología clinica items migrated: %', v_n_sexolog;
  RAISE NOTICE 'Fisioterapia general items migrated: %', v_n_fisio;
  RAISE NOTICE 'Reserva/Servicio quotes deleted:  %', v_n_reserva_deleted;
  RAISE NOTICE 'Invoice items Part 1 (Psico):     %', v_n_inv_items_p1;
  RAISE NOTICE 'Invoice items Part 2 (Sexol+Fis): %', v_n_invoices_recalc;
END $$;

-- Cleanup orphan quotes (Part 3 deleted their items; quotes with no items are useless)
DO $$
DECLARE
  v_n int := 0;
BEGIN
  UPDATE public.bookings
  SET quote_id = NULL
  WHERE quote_id IN (
    SELECT id FROM public.quotes q
    WHERE NOT EXISTS (SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = q.id)
  );

  DELETE FROM public.quotes q
  WHERE NOT EXISTS (SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = q.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Cleanup: deleted % orphan quotes (no items)', v_n;
END $$;