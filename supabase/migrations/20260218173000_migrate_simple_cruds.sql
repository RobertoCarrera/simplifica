-- Migration: Migrate Simple CRUD Edge Functions to RPC
-- Replaces: create-address, create-device, create-locality, create-service-variant
-- Priority: High (Standardization)

--------------------------------------------------------------------------------
-- 1. RPC: create_address_rpc (Replaces create-address)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_address_rpc(
  p_direccion text,
  p_locality_id uuid,
  p_numero text DEFAULT NULL,
  p_piso text DEFAULT NULL,
  p_puerta text DEFAULT NULL,
  p_bloque text DEFAULT NULL,
  p_escalera text DEFAULT NULL,
  p_cod_postal text DEFAULT NULL,
  p_provincia text DEFAULT NULL,
  p_pais text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_address_id uuid;
BEGIN
  -- Validate Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Insert
  INSERT INTO addresses (
    usuario_id, 
    direccion, 
    locality_id, 
    numero, 
    piso, 
    puerta, 
    bloque, 
    escalera, 
    cod_postal, 
    provincia, 
    pais
  ) VALUES (
    v_user_id,
    p_direccion,
    p_locality_id,
    p_numero,
    p_piso,
    p_puerta,
    p_bloque,
    p_escalera,
    p_cod_postal,
    p_provincia,
    p_pais
  )
  RETURNING id INTO v_address_id;

  RETURN json_build_object('id', v_address_id);
END;
$$;


--------------------------------------------------------------------------------
-- 2. RPC: create_device_rpc (Replaces create-device)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_device_rpc(
  p_company_id uuid,
  p_client_id uuid,
  p_brand text,
  p_model text,
  p_device_type text,
  p_reported_issue text,
  p_serial_number text DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_imei text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_company_id uuid;
  v_device_id uuid;
BEGIN
  -- Validate Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate permissions (User must belong to company)
  SELECT company_id INTO v_user_company_id FROM users WHERE auth_user_id = v_user_id;
  
  -- If not staff, check if user IS the client (portal access)
  IF v_user_company_id IS NULL OR v_user_company_id != p_company_id THEN
     IF NOT EXISTS (SELECT 1 FROM clients WHERE auth_user_id = v_user_id AND id = p_client_id AND company_id = p_company_id) THEN
        RAISE EXCEPTION 'Permission denied for this company/client';
     END IF;
  END IF;

  -- Insert
  INSERT INTO devices (
    company_id,
    client_id,
    brand,
    model,
    device_type,
    reported_issue,
    serial_number,
    password,
    imei,
    status
  ) VALUES (
    p_company_id,
    p_client_id,
    p_brand,
    p_model,
    p_device_type,
    p_reported_issue,
    p_serial_number,
    p_password,
    p_imei,
    'received' -- Default status
  )
  RETURNING id INTO v_device_id;

  RETURN json_build_object('id', v_device_id);
END;
$$;


--------------------------------------------------------------------------------
-- 3. RPC: create_locality_rpc (Replaces create-locality)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_locality_rpc(
  p_name text,
  p_postal_code text,
  p_province text DEFAULT NULL,
  p_country text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locality_id uuid;
  v_normalized_cp text;
BEGIN
  -- Validate Auth
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Normalize Postal Code (digits only)
  v_normalized_cp := regexp_replace(p_postal_code, '\D', '', 'g');

  IF length(v_normalized_cp) = 0 THEN
      RAISE EXCEPTION 'Invalid postal code';
  END IF;

  -- Insert or Return Existing
  -- Assuming 'localities' table constraint on (postal_code, name) or similar unique key
  -- If not unique, we just insert. The edge function implied a potential "get" logic.
  
  SELECT id INTO v_locality_id 
  FROM localities 
  WHERE lower(name) = lower(p_name) AND postal_code = v_normalized_cp
  LIMIT 1;

  IF v_locality_id IS NOT NULL THEN
     RETURN json_build_object('id', v_locality_id, 'is_new', false);
  END IF;

  INSERT INTO localities (
    name,
    postal_code,
    province,
    country
  ) VALUES (
    p_name,
    v_normalized_cp,
    p_province,
    p_country
  )
  RETURNING id INTO v_locality_id;
  
  RETURN json_build_object('id', v_locality_id, 'is_new', true);
END;
$$;


--------------------------------------------------------------------------------
-- 4. RPC: create_service_variant_rpc (Replaces create-service-variant)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_service_variant_rpc(
  p_service_id uuid,
  p_variant_name text,
  p_pricing jsonb,
  p_features jsonb DEFAULT NULL,
  p_display_config jsonb DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_sort_order int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant_id uuid;
  v_company_id uuid;
  v_user_company_id uuid;
BEGIN
  -- Validate Auth
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get Service Company
  SELECT company_id INTO v_company_id FROM services WHERE id = p_service_id;
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Service not found';
  END IF;

  -- Validate Permissions
  SELECT company_id INTO v_user_company_id FROM users WHERE auth_user_id = auth.uid();
  
  IF v_user_company_id IS NULL OR v_user_company_id != v_company_id THEN
    -- Check for superadmin or other roles if needed, but for now strict company match
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Insert
  INSERT INTO service_variants (
    service_id,
    variant_name,
    pricing,
    features,
    display_config,
    is_active,
    sort_order
  ) VALUES (
    p_service_id,
    p_variant_name,
    p_pricing,
    COALESCE(p_features, '{}'::jsonb),
    COALESCE(p_display_config, '{}'::jsonb),
    p_is_active,
    p_sort_order
  )
  RETURNING id INTO v_variant_id;

  RETURN json_build_object('id', v_variant_id);
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION create_address_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION create_device_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION create_locality_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION create_service_variant_rpc TO authenticated;

GRANT EXECUTE ON FUNCTION create_address_rpc TO service_role;
GRANT EXECUTE ON FUNCTION create_device_rpc TO service_role;
GRANT EXECUTE ON FUNCTION create_locality_rpc TO service_role;
GRANT EXECUTE ON FUNCTION create_service_variant_rpc TO service_role;
