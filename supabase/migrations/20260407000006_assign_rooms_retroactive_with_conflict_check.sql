-- Retroactively assign rooms to existing bookings that have no resource_id.
-- Logic:
--   1. If the professional has a default_resource_id → try that room first
--   2. If it's occupied at that time → fall back to any other active room for the company
--   3. Process bookings in chronological order so earlier sessions get priority

DO $$
DECLARE
  b   RECORD;
  r   RECORD;
  assigned_id UUID;
  conflict_count INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'professionals'
      AND column_name = 'default_resource_id'
  ) THEN
    RAISE NOTICE 'assign_rooms_retroactive: skipped — column default_resource_id does not exist';
    RETURN;
  END IF;

  FOR b IN
    SELECT
      bk.id,
      bk.start_time,
      bk.end_time,
      bk.company_id,
      p.default_resource_id
    FROM bookings bk
    JOIN professionals p ON p.id = bk.professional_id
    WHERE bk.resource_id IS NULL
      AND bk.status != 'cancelled'
      AND bk.start_time IS NOT NULL
      AND bk.end_time IS NOT NULL
    ORDER BY bk.start_time
  LOOP
    assigned_id := NULL;

    -- Step 1: Try the professional's fixed room first (if any)
    IF b.default_resource_id IS NOT NULL THEN
      SELECT COUNT(*) INTO conflict_count
      FROM bookings
      WHERE resource_id = b.default_resource_id
        AND status != 'cancelled'
        AND start_time < b.end_time
        AND end_time > b.start_time
        AND id != b.id;

      IF conflict_count = 0 THEN
        assigned_id := b.default_resource_id;
      END IF;
    END IF;

    -- Step 2: If no fixed room or it's occupied, find any available room
    IF assigned_id IS NULL THEN
      FOR r IN
        SELECT res.id
        FROM resources res
        WHERE res.company_id = b.company_id
          AND res.type = 'room'
          AND res.is_active = true
          AND (b.default_resource_id IS NULL OR res.id != b.default_resource_id)
        ORDER BY res.id  -- deterministic order
      LOOP
        SELECT COUNT(*) INTO conflict_count
        FROM bookings
        WHERE resource_id = r.id
          AND status != 'cancelled'
          AND start_time < b.end_time
          AND end_time > b.start_time
          AND id != b.id;

        IF conflict_count = 0 THEN
          assigned_id := r.id;
          EXIT; -- found one, stop looking
        END IF;
      END LOOP;
    END IF;

    -- Step 3: Assign if we found a room
    IF assigned_id IS NOT NULL THEN
      UPDATE bookings SET resource_id = assigned_id WHERE id = b.id;
    END IF;
  END LOOP;
END $$;
