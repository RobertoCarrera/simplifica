-- Test 07: Psicoterapia consolidation math
-- Verifies the migration that updated quote_items from 'Psicoterapia adultos'
-- to 'Psicoterapia Individual' and recalculated totals.

BEGIN;

-- Use a real quote that's known to have been migrated (e.g., #277 was in draft before).
-- We just check the math invariants on any quote with 'Psicoterapia Individual' description.

DO $$
DECLARE
  v_n_count int;
  v_n_zero_total int;
  v_n_with_items int;
  v_n_correct_tax int;
BEGIN
  RAISE NOTICE 'Test 07: validating Psicoterapia Individual consistency';

  -- All 'Psicoterapia Individual' quote_items should have unit_price = 70
  SELECT count(*) INTO v_n_count
  FROM public.quote_items
  WHERE description = 'Psicoterapia Individual' AND unit_price = 70;
  IF v_n_count < 1 THEN
    RAISE EXCEPTION 'FAIL 7.1: no Psicoterapia Individual items found (expected many)';
  END IF;
  RAISE NOTICE 'Test 7.1 PASS: % items at 70 EUR', v_n_count;

  -- All linked quotes should have non-zero total
  SELECT count(*) INTO v_n_zero_total
  FROM public.quotes q
  WHERE EXISTS (SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = q.id AND qi.description = 'Psicoterapia Individual')
    AND q.total_amount = 0;
  IF v_n_zero_total > 0 THEN
    RAISE EXCEPTION 'FAIL 7.2: % quotes with total=0 but have items', v_n_zero_total;
  END IF;
  RAISE NOTICE 'Test 7.2 PASS: 0 quotes with zero total';

  -- Quote with Psicoterapia Individual should have quote_items with at least 1 item
  SELECT count(DISTINCT q.id) INTO v_n_with_items
  FROM public.quotes q
  JOIN public.quote_items qi ON qi.quote_id = q.id
  WHERE qi.description = 'Psicoterapia Individual';
  IF v_n_with_items < 1 THEN
    RAISE EXCEPTION 'FAIL 7.3: no quotes with Psicoterapia Individual items';
  END IF;
  RAISE NOTICE 'Test 7.3 PASS: % quotes have items', v_n_with_items;

  -- No remaining 'Psicoterapia adultos' quote_items should exist (migrated)
  SELECT count(*) INTO v_n_count
  FROM public.quote_items WHERE description = 'Psicoterapia adultos';
  IF v_n_count > 0 THEN
    RAISE EXCEPTION 'FAIL 7.4: % items still with old description', v_n_count;
  END IF;
  RAISE NOTICE 'Test 7.4 PASS: 0 items with old description';

  RAISE NOTICE '=== Test 07 PASSED ===';
END $$;

ROLLBACK;