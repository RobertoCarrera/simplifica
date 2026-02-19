CREATE OR REPLACE FUNCTION create_ticket_rpc(
  p_client_id uuid,
  p_title text,
  p_description text,
  p_priority text DEFAULT 'normal',
  p_stage_id uuid DEFAULT NULL,
  p_ticket_type text DEFAULT 'incident',
  p_device_id uuid DEFAULT NULL,
  p_services jsonb DEFAULT '[]'::jsonb,
  p_custom_fields jsonb DEFAULT '{}'::jsonb,
  p_due_date timestamptz DEFAULT NULL,
  p_estimated_hours numeric DEFAULT 0,
  p_total_amount numeric DEFAULT 0,
  p_ticket_address text DEFAULT NULL,
  p_ticket_contact_name text DEFAULT NULL,
  p_ticket_contact_email text DEFAULT NULL,
  p_ticket_contact_phone text DEFAULT NULL
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
  v_service text;
  v_service_id uuid;
  v_base_price numeric;
  v_total_services numeric := 0;
  v_created_at timestamptz := now();
  v_final_custom_fields jsonb;
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
    SELECT id INTO v_stage_id
    FROM ticket_stages
    WHERE deleted_at IS NULL AND (company_id IS NULL OR company_id = v_company_id)
    ORDER BY position ASC, created_at ASC
    LIMIT 1;

    IF v_stage_id IS NULL THEN
      RAISE EXCEPTION 'No active stages configured system-wide';
    END IF;
  END IF;

  -- Merge contact fields into custom_fields
  v_final_custom_fields := p_custom_fields;
  IF p_ticket_address IS NOT NULL THEN
    v_final_custom_fields := v_final_custom_fields || jsonb_build_object('address', p_ticket_address);
  END IF;
  IF p_ticket_contact_name IS NOT NULL THEN
    v_final_custom_fields := v_final_custom_fields || jsonb_build_object('contact_name', p_ticket_contact_name);
  END IF;
  IF p_ticket_contact_email IS NOT NULL THEN
    v_final_custom_fields := v_final_custom_fields || jsonb_build_object('contact_email', p_ticket_contact_email);
  END IF;
  IF p_ticket_contact_phone IS NOT NULL THEN
    v_final_custom_fields := v_final_custom_fields || jsonb_build_object('contact_phone', p_ticket_contact_phone);
  END IF;

  -- 4. Create Ticket
  INSERT INTO tickets (
    company_id,
    client_id,
    stage_id,
    title,
    description,
    priority,
    custom_fields,
    created_by,
    status,
    due_date,
    estimated_hours,
    total_amount
  ) VALUES (
    v_company_id,
    p_client_id,
    v_stage_id,
    p_title,
    p_description,
    p_priority,
    v_final_custom_fields,
    v_user_id,
    'open',
    p_due_date,
    p_estimated_hours,
    p_total_amount
  )
  RETURNING id, ticket_number INTO v_ticket_id, v_ticket_number;

  -- 5. Optional Device Link
  IF p_device_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM devices WHERE id = p_device_id AND company_id = v_company_id) THEN
      INSERT INTO ticket_devices (ticket_id, device_id, relation_type)
      VALUES (v_ticket_id, p_device_id, 'primary');
    END IF;
  END IF;

  -- 6. Process Services
  IF jsonb_array_length(p_services) > 0 THEN
     FOR v_service IN SELECT * FROM jsonb_array_elements(p_services)
     LOOP
        v_service_id := (v_service::jsonb->>'service_id')::uuid;
        
        SELECT base_price INTO v_base_price 
        FROM services 
        WHERE id = v_service_id AND company_id = v_company_id;

        IF v_base_price IS NULL THEN
           RAISE EXCEPTION 'Service % not found in company', v_service_id;
        END IF;

        INSERT INTO ticket_services (ticket_id, service_id, unit_price, quantity)
        VALUES (
          v_ticket_id, 
          v_service_id, 
          v_base_price, 
          COALESCE((v_service::jsonb->>'quantity')::int, 1)
        );

        INSERT INTO ticket_tags (ticket_id, tag_id)
        SELECT v_ticket_id, tag_id
        FROM service_tag_relations
        WHERE service_id = v_service_id
        ON CONFLICT DO NOTHING;
     END LOOP;
  END IF;

  RETURN json_build_object(
    'id', v_ticket_id, 
    'ticket_number', v_ticket_number,
    'status', 'success'
  );
END;
$$;
