-- ============================================================================
-- Backfill: assign client_id to 18 orphaned future bookings + create quotes
-- Scope: 11 Docplanner orphans + 7 Professional orphans (none with quotes)
-- All have a matchable client in `public.clients` (manually verified).
-- Idempotent: skips bookings that already have client_id/quote_id.
--
-- After this runs:
--   17 of 18 bookings get client_id + a draft quote
--   1 booking (5b7d507b / Judit) gets client_id but NO quote (no service_id;
--     needs manual fix by the professional).
--
-- Pre-condition: `generate_quote_from_booking(uuid, text)` RPC is in place.
-- ============================================================================

DO $$
DECLARE
  -- Map booking_id -> client_id. Verified manually 2026-06-17.
  v_assignments jsonb := jsonb_build_array(
    -- 11 Docplanner orphans
    jsonb_build_object('booking_id', 'feafa1f5-c3f0-4467-bb64-eed56f63293b', 'client_id', 'df48cf9d-6d5c-4533-a90d-2a68fd57636b'),  -- Florencia Cumsille
    jsonb_build_object('booking_id', 'c4ca5ae3-9167-43be-a85c-7919a5e00736', 'client_id', '1068a10c-8aae-4d6d-a141-12bab69a04a2'),  -- Nora Bentamou
    jsonb_build_object('booking_id', '6b67aa33-b6f9-495b-9846-0b069b023dbd', 'client_id', '2c6287a1-802e-4e27-a5d3-c870f3a6f271'),  -- Alba Palomares
    jsonb_build_object('booking_id', '0a4d2e4a-292f-4d79-90b5-f3a55c22f216', 'client_id', 'aff79c23-5f5e-4d50-88d8-2cd3c4a03337'),  -- Rosendo Hernández
    jsonb_build_object('booking_id', 'd2b5fe4e-2e75-49fd-af50-059b23005b1c', 'client_id', '2c6287a1-802e-4e27-a5d3-c870f3a6f271'),  -- Alba Palomares (repeat)
    jsonb_build_object('booking_id', '5b7d507b-e5b6-4282-8d6e-9fb4fa05f311', 'client_id', '740dad01-7b35-4a1c-89e1-be8f17d6c7ab'),  -- Judit Corral (user picked B: more info)
    jsonb_build_object('booking_id', '0711e983-ec74-427a-85c0-abe3e27953ea', 'client_id', 'ef911626-3de3-4305-8e05-0ac18f032643'),  -- Òscar Beamud
    jsonb_build_object('booking_id', '7dc1418c-f3ad-4f1a-8eac-cc93d4e58552', 'client_id', '73e30d07-5e91-4c5b-9b36-07a493eeb4cb'),  -- Carolina Falcón
    jsonb_build_object('booking_id', '9e951a34-5224-4467-80cc-3c0d5acc824c', 'client_id', '2c6287a1-802e-4e27-a5d3-c870f3a6f271'),  -- Alba Palomares (repeat)
    jsonb_build_object('booking_id', '6ab922fe-0aa3-4f91-9b2c-b2826a10b372', 'client_id', '2649021e-bad4-4db5-ae26-caef37d5d507'),  -- Eva Maldonado
    jsonb_build_object('booking_id', '5757c5c4-921d-489b-bf43-1dae41246643', 'client_id', '2c6287a1-802e-4e27-a5d3-c870f3a6f271'),  -- Alba Palomares (repeat)
    -- 7 Professional orphans
    jsonb_build_object('booking_id', '7dd243d3-48c2-4bda-813a-76d4b320f3cd', 'client_id', 'eb78bb1c-f893-4305-aae7-9f5a9dfc2622'),  -- Carmen Puente
    jsonb_build_object('booking_id', '9a5d144f-8a31-4db3-a6b1-c2ddd9ae9de2', 'client_id', '1a384cc6-e193-4bc8-9194-de62fade7423'),  -- Paula Campos
    jsonb_build_object('booking_id', '581f6c95-44df-44bb-86cf-08d9a102d02e', 'client_id', '97fba39e-4093-4732-95eb-05b3d58cfac8'),  -- Álvaro Ortega
    jsonb_build_object('booking_id', '27b5bc0a-1916-4472-8a25-bc33e2700c0d', 'client_id', '78cca38a-0aec-4fc8-bfd5-1c6c7e420c39'),  -- Belén Girado
    jsonb_build_object('booking_id', '4566c378-bc59-4e35-a2d8-af86e45aff5d', 'client_id', '66a287fe-e61c-4a10-9a41-8cff4292207e'),  -- Andrea Herrero
    jsonb_build_object('booking_id', '430b4b32-8917-417a-904d-cbf512a62fba', 'client_id', '6f6f99bb-a964-439f-aff6-5fc62a9fde00'),  -- Cristian Fonolla
    jsonb_build_object('booking_id', '6f68916f-d65a-4bd8-94ac-4d6ec6c85b95', 'client_id', '77ee873d-8e8f-4daa-96e3-bad1aba6ed65')   -- Anna Pallero
  );
  v_assignment jsonb;
  v_booking_id uuid;
  v_client_id uuid;
  v_quote_id uuid;
  v_n_assigned int := 0;
  v_n_quotes_created int := 0;
  v_n_skipped int := 0;
  v_n_no_service int := 0;
  v_quote_result jsonb;
BEGIN
  FOREACH v_assignment IN ARRAY v_assignments
  LOOP
    v_booking_id := (v_assignment->>'booking_id')::uuid;
    v_client_id := (v_assignment->>'client_id')::uuid;

    -- Idempotency: skip if booking already has a quote
    PERFORM 1 FROM public.bookings WHERE id = v_booking_id AND quote_id IS NOT NULL;
    IF FOUND THEN
      RAISE NOTICE 'Skipped (already has quote): %', v_booking_id;
      v_n_skipped := v_n_skipped + 1;
      CONTINUE;
    END IF;

    -- Verify booking still lacks client_id
    PERFORM 1 FROM public.bookings WHERE id = v_booking_id AND client_id IS NOT NULL;
    IF FOUND THEN
      RAISE NOTICE 'Skipped (client_id already set): %', v_booking_id;
      v_n_skipped := v_n_skipped + 1;
      CONTINUE;
    END IF;

    -- 1. Assign client_id
    UPDATE public.bookings
    SET client_id = v_client_id, updated_at = now()
    WHERE id = v_booking_id;
    v_n_assigned := v_n_assigned + 1;

    -- 2. Skip quote if no service_id
    PERFORM 1 FROM public.bookings WHERE id = v_booking_id AND service_id IS NULL;
    IF FOUND THEN
      RAISE NOTICE 'Assigned client_id but skipped quote (no service_id): %', v_booking_id;
      v_n_no_service := v_n_no_service + 1;
      CONTINUE;
    END IF;

    -- 3. Generate quote via RPC
    SELECT public.generate_quote_from_booking(v_booking_id, 'backfill_2026_06_17')::jsonb
      INTO v_quote_result;

    IF v_quote_result->>'success' = 'true' THEN
      v_quote_id := (v_quote_result->>'quote_id')::uuid;
      RAISE NOTICE 'Created quote % for booking %', v_quote_id, v_booking_id;
      v_n_quotes_created := v_n_quotes_created + 1;
    ELSE
      RAISE WARNING 'Quote generation FAILED for booking %: %',
        v_booking_id, v_quote_result->>'error';
    END IF;
  END LOOP;

  RAISE NOTICE '=== BACKFILL SUMMARY ===';
  RAISE NOTICE 'Assignments (client_id set): %', v_n_assigned;
  RAISE NOTICE 'Quotes created:             %', v_n_quotes_created;
  RAISE NOTICE 'Skipped (already done):     %', v_n_skipped;
  RAISE NOTICE 'Skipped (no service_id):    %', v_n_no_service;

  -- Post-check
  PERFORM 1 FROM public.bookings
  WHERE id IN (
    SELECT (value->>'booking_id')::uuid FROM jsonb_array_elements(v_assignments)
  )
  AND quote_id IS NULL
  AND client_id IS NOT NULL
  AND service_id IS NOT NULL;
  IF FOUND THEN
    RAISE WARNING 'Some bookings still have no quote despite having client_id + service_id. Check logs above.';
  END IF;
END $$;