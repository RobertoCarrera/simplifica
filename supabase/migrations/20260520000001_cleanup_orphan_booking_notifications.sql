-- Clean up notifications that reference deleted bookings
-- and update scan_incomplete_bookings to auto-clean orphans on each scan

-- Step 1: Delete existing orphan notifications (reference_id points to non-existent booking)
DELETE FROM public.notifications
WHERE type IN ('booking_missing_client', 'booking_missing_service', 'booking_missing_resource')
  AND reference_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id = notifications.reference_id);

-- Step 2: Update scan_incomplete_bookings to also clean orphans on each run
DROP FUNCTION IF EXISTS public.scan_incomplete_bookings(uuid);

CREATE OR REPLACE FUNCTION public.scan_incomplete_bookings(p_company_id uuid)
 RETURNS TABLE(
  missing_client bigint,
  missing_service bigint,
  missing_resource bigint,
  notifications_created bigint,
  orphans_deleted bigint
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $$
DECLARE
  missing_client_count bigint;
  missing_service_count bigint;
  missing_resource_count bigint;
  created_count bigint;
  deleted_count bigint;
BEGIN
  -- Clean up orphan notifications first (bookings that were deleted)
  WITH deleted AS (
    DELETE FROM notifications n
    WHERE n.company_id = p_company_id
      AND n.type IN ('booking_missing_client', 'booking_missing_service', 'booking_missing_resource')
      AND n.reference_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id = n.reference_id)
    RETURNING n.id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  -- Count bookings missing client
  SELECT COUNT(*) INTO missing_client_count FROM bookings b
  WHERE b.company_id = p_company_id
    AND b.client_id IS NULL
    AND b.status NOT IN ('cancelled', 'completed')
    AND b.start_time > now() - interval '30 days';

  INSERT INTO notifications (
    company_id, recipient_id, type, reference_id, title, content, is_read, profile_type
  )
  SELECT 
    b.company_id, p.user_id,
    'booking_missing_client', b.id,
    'Falta cliente en reserva',
    'Reserva ' || to_char(b.start_time, 'DD/MM HH24:MI') || ' con ' || p.display_name || ' sin cliente.',
    false,
    'professional'
  FROM bookings b
  JOIN professionals p ON b.professional_id = p.id
  WHERE b.company_id = p_company_id AND b.client_id IS NULL
    AND b.status NOT IN ('cancelled', 'completed')
    AND b.start_time > now() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.reference_id = b.id AND n.type = 'booking_missing_client'
    );

  -- Count bookings missing service
  SELECT COUNT(*) INTO missing_service_count FROM bookings b
  WHERE b.company_id = p_company_id AND b.service_id IS NULL
    AND b.status NOT IN ('cancelled', 'completed')
    AND b.start_time > now() - interval '30 days';

  INSERT INTO notifications (
    company_id, recipient_id, type, reference_id, title, content, is_read, profile_type
  )
  SELECT 
    b.company_id, p.user_id,
    'booking_missing_service', b.id,
    'Falta servicio en reserva',
    'Reserva ' || to_char(b.start_time, 'DD/MM HH24:MI') || ' con ' || p.display_name || ' sin servicio.',
    false,
    'professional'
  FROM bookings b
  JOIN professionals p ON b.professional_id = p.id
  WHERE b.company_id = p_company_id AND b.service_id IS NULL
    AND b.status NOT IN ('cancelled', 'completed')
    AND b.start_time > now() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.reference_id = b.id AND n.type = 'booking_missing_service'
    );

  -- Count bookings missing resource
  SELECT COUNT(*) INTO missing_resource_count FROM bookings b
  WHERE b.company_id = p_company_id AND b.resource_id IS NULL AND b.session_type = 'presencial'
    AND b.status NOT IN ('cancelled', 'completed')
    AND b.start_time > now() - interval '30 days'
    AND EXISTS (SELECT 1 FROM resource_services rs WHERE rs.service_id = b.service_id);

  INSERT INTO notifications (
    company_id, recipient_id, type, reference_id, title, content, is_read, profile_type
  )
  SELECT 
    b.company_id, p.user_id,
    'booking_missing_resource', b.id,
    'Falta sala en reserva',
    'Reserva ' || to_char(b.start_time, 'DD/MM HH24:MI') || ' con ' || p.display_name || ' sin sala.',
    false,
    'professional'
  FROM bookings b
  JOIN professionals p ON b.professional_id = p.id
  WHERE b.company_id = p_company_id AND b.resource_id IS NULL AND b.session_type = 'presencial'
    AND b.status NOT IN ('cancelled', 'completed')
    AND b.start_time > now() - interval '30 days'
    AND EXISTS (SELECT 1 FROM resource_services rs WHERE rs.service_id = b.service_id)
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.reference_id = b.id AND n.type = 'booking_missing_resource'
    );

  SELECT COUNT(*) INTO created_count
  FROM notifications n
  WHERE n.company_id = p_company_id
    AND n.type IN ('booking_missing_client', 'booking_missing_service', 'booking_missing_resource')
    AND n.created_at > now() - interval '10 seconds';

  missing_client := missing_client_count;
  missing_service := missing_service_count;
  missing_resource := missing_resource_count;
  notifications_created := created_count;
  orphans_deleted := deleted_count;

  RETURN NEXT;
END;
$$;
