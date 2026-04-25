-- DIAGNOSTIC: Check state of resources and bookings, then do a broader retroactive assignment.
-- RAISE NOTICE messages appear in the supabase db push output.

DO $$
DECLARE
  v_resource_count INT;
  v_booking_null_count INT;
  v_booking_assigned_count INT;
  b RECORD;
  r RECORD;
  assigned_id UUID;
  conflict_count INT;
  updated_count INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'professionals'
      AND column_name = 'default_resource_id'
  ) THEN
    RAISE NOTICE 'diagnose_assign_rooms: skipped — column default_resource_id does not exist';
    RETURN;
  END IF;

  -- Diagnostic: count resources
  SELECT COUNT(*) INTO v_resource_count FROM resources;
  RAISE NOTICE 'Total resources in DB: %', v_resource_count;

  SELECT COUNT(*) INTO v_resource_count FROM resources WHERE type = 'room';
  RAISE NOTICE 'Resources of type=room: %', v_resource_count;

  SELECT COUNT(*) INTO v_resource_count FROM resources WHERE type = 'room' AND is_active = true;
  RAISE NOTICE 'Resources type=room AND is_active=true: %', v_resource_count;

  -- Diagnostic: count bookings
  SELECT COUNT(*) INTO v_booking_null_count
  FROM bookings WHERE resource_id IS NULL AND status != 'cancelled';
  RAISE NOTICE 'Bookings without resource_id (not cancelled): %', v_booking_null_count;

  SELECT COUNT(*) INTO v_booking_assigned_count
  FROM bookings WHERE resource_id IS NOT NULL;
  RAISE NOTICE 'Bookings with resource_id already set: %', v_booking_assigned_count;

  -- Broader retroactive assignment:
  -- - No is_active filter (catch all resources)
  -- - No type filter (catch any room-like resource)
  -- - LEFT JOIN professionals (handle bookings that might lack professional_id)
  -- - Process in chronological order

  FOR b IN
    SELECT
      bk.id,
      bk.start_time,
      bk.end_time,
      bk.company_id,
      p.default_resource_id
    FROM bookings bk
    LEFT JOIN professionals p ON p.id = bk.professional_id
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

    -- Step 2: Any free room in the company (no type/is_active filter)
    IF assigned_id IS NULL THEN
      FOR r IN
        SELECT res.id
        FROM resources res
        WHERE res.company_id = b.company_id
          AND (b.default_resource_id IS NULL OR res.id != b.default_resource_id)
        ORDER BY res.name
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
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF assigned_id IS NOT NULL THEN
      UPDATE bookings SET resource_id = assigned_id WHERE id = b.id;
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Bookings updated with room assignment: %', updated_count;
END $$;
