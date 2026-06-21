-- Migration: Add service variant support to bookings
--
-- Purpose: When a customer books a service that has variants (e.g. monthly
-- vs annual pricing tiers), we need to remember WHICH variant they chose
-- AND a snapshot of the pricing row at the moment of booking. The snapshot
-- is critical because variant pricing can change over time, and historical
-- bookings must stay stable.
--
-- Also: create_booking_with_resource is expanded to accept the new fields
-- and validate that the variant belongs to the requested service.

BEGIN;

-- Add variant columns to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS variant_id uuid NULL REFERENCES public.service_variants(id) ON DELETE SET NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS variant_pricing_snapshot jsonb NULL;

COMMENT ON COLUMN public.bookings.variant_id IS 'Service variant chosen by the customer at booking time. NULL means the service has no variants or none was selected.';
COMMENT ON COLUMN public.bookings.variant_pricing_snapshot IS 'Snapshot of the variant pricing row (base_price, billing_period, discount_percentage) at the moment of booking, so historical records stay stable even if the variant pricing changes.';

CREATE INDEX IF NOT EXISTS bookings_variant_id_idx
  ON public.bookings (variant_id)
  WHERE variant_id IS NOT NULL;

-- Update create_booking_with_resource to accept and persist variant_id + pricing snapshot.
-- The two new parameters are optional (DEFAULT NULL) so existing callers keep working.

DROP FUNCTION IF EXISTS public.create_booking_with_resource(
  uuid, timestamptz, timestamptz, jsonb, text, uuid, jsonb
);

CREATE OR REPLACE FUNCTION public.create_booking_with_resource(
  p_professional_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_booking_data jsonb,
  p_source text DEFAULT 'admin'::text,
  p_variant_id uuid DEFAULT NULL,
  p_variant_pricing_snapshot jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_resource_id uuid;
  v_booking_id uuid;
  v_company_id uuid;
  v_payment_status text := CASE
    WHEN p_booking_data->>'payment_status' IN ('pending','partial','paid','refunded')
      THEN p_booking_data->>'payment_status'
    ELSE 'pending'
  END;
  -- If a variant_id is provided, validate that it exists, is active, not hidden,
  -- and belongs to the requested service. This guards against tampering.
  v_service_id uuid := (p_booking_data->>'service_id')::uuid;
  v_variant_check int := 0;
BEGIN
  -- Get company_id from professional
  SELECT company_id INTO v_company_id FROM professionals WHERE id = p_professional_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'professional_not_found');
  END IF;

  -- Validate variant ownership before doing any work
  IF p_variant_id IS NOT NULL THEN
    SELECT count(*) INTO v_variant_check
    FROM public.service_variants sv
    WHERE sv.id = p_variant_id
      AND sv.service_id = v_service_id
      AND sv.is_active = true
      AND sv.is_hidden = false;
    IF v_variant_check = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_variant');
    END IF;
  END IF;

  -- Try professional's default_resource_id first
  SELECT default_resource_id INTO v_resource_id FROM professionals
  WHERE id = p_professional_id AND default_resource_id IS NOT NULL;

  -- If not set or not available, find any available active room
  IF v_resource_id IS NULL OR EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.resource_id = v_resource_id
      AND b.status != 'cancelled'
      AND b.start_time < p_end_time
      AND b.end_time > p_start_time
    FOR UPDATE
  ) THEN
    SELECT r.id INTO v_resource_id FROM resources r
    WHERE r.company_id = v_company_id
      AND r.is_active = true
      AND r.type = 'room'
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.resource_id = r.id
          AND b.status != 'cancelled'
          AND b.start_time < p_end_time
          AND b.end_time > p_start_time
      )
    LIMIT 1;

    IF v_resource_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'no_room_available');
    END IF;
  END IF;

  -- Insert booking with source + payment fields + variant fields
  INSERT INTO bookings (
    company_id, professional_id, resource_id,
    start_time, end_time, source,
    customer_name, customer_email, customer_phone,
    service_id, booking_type_id, status,
    payment_method, payment_status,
    variant_id, variant_pricing_snapshot
  ) VALUES (
    v_company_id, p_professional_id, v_resource_id,
    p_start_time, p_end_time, p_source,
    (p_booking_data->>'customer_name')::text,
    (p_booking_data->>'customer_email')::text,
    (p_booking_data->>'customer_phone')::text,
    v_service_id,
    (p_booking_data->>'booking_type_id')::uuid,
    'confirmed',
    (p_booking_data->>'payment_method')::public.payment_method,
    v_payment_status,
    p_variant_id,
    p_variant_pricing_snapshot
  ) RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'resource_id', v_resource_id,
    'variant_id', p_variant_id
  );
END;
$function$;

-- Grant must be re-applied because the signature changed (new optional params
-- don't change the privilege but the linter expects an explicit grant on the
-- current signature after CREATE OR REPLACE).
GRANT EXECUTE ON FUNCTION public.create_booking_with_resource(
  uuid, timestamptz, timestamptz, jsonb, text, uuid, jsonb
) TO anon, authenticated;

-- Pin search_path to public, pg_temp on the new signature (the 5-arg form
-- was pinned in 20260620_set_search_path_on_public_functions.sql; we re-pin
-- the 7-arg form here so future linter runs don't flag it).
ALTER FUNCTION public.create_booking_with_resource(
  uuid, timestamptz, timestamptz, jsonb, text, uuid, jsonb
) SET search_path = public, pg_temp;

COMMIT;
