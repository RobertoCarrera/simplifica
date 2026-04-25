-- Assign default_resource_id to existing bookings where:
-- - The professional has a default_resource_id set (fixed room)
-- - The booking doesn't already have a resource assigned
-- - The booking is not cancelled
-- If a professional has NO default_resource_id, they can work in any room → no assignment needed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'professionals'
      AND column_name = 'default_resource_id'
  ) THEN
    RAISE NOTICE 'assign_rooms backfill: skipped — column default_resource_id does not exist';
    RETURN;
  END IF;

  UPDATE bookings b
  SET resource_id = p.default_resource_id
  FROM professionals p
  WHERE b.professional_id = p.id
    AND b.resource_id IS NULL
    AND b.status != 'cancelled'
    AND p.default_resource_id IS NOT NULL;
END;
$$;
