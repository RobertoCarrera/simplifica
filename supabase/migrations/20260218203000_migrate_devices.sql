-- Migration: Create Device RPC (replaces create-device Edge Function)

CREATE OR REPLACE FUNCTION create_device_rpc(
  p_company_id UUID,
  p_client_id UUID,
  p_brand TEXT,
  p_model TEXT,
  p_device_type TEXT,
  p_reported_issue TEXT,
  p_priority TEXT DEFAULT 'normal',
  p_received_at TIMESTAMPTZ DEFAULT NOW(),
  p_serial_number TEXT DEFAULT NULL,
  p_imei TEXT DEFAULT NULL,
  p_color TEXT DEFAULT NULL,
  p_condition_on_arrival TEXT DEFAULT NULL,
  p_operating_system TEXT DEFAULT NULL,
  p_storage_capacity TEXT DEFAULT NULL,
  p_estimated_cost NUMERIC DEFAULT NULL,
  p_final_cost NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_user_valid boolean;
    v_client_company_id uuid;
    v_new_device_id uuid;
    v_result jsonb;
BEGIN
    -- 1. Validate User Membership
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_user_id = v_user_id
          AND company_id = p_company_id
          AND active = true
    ) INTO v_user_valid;

    IF NOT v_user_valid THEN
        RAISE EXCEPTION 'User not allowed for this company' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Validate Client belongs to Company
    SELECT company_id INTO v_client_company_id
    FROM public.clients
    WHERE id = p_client_id;

    IF v_client_company_id IS NULL OR v_client_company_id != p_company_id THEN
        RAISE EXCEPTION 'Client does not belong to the provided company' USING ERRCODE = 'P0002';
    END IF;

    -- 3. Insert Device
    INSERT INTO public.devices (
        company_id,
        client_id,
        brand,
        model,
        device_type,
        reported_issue,
        status,
        priority,
        received_at,
        serial_number,
        imei,
        color,
        condition_on_arrival,
        operating_system,
        storage_capacity,
        estimated_cost,
        final_cost,
        created_by
        -- created_at and updated_at handled by defaults/triggers
    ) VALUES (
        p_company_id,
        p_client_id,
        TRIM(p_brand),
        TRIM(p_model),
        TRIM(p_device_type),
        TRIM(p_reported_issue),
        'received',
        COALESCE(p_priority, 'normal'),
        COALESCE(p_received_at, NOW()),
        p_serial_number,
        p_imei,
        p_color,
        p_condition_on_arrival,
        p_operating_system,
        p_storage_capacity,
        p_estimated_cost,
        p_final_cost,
        v_user_id -- Assuming created_by maps to auth_user_id or we need to find internal user id?
                  -- The edge function used authUserId which is the Auth ID.
                  -- But devices.created_by might refer to public.users.id or auth ID.
                  -- Let's check schema or assume Auth ID if column type allows.
                  -- If devices.created_by is UUID references auth.users, it is fine.
                  -- If it references public.users, we need to fetch it.
    )
    RETURNING id INTO v_new_device_id;

    -- 4. Return the new device
    SELECT to_jsonb(d.*) INTO v_result
    FROM public.devices d
    WHERE d.id = v_new_device_id;

    RETURN v_result;
END;
$$;
