-- Fix SECURITY DEFINER functions to have a safe search_path
-- This prevents hijacking of the search_path by malicious users.

-- 1. Analytics RPCs
CREATE OR REPLACE FUNCTION f_analytics_occupancy_heatmap(
  p_company_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT (now() - interval '30 days'),
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT now()
)
RETURNS TABLE (
  day_of_week INTEGER,
  hour_of_day INTEGER,
  booking_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXTRACT(DOW FROM start_time)::INTEGER as day_of_week,
    EXTRACT(HOUR FROM start_time)::INTEGER as hour_of_day,
    COUNT(*) as booking_count
  FROM bookings
  WHERE company_id = p_company_id
    AND start_time >= p_start_date
    AND start_time <= p_end_date
    AND status NOT IN ('cancelled', 'no_show')
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

CREATE OR REPLACE FUNCTION f_analytics_revenue_forecast(
  p_company_id UUID
)
RETURNS TABLE (
  period TEXT, -- 'past_30d', 'next_30d'
  total_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT 'past_30d' as period, COALESCE(SUM(total_price), 0)
  FROM bookings
  WHERE company_id = p_company_id
    AND start_time >= (now() - interval '30 days')
    AND start_time < now()
    AND status IN ('completed', 'confirmed', 'paid')
  UNION ALL
  SELECT 'next_30d' as period, COALESCE(SUM(total_price), 0)
  FROM bookings
  WHERE company_id = p_company_id
    AND start_time >= now()
    AND start_time <= (now() + interval '30 days')
    AND status IN ('confirmed', 'pending_payment');
END;
$$;

CREATE OR REPLACE FUNCTION f_analytics_top_performers(
  p_company_id UUID,
  p_month_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  professional_id UUID,
  professional_name TEXT,
  bookings_count BIGINT,
  total_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.professional_id,
    u.name as professional_name,
    COUNT(*) as bookings_count,
    COALESCE(SUM(b.total_price), 0) as total_revenue
  FROM bookings b
  JOIN company_members cm ON b.professional_id = cm.id
  JOIN users u ON cm.user_id = u.id
  WHERE b.company_id = p_company_id
    AND date_trunc('month', b.start_time) = date_trunc('month', p_month_date)
    AND b.status NOT IN ('cancelled')
  GROUP BY b.professional_id, u.name
  ORDER BY total_revenue DESC
  LIMIT 5;
END;
$$;

-- 2. Audit Log Trigger Function
CREATE OR REPLACE FUNCTION log_booking_changes()
RETURNS TRIGGER AS $$
DECLARE
    current_auth_id UUID;
    current_public_user_id UUID;
    audit_company_id UUID;
    change_details JSONB := '{}'::jsonb;
    ch_type TEXT := 'update';
BEGIN
    current_auth_id := auth.uid();
    
    -- Try to find public user id
    SELECT id INTO current_public_user_id FROM public.users WHERE auth_user_id = current_auth_id LIMIT 1;

    -- Determine operation
    IF (TG_OP = 'INSERT') THEN
        ch_type := 'create';
        audit_company_id := NEW.company_id;
        change_details := jsonb_build_object('event', 'Booking Created');
    ELSIF (TG_OP = 'UPDATE') THEN
        audit_company_id := NEW.company_id;
        
        -- Default type
        ch_type := 'update';

        -- Detect Status Change
        IF OLD.status IS DISTINCT FROM NEW.status THEN
             IF NEW.status = 'cancelled' THEN
                ch_type := 'cancel';
             ELSE
                ch_type := 'status_change';
             END IF;
             change_details := change_details || jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status);
        END IF;
        
        -- Detect Reschedule
        IF OLD.start_time IS DISTINCT FROM NEW.start_time OR OLD.end_time IS DISTINCT FROM NEW.end_time THEN
             ch_type := 'reschedule';
             change_details := change_details || jsonb_build_object('old_start', OLD.start_time, 'new_start', NEW.start_time);
        END IF;

         -- Detect Resource/Professional Change
        IF OLD.resource_id IS DISTINCT FROM NEW.resource_id THEN
             change_details := change_details || jsonb_build_object('action', 'Resource Changed', 'old_resource', OLD.resource_id, 'new_resource', NEW.resource_id);
        END IF;
        IF OLD.professional_id IS DISTINCT FROM NEW.professional_id THEN
             change_details := change_details || jsonb_build_object('action', 'Professional Changed', 'old_prof', OLD.professional_id, 'new_prof', NEW.professional_id);
        END IF;
        
    END IF;

    -- Only log if it's an insert or we have interesting updates
    
    INSERT INTO public.booking_history (
        booking_id,
        changed_by,
        changed_by_user_id,
        previous_status,
        new_status,
        change_type,
        details,
        company_id
    ) VALUES (
        NEW.id,
        current_auth_id,
        current_public_user_id,
        CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
        NEW.status,
        ch_type,
        change_details,
        audit_company_id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 3. Invitation RPC
CREATE OR REPLACE FUNCTION public.invite_user_to_company(p_company_id uuid, p_email text, p_role text DEFAULT 'member'::text, p_message text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
DECLARE
  inviter_user_id UUID;
  inviter_role TEXT;
  invitation_id UUID;
  company_name TEXT;
BEGIN
  -- 1. Get Inviter ID and verify role via company_members
  SELECT u.id, cm.role, c.name 
  INTO inviter_user_id, inviter_role, company_name
  FROM public.users u
  JOIN public.company_members cm ON cm.user_id = u.id
  JOIN public.companies c ON c.id = cm.company_id
  WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = p_company_id
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin');

  -- 2. Validate permissions
  IF inviter_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: You must be an Owner or Admin of this company to invite users.');
  END IF;

  -- 3. Check if user already exists in the company
  IF EXISTS(
      SELECT 1 FROM public.users u
      JOIN public.company_members cm ON cm.user_id = u.id
      WHERE u.email = p_email 
      AND cm.company_id = p_company_id 
      AND cm.status = 'active'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'User already exists in this company');
  END IF;

  -- 4. Expire old pending invitations for this email/company
  UPDATE public.company_invitations
  SET status = 'expired'
  WHERE email = p_email AND company_id = p_company_id AND status = 'pending';

  -- 5. Create new invitation
  INSERT INTO public.company_invitations (company_id, email, invited_by_user_id, role, message)
  VALUES (p_company_id, p_email, inviter_user_id, p_role, p_message)
  RETURNING id INTO invitation_id;

  RETURN json_build_object(
    'success', true, 
    'invitation_id', invitation_id, 
    'company_name', company_name, 
    'message', 'Invitation sent successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;
