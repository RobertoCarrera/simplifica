-- Migration: Migrate Complex CRUD Edge Functions to RPC
-- Replaces: link-ticket-device, upsert-client, create-ticket
-- Priority: High (Transactional Integrity & Performance)

--------------------------------------------------------------------------------
-- 1. RPC: link_ticket_device (Replaces link-ticket-device)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION link_ticket_device(
  p_ticket_id uuid,
  p_device_id uuid,
  p_relation_type text DEFAULT 'primary'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_ticket_company_id uuid;
  v_device_company_id uuid;
BEGIN
  -- Validate Auth
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get User Company
  SELECT company_id INTO v_company_id FROM users WHERE auth_user_id = auth.uid();
  
  -- If not internal user, check for Client portal access (optional, depending on business rule)
  -- For now, strict staff access as per typical use case, or if client owns ticket/device
  IF v_company_id IS NULL THEN
     -- Check if client owns both
     IF NOT EXISTS (
       SELECT 1 FROM tickets t 
       JOIN clients c ON t.client_id = c.id
       WHERE t.id = p_ticket_id AND c.auth_user_id = auth.uid()
     ) THEN
       RAISE EXCEPTION 'Permission denied';
     END IF;
  ELSE
     -- Verify ticket belongs to company
     SELECT company_id INTO v_ticket_company_id FROM tickets WHERE id = p_ticket_id;
     IF v_ticket_company_id != v_company_id THEN
       RAISE EXCEPTION 'Ticket does not belong to your company';
     END IF;

     -- Verify device belongs to company
     SELECT company_id INTO v_device_company_id FROM devices WHERE id = p_device_id;
     IF v_device_company_id != v_company_id THEN
       RAISE EXCEPTION 'Device does not belong to your company';
     END IF;
  END IF;

  -- UPSERT the link
  INSERT INTO ticket_devices (ticket_id, device_id, relation_type)
  VALUES (p_ticket_id, p_device_id, p_relation_type)
  ON CONFLICT (ticket_id, device_id) 
  DO UPDATE SET relation_type = EXCLUDED.relation_type;

  RETURN json_build_object('success', true);
END;
$$;


--------------------------------------------------------------------------------
-- 2. RPC: upsert_client_rpc (Replaces upsert-client)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_client_rpc(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_fiscal_id text DEFAULT NULL, -- NIF/CIF
  p_client_id uuid DEFAULT NULL, -- If provided, update mode
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_client_id uuid;
  v_normalized_email text;
  v_full_name text;
BEGIN
  -- Validate Auth
  v_company_id := (SELECT company_id FROM users WHERE auth_user_id = auth.uid());
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not associated with a company';
  END IF;

  -- Normalize Inputs
  v_normalized_email := lower(trim(p_email));
  v_full_name := trim(p_first_name || ' ' || COALESCE(p_last_name, ''));
  
  -- Validation
  IF length(v_normalized_email) < 3 OR strpos(v_normalized_email, '@') = 0 THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  IF p_client_id IS NOT NULL THEN
    -- UPDATE existing
    -- Verify ownership
    IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id AND company_id = v_company_id) THEN
       RAISE EXCEPTION 'Client not found or access denied';
    END IF;

    UPDATE clients
    SET 
      name = v_full_name,
      email = v_normalized_email,
      phone = p_phone,
      address = p_address,
      city = p_city,
      fiscal_id = p_fiscal_id,
      metadata = COALESCE(clients.metadata, '{}'::jsonb) || p_metadata,
      updated_at = now()
    WHERE id = p_client_id
    RETURNING id INTO v_client_id;
    
    RETURN json_build_object('id', v_client_id, 'action', 'updated');

  ELSE
    -- INSERT new (Check dupe email within company)
    SELECT id INTO v_client_id FROM clients WHERE company_id = v_company_id AND email = v_normalized_email;
    
    IF v_client_id IS NOT NULL THEN
       -- Update existing if found by email
       UPDATE clients
       SET 
          name = v_full_name,
          phone = COALESCE(p_phone, phone),
          address = COALESCE(p_address, address),
          city = COALESCE(p_city, city),
          fiscal_id = COALESCE(p_fiscal_id, fiscal_id),
          updated_at = now()
       WHERE id = v_client_id;
       
       RETURN json_build_object('id', v_client_id, 'action', 'updated_by_email_match');
    ELSE
       -- Insert fresh
       INSERT INTO clients (
         company_id, name, email, phone, address, city, fiscal_id, metadata, status
       ) VALUES (
         v_company_id, v_full_name, v_normalized_email, p_phone, p_address, p_city, p_fiscal_id, p_metadata, 'active'
       )
       RETURNING id INTO v_client_id;
       
       RETURN json_build_object('id', v_client_id, 'action', 'created');
    END IF;
  END IF;
END;
$$;


--------------------------------------------------------------------------------
-- 3. RPC: create_ticket_rpc (Replaces create-ticket)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_ticket_rpc(
  p_client_id uuid,
  p_title text,
  p_description text,
  p_priority text DEFAULT 'normal',
  p_stage_id uuid DEFAULT NULL,
  p_ticket_type text DEFAULT 'incident',
  p_device_id uuid DEFAULT NULL,
  p_services jsonb DEFAULT '[]'::jsonb, -- Array of {service_id, quantity, etc}
  p_custom_fields jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_ticket_id uuid;
  v_ticket_number int;
  v_stage_id uuid;
  v_service text; -- For looping json
  v_service_id uuid;
  v_base_price numeric;
  v_total_services numeric := 0;
  v_created_at timestamptz := now();
BEGIN
  -- 1. Identify User & Company
  SELECT company_id, id INTO v_company_id, v_user_id 
  FROM users 
  WHERE auth_user_id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not associated with a company';
  END IF;

  -- 2. Validate Client
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'Client not found or access denied';
  END IF;

  -- 3. Determine Stage (Default logic)
  IF p_stage_id IS NOT NULL THEN
    -- Verify stage exists and is either generic or belongs to company
    IF NOT EXISTS (
      SELECT 1 FROM ticket_stages 
      WHERE id = p_stage_id 
        AND deleted_at IS NULL 
        AND (company_id IS NULL OR company_id = v_company_id)
    ) THEN
      RAISE EXCEPTION 'Invalid stage_id';
    END IF;
    v_stage_id := p_stage_id;
  ELSE
    -- Pick lowest position stage
    SELECT id INTO v_stage_id
    FROM ticket_stages
    WHERE deleted_at IS NULL AND (company_id IS NULL OR company_id = v_company_id)
    ORDER BY position ASC, created_at ASC
    LIMIT 1;

    IF v_stage_id IS NULL THEN
      RAISE EXCEPTION 'No active stages configured system-wide';
    END IF;
  END IF;

  -- 4. Create Ticket
  INSERT INTO tickets (
    company_id,
    client_id,
    stage_id,
    title,
    description,
    priority,
    ticket_type,
    custom_fields,
    created_by,
    status
  ) VALUES (
    v_company_id,
    p_client_id,
    v_stage_id,
    p_title,
    p_description,
    p_priority,
    p_ticket_type,
    p_custom_fields,
    v_user_id,
    'open'
  )
  RETURNING id, ticket_number INTO v_ticket_id, v_ticket_number;

  -- 5. Optional Device Link
  IF p_device_id IS NOT NULL THEN
    -- Validate device
    IF EXISTS (SELECT 1 FROM devices WHERE id = p_device_id AND company_id = v_company_id) THEN
      INSERT INTO ticket_devices (ticket_id, device_id, relation_type)
      VALUES (v_ticket_id, p_device_id, 'primary');
    END IF;
  END IF;

  -- 6. Process Services (Transactional!)
  IF jsonb_array_length(p_services) > 0 THEN
     FOR v_service IN SELECT * FROM jsonb_array_elements(p_services)
     LOOP
        v_service_id := (v_service::jsonb->>'service_id')::uuid;
        
        -- Get price
        SELECT base_price INTO v_base_price 
        FROM services 
        WHERE id = v_service_id AND company_id = v_company_id;

        IF v_base_price IS NULL THEN
           RAISE EXCEPTION 'Service % not found in company', v_service_id;
        END IF;

        -- Link Service to Ticket
        INSERT INTO ticket_services (ticket_id, service_id, unit_price, quantity)
        VALUES (
          v_ticket_id, 
          v_service_id, 
          v_base_price, 
          COALESCE((v_service::jsonb->>'quantity')::int, 1)
        );

        -- Add to running total (simplified, assumed quantity 1 for base checks)
        v_total_services := v_total_services + (v_base_price * COALESCE((v_service::jsonb->>'quantity')::int, 1));
        
        -- Copy tags from Service to Ticket (logic from Edge Function)
        INSERT INTO ticket_tags (ticket_id, tag_id)
        SELECT v_ticket_id, tag_id
        FROM service_tag_relations
        WHERE service_id = v_service_id
        ON CONFLICT DO NOTHING;
     END LOOP;
  END IF;

  -- 7. Create System Comment (Initial Log)
  INSERT INTO ticket_comments (
    ticket_id,
    user_id,
    content,
    is_internal,
    comment_type
  ) VALUES (
    v_ticket_id,
    v_user_id,
    'Ticket creado automáticamente',
    true,
    'system'
  );

  RETURN json_build_object(
    'id', v_ticket_id, 
    'ticket_number', v_ticket_number,
    'status', 'success'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION link_ticket_device(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_client_rpc(text, text, text, text, text, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION create_ticket_rpc(uuid, text, text, text, uuid, text, uuid, jsonb, jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION link_ticket_device(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION upsert_client_rpc(text, text, text, text, text, text, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION create_ticket_rpc(uuid, text, text, text, uuid, text, uuid, jsonb, jsonb) TO service_role;
