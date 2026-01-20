-- Migration: Fix Role Resolution for Multi-Company Access
-- Description: Updates functions to check company_members.role_id FIRST, then users.app_role_id.

-- 1. Helper function to get effective role_id for a user in a company
CREATE OR REPLACE FUNCTION public.get_effective_role_id(p_company_id uuid, p_auth_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_user_id uuid;
BEGIN
  -- Get public user id
  SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = p_auth_user_id LIMIT 1;
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  -- 1. Check company_members (Specific membership)
  SELECT role_id INTO v_role_id
  FROM public.company_members
  WHERE user_id = v_user_id
  AND company_id = p_company_id
  AND status = 'active'
  LIMIT 1;

  -- 2. If not found, check if it's their primary company in users table
  IF v_role_id IS NULL THEN
    SELECT app_role_id INTO v_role_id
    FROM public.users
    WHERE id = v_user_id
    AND company_id = p_company_id
    AND active = true;
  END IF;

  RETURN v_role_id;
END;
$$;

-- 2. Fix current_user_is_admin to use effective role
CREATE OR REPLACE FUNCTION public.current_user_is_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  v_role_id := public.get_effective_role_id(p_company_id, auth.uid());
  
  IF v_role_id IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.app_roles 
    WHERE id = v_role_id 
    AND name IN ('owner', 'admin', 'super_admin')
  );
END;
$$;

-- 3. Update create_ticket to use effective role and permissions
CREATE OR REPLACE FUNCTION public.create_ticket(
  p_company_id uuid,
  p_client_id uuid,
  p_title text,
  p_description text,
  p_priority text,
  p_due_date timestamptz DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_initial_comment text DEFAULT NULL,
  p_initial_attachment_url text DEFAULT NULL,
  p_device_id uuid DEFAULT NULL,
  p_services jsonb DEFAULT '[]'::jsonb,
  p_products jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid;
  v_role_id uuid;
  v_is_staff boolean := false;
  v_acting_client_id uuid;
  v_ticket_id uuid;
  v_ticket_number int;
  v_final_stage_id uuid;
  v_total_amount numeric := 0;
  v_service_item jsonb;
  v_product_item jsonb;
  v_unit_price numeric;
  v_quantity numeric;
  v_line_total numeric;
  v_full_comment text;
  v_ret_ticket jsonb;
BEGIN
  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Resolve Effective Role
  v_role_id := public.get_effective_role_id(p_company_id, v_auth_user_id);

  IF v_role_id IS NOT NULL THEN
     -- Check Staff Permission: Either high-level role OR explicit 'tickets.create' permission
     SELECT EXISTS (
       SELECT 1 FROM public.app_roles ar
       WHERE ar.id = v_role_id
       AND (
         ar.name IN ('super_admin', 'owner', 'admin', 'agent', 'professional', 'member')
         OR 
         EXISTS (
           SELECT 1 FROM public.role_permissions rp 
           WHERE rp.role_id = v_role_id 
           AND rp.company_id = p_company_id
           AND rp.permission = 'tickets.create'
           AND rp.granted = true
         )
       )
     ) INTO v_is_staff;
  END IF;

  IF NOT v_is_staff THEN
    -- Check Client Access
    SELECT id INTO v_acting_client_id
    FROM public.clients
    WHERE auth_user_id = v_auth_user_id 
    AND company_id = p_company_id
    AND is_active = true;

    IF v_acting_client_id IS NULL THEN
      RAISE EXCEPTION 'User not allowed for this company (Not Staff, Not Client)';
    END IF;

    IF p_client_id != v_acting_client_id THEN
      RAISE EXCEPTION 'Clients can only create tickets for themselves';
    END IF;
  END IF;

  -- (Rest of the function remains the same, proceeding to create ticket)
  -- ... [Stage selection, Insert, etc.] ...
  -- Copying the rest of the logic ensuring it matches previous state
  
  -- 3. Determine Stage
  IF p_stage_id IS NOT NULL THEN
    SELECT id INTO v_final_stage_id 
    FROM public.ticket_stages 
    WHERE id = p_stage_id 
    AND deleted_at IS NULL 
    AND (company_id = p_company_id OR company_id IS NULL);
    
    IF v_final_stage_id IS NULL THEN
       RAISE EXCEPTION 'Invalid stage_id provided';
    END IF;
  ELSE
    SELECT id INTO v_final_stage_id 
    FROM public.ticket_stages 
    WHERE (company_id = p_company_id OR company_id IS NULL)
    AND deleted_at IS NULL 
    ORDER BY position ASC 
    LIMIT 1;
    
    IF v_final_stage_id IS NULL THEN
      RAISE EXCEPTION 'No ticket stages defined for this company';
    END IF;
  END IF;

  -- 4. Create Ticket
  INSERT INTO public.tickets (
    company_id, client_id, title, description, priority, due_date, stage_id, assigned_to, created_at, updated_at, is_opened
  ) VALUES (
    p_company_id, p_client_id, p_title, p_description, p_priority, p_due_date, v_final_stage_id, p_assigned_to, now(), now(), true
  ) RETURNING id, ticket_number INTO v_ticket_id, v_ticket_number;

  -- 5. Add Services
  IF p_services IS NOT NULL AND jsonb_array_length(p_services) > 0 THEN
    FOR v_service_item IN SELECT * FROM jsonb_array_elements(p_services) LOOP
      v_quantity := COALESCE((v_service_item->>'quantity')::numeric, 1);
      v_unit_price := COALESCE((v_service_item->>'unit_price')::numeric, 0);
      v_line_total := v_quantity * v_unit_price;
      v_total_amount := v_total_amount + v_line_total;
      INSERT INTO public.ticket_products (id, ticket_id, service_id, quantity, unit_price, total_price, company_id) 
      VALUES (gen_random_uuid(), v_ticket_id, (v_service_item->>'service_id')::uuid, v_quantity, v_unit_price, v_line_total, p_company_id);
    END LOOP;
  END IF;

  -- 6. Add Products
  IF p_products IS NOT NULL AND jsonb_array_length(p_products) > 0 THEN
    FOR v_product_item IN SELECT * FROM jsonb_array_elements(p_products) LOOP
      v_quantity := COALESCE((v_product_item->>'quantity')::numeric, 1);
      v_unit_price := COALESCE((v_product_item->>'unit_price')::numeric, 0);
      v_line_total := v_quantity * v_unit_price;
      v_total_amount := v_total_amount + v_line_total;
      INSERT INTO public.ticket_products (id, ticket_id, product_id, quantity, unit_price, total_price, company_id) 
      VALUES (gen_random_uuid(), v_ticket_id, (v_product_item->>'product_id')::uuid, v_quantity, v_unit_price, v_line_total, p_company_id);
    END LOOP;
  END IF;

  -- 7. Update Total Amount
  UPDATE public.tickets SET total_amount = v_total_amount WHERE id = v_ticket_id;

  -- 8. Initial Comment
  IF p_initial_comment IS NOT NULL AND length(trim(p_initial_comment)) > 0 THEN
    v_full_comment := trim(p_initial_comment);
    IF p_initial_attachment_url IS NOT NULL AND length(p_initial_attachment_url) > 0 THEN
       v_full_comment := v_full_comment || E'\n\n![Adjunto](' || p_initial_attachment_url || ')';
    END IF;
    INSERT INTO public.ticket_comments (ticket_id, comment, user_id, company_id, is_internal, created_at) 
    VALUES (v_ticket_id, v_full_comment, (SELECT id FROM public.users WHERE auth_user_id = v_auth_user_id LIMIT 1), p_company_id, false, now());
  END IF;

  -- 9. Link Device
  IF p_device_id IS NOT NULL THEN
    INSERT INTO public.ticket_devices (ticket_id, device_id) VALUES (v_ticket_id, p_device_id);
  END IF;

  -- 10. Return Result
  SELECT to_jsonb(sub) INTO v_ret_ticket
  FROM (
    SELECT t.*, row_to_json(c) as client, row_to_json(s) as stage
    FROM public.tickets t
    LEFT JOIN public.clients c ON t.client_id = c.id
    LEFT JOIN public.ticket_stages s ON t.stage_id = s.id
    WHERE t.id = v_ticket_id
  ) sub;
  
  RETURN v_ret_ticket;
END;
$$;

-- 4. Update trigger to use get_effective_role_id logic (or equivalent join)
-- Since trigger runs as system/definer, it doesn't utilize auth.uid() the same way for recipient notification,
-- but `handle_ticket_notifications` iterates over admins. Admin check should use similar logic.
CREATE OR REPLACE FUNCTION public.handle_ticket_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admins CURSOR FOR 
        -- Get users who are admins/owners in this company
        -- Check company_members FIRST
        SELECT cm.user_id 
        FROM public.company_members cm
        JOIN public.app_roles ar ON cm.role_id = ar.id
        WHERE cm.company_id = NEW.company_id
        AND ar.name IN ('owner', 'admin')
        AND cm.status = 'active'
        
        UNION
        
        -- UNION with users table (primary company)
        -- (Ideally we avoid duplicates but UNION handles that)
        SELECT u.id as user_id
        FROM public.users u
        JOIN public.app_roles ar ON u.app_role_id = ar.id
        WHERE u.company_id = NEW.company_id
        AND ar.name IN ('owner', 'admin')
        AND u.active = true;
BEGIN
    IF TG_OP = 'INSERT' THEN
        FOR admin_Rec IN v_admins LOOP
            -- Avoid self-notification if creator is admin? (Optional, skipping optimization for simplicity)
            PERFORM public.create_notification(NEW.company_id, admin_Rec.user_id, 'ticket_created', NEW.id, 'Nuevo Ticket #' || NEW.ticket_number, 'Se ha creado un nuevo ticket: ' || NEW.title);
        END LOOP;
        
        IF NEW.assigned_to IS NOT NULL THEN
             PERFORM public.create_notification(NEW.company_id, NEW.assigned_to, 'ticket_assigned', NEW.id, 'Ticket Asignado #' || NEW.ticket_number, 'Te han asignado el ticket: ' || NEW.title);
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND (NEW.assigned_to IS NOT NULL) THEN
            PERFORM public.create_notification(NEW.company_id, NEW.assigned_to, 'ticket_assigned', NEW.id, 'Ticket Asignado #' || NEW.ticket_number, 'Te han asignado el ticket: ' || NEW.title);
        END IF;

        IF (OLD.stage_id IS DISTINCT FROM NEW.stage_id) THEN
            IF NEW.assigned_to IS NOT NULL THEN
                PERFORM public.create_notification(NEW.company_id, NEW.assigned_to, 'ticket_status_change', NEW.id, 'Cambio de Estado Ticket #' || NEW.ticket_number, 'El estado del ticket ha cambiado.');
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
