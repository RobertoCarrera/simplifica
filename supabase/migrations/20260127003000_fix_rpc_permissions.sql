-- Migration: Fix RPC Permissions (Multi-Company Support)
-- Description: Updates create_ticket and list_company_devices to correctly check company_members for staff permissions
--              instead of relying on the single-value users.company_id column.
--              This fixes issues for users who are members of multiple companies (e.g. Staff in one, Client in another).

-- 1. Update create_ticket RPC
CREATE OR REPLACE FUNCTION public.create_ticket(
  p_company_id uuid,
  p_client_id uuid,
  p_title text,
  p_description text,
  p_priority text DEFAULT 'normal',
  p_stage_id uuid DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_services jsonb DEFAULT '[]'::jsonb,
  p_products jsonb DEFAULT '[]'::jsonb,
  p_initial_comment text DEFAULT NULL,
  p_initial_attachment_url text DEFAULT NULL,
  p_device_id uuid DEFAULT NULL
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
  -- Check Staff via company_members (Correct way for multi-company)
  SELECT EXISTS (
    SELECT 1 
    FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = v_auth_user_id 
    AND cm.company_id = p_company_id 
    AND cm.status = 'active'
    AND u.active = true
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

    -- Security: Client must create ticket for themselves
    IF p_client_id != v_acting_client_id THEN
      RAISE EXCEPTION 'Clients can only create tickets for themselves';
    END IF;
  END IF;

  -- 3. Determine Stage
  IF p_stage_id IS NOT NULL THEN
    -- Verify provided stage exists and is not deleted
    SELECT id INTO v_final_stage_id FROM public.ticket_stages WHERE id = p_stage_id AND deleted_at IS NULL;
  END IF;

  IF v_final_stage_id IS NULL THEN
    -- Fallback: Get first active stage by position
    SELECT id INTO v_final_stage_id 
    FROM public.ticket_stages 
    WHERE deleted_at IS NULL 
    AND company_id = p_company_id -- Ensure stage belongs to company
    ORDER BY position ASC, created_at ASC 
    LIMIT 1;
    
    IF v_final_stage_id IS NULL THEN
      RAISE EXCEPTION 'No active ticket stages found for this company';
    END IF;
  END IF;

  -- 4. Create Ticket
  INSERT INTO public.tickets (
    company_id,
    client_id,
    title,
    description,
    stage_id,
    priority,
    due_date,
    created_at,
    updated_at,
    is_opened
  ) VALUES (
    p_company_id,
    p_client_id,
    p_title,
    CASE 
      WHEN p_initial_attachment_url IS NOT NULL AND length(p_initial_attachment_url) > 0 THEN
         p_description || E'\n\n![Adjunto](' || p_initial_attachment_url || ')'
      ELSE p_description
    END,
    v_final_stage_id,
    p_priority,
    p_due_date,
    now(),
    now(),
    true
  ) RETURNING id, ticket_number INTO v_ticket_id, v_ticket_number;

  -- 5. Process Services
  IF p_services IS NOT NULL AND jsonb_array_length(p_services) > 0 THEN
    FOR v_service_item IN SELECT * FROM jsonb_array_elements(p_services)
    LOOP
      v_unit_price := (v_service_item->>'unit_price')::numeric;
      IF v_unit_price IS NULL THEN
         SELECT base_price INTO v_unit_price FROM public.services WHERE id = (v_service_item->>'service_id')::uuid;
         v_unit_price := COALESCE(v_unit_price, 0);
      END IF;

      v_quantity := GREATEST(1, COALESCE((v_service_item->>'quantity')::numeric, 1));
      v_line_total := ROUND((v_unit_price * v_quantity), 2);
      v_total_amount := v_total_amount + v_line_total;

      INSERT INTO public.ticket_services (
        id, ticket_id, service_id, variant_id, quantity, unit_price, total_price, company_id
      ) VALUES (
        gen_random_uuid(),
        v_ticket_id,
        (v_service_item->>'service_id')::uuid,
        CASE WHEN (v_service_item->>'variant_id') IS NULL THEN NULL ELSE (v_service_item->>'variant_id')::uuid END,
        v_quantity,
        v_unit_price,
        v_line_total,
        p_company_id
      );
    END LOOP;
  END IF;

  -- 6. Process Products
  IF p_products IS NOT NULL AND jsonb_array_length(p_products) > 0 THEN
    FOR v_product_item IN SELECT * FROM jsonb_array_elements(p_products)
    LOOP
      v_unit_price := (v_product_item->>'unit_price')::numeric;
      IF v_unit_price IS NULL THEN
         SELECT price INTO v_unit_price FROM public.products WHERE id = (v_product_item->>'product_id')::uuid;
         v_unit_price := COALESCE(v_unit_price, 0);
      END IF;

      v_quantity := GREATEST(1, COALESCE((v_product_item->>'quantity')::numeric, 1));
      v_line_total := ROUND((v_unit_price * v_quantity), 2);
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
      ticket_id, content, user_id, company_id, is_internal, created_at
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


-- 2. Update list_company_devices RPC
CREATE OR REPLACE FUNCTION public.list_company_devices(
  p_company_id uuid
)
RETURNS SETOF public.devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid;
  v_is_staff boolean := false;
  v_acting_client_id uuid;
BEGIN
  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check Staff via company_members
  SELECT EXISTS (
    SELECT 1 
    FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = v_auth_user_id 
    AND cm.company_id = p_company_id 
    AND cm.status = 'active'
  ) INTO v_is_staff;

  IF NOT v_is_staff THEN
    -- Check Client
    SELECT id INTO v_acting_client_id
    FROM public.clients
    WHERE auth_user_id = v_auth_user_id 
    AND company_id = p_company_id 
    AND is_active = true;

    IF v_acting_client_id IS NULL THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  -- Return Data
  RETURN QUERY
  SELECT d.*
  FROM public.devices d
  WHERE d.company_id = p_company_id
  AND (
    v_is_staff = true 
    OR 
    (v_acting_client_id IS NOT NULL AND d.client_id = v_acting_client_id)
  );

END;
$$;
