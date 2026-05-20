-- Fix: booking_missing_* notifications must be professional-only, not visible to owner profile
-- Root cause: scan_incomplete_bookings() RPC never set profile_type, leaving it NULL
-- NULL profile_type notifications are shown in owner mode (filter: profile_type IS NULL OR profile_type = 'owner')

-- Step 1: Backfill all existing booking_missing_* notifications to profile_type = 'professional'
UPDATE public.notifications
SET profile_type = 'professional'
WHERE type IN ('booking_missing_client', 'booking_missing_service', 'booking_missing_resource')
  AND (profile_type IS NULL OR profile_type != 'professional');

-- Step 2: Fix the RPC to set profile_type on new notifications
-- Must drop first because return type changed (RETURNS TABLE with explicit column names)
DROP FUNCTION IF EXISTS public.scan_incomplete_bookings(uuid);

CREATE OR REPLACE FUNCTION public.scan_incomplete_bookings(p_company_id uuid)
 RETURNS TABLE(
  missing_client bigint,
  missing_service bigint,
  missing_resource bigint,
  notifications_created bigint
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
BEGIN
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

  RETURN NEXT;
END;
$$;
