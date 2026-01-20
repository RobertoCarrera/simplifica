-- Correction: Fix create_ticket to allow system stages
-- Description: 
-- 1. Updates create_ticket RPC to check for (company_id = p_company_id OR company_id IS NULL) when validating p_stage_id.
-- 2. Deletes the redundant company-specific stages created in the previous step.

-- 1. Update create_ticket RPC
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
  -- 1. Get Current Auth User
  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Validate Permissions (Staff or Client)
  SELECT EXISTS (
    SELECT 1 
    FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE u.auth_user_id = v_auth_user_id 
    AND cm.company_id = p_company_id 
    AND cm.status = 'active'
    AND u.active = true
    AND ar.name IN ('super_admin', 'agent', 'admin', 'professional', 'member', 'owner')
  ) INTO v_is_staff;

  IF NOT v_is_staff THEN
    -- Check Client
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

  -- 3. Determine Stage (FIXED)
  IF p_stage_id IS NOT NULL THEN
    -- Fix: Allow system stages (company_id IS NULL) OR company stages
    SELECT id INTO v_final_stage_id 
    FROM public.ticket_stages 
    WHERE id = p_stage_id 
    AND deleted_at IS NULL 
    AND (company_id = p_company_id OR company_id IS NULL);
    
    IF v_final_stage_id IS NULL THEN
       RAISE EXCEPTION 'Invalid stage_id provided';
    END IF;
  ELSE
    -- Default to first stage ('new') for the company (or generic 'Open'/'Recibido')
    -- Prioritize generic 'Recibido' or 'new' category if company has none?
    -- Logic: search for valid stages for this company (including generic) ordered by position
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
    company_id,
    client_id,
    title,
    description,
    priority,
    due_date,
    stage_id,
    assigned_to,
    created_at,
    updated_at,
    is_opened
  ) VALUES (
    p_company_id,
    p_client_id,
    p_title,
    p_description,
    p_priority,
    p_due_date,
    v_final_stage_id,
    p_assigned_to,
    now(),
    now(),
    true
  ) RETURNING id, ticket_number INTO v_ticket_id, v_ticket_number;

  -- 5. Add Services
  IF p_services IS NOT NULL AND jsonb_array_length(p_services) > 0 THEN
    FOR v_service_item IN SELECT * FROM jsonb_array_elements(p_services)
    LOOP
      v_quantity := COALESCE((v_service_item->>'quantity')::numeric, 1);
      v_unit_price := COALESCE((v_service_item->>'unit_price')::numeric, 0);
      v_line_total := v_quantity * v_unit_price;
      v_total_amount := v_total_amount + v_line_total;

      INSERT INTO public.ticket_products (
        id, ticket_id, service_id, quantity, unit_price, total_price, company_id
      ) VALUES (
        gen_random_uuid(),
        v_ticket_id,
        (v_service_item->>'service_id')::uuid,
        v_quantity,
        v_unit_price,
        v_line_total,
        p_company_id
      );
    END LOOP;
  END IF;

  -- 6. Add Products
  IF p_products IS NOT NULL AND jsonb_array_length(p_products) > 0 THEN
    FOR v_product_item IN SELECT * FROM jsonb_array_elements(p_products)
    LOOP
      v_quantity := COALESCE((v_product_item->>'quantity')::numeric, 1);
      v_unit_price := COALESCE((v_product_item->>'unit_price')::numeric, 0);
      v_line_total := v_quantity * v_unit_price;
      v_total_amount := v_total_amount + v_line_total;

      INSERT INTO public.ticket_products (
        id, ticket_id, product_id, quantity, unit_price, total_price, company_id
      ) VALUES (
        gen_random_uuid(),
        v_ticket_id,
        (v_product_item->>'product_id')::uuid,
        v_quantity,
        v_unit_price,
        v_line_total,
        p_company_id
      );
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

    INSERT INTO public.ticket_comments (
      ticket_id, comment, user_id, company_id, is_internal, created_at
    ) VALUES (
      v_ticket_id,
      v_full_comment,
      (SELECT id FROM public.users WHERE auth_user_id = v_auth_user_id LIMIT 1),
      p_company_id,
      false,
      now()
    );
  END IF;

  -- 9. Link Device
  IF p_device_id IS NOT NULL THEN
    INSERT INTO public.ticket_devices (ticket_id, device_id)
    VALUES (v_ticket_id, p_device_id);
  END IF;

  -- 10. Return Result
  SELECT to_jsonb(sub) INTO v_ret_ticket
  FROM (
    SELECT 
      t.*,
      row_to_json(c) as client,
      row_to_json(s) as stage
    FROM public.tickets t
    LEFT JOIN public.clients c ON t.client_id = c.id
    LEFT JOIN public.ticket_stages s ON t.stage_id = s.id
    WHERE t.id = v_ticket_id
  ) sub;
  
  RETURN v_ret_ticket;

END;
$$;

-- 2. Cleanup: Delete the manual stages I created for this company 
-- (Assuming user prefers system stages since they saw them)
DELETE FROM public.ticket_stages 
WHERE company_id = '7834c88a-f7ec-4436-a8d7-3efd23395c79' 
AND name IN ('Nuevo', 'En curso', 'Completado', 'Cancelado')
AND created_at > (now() - interval '1 hour');
