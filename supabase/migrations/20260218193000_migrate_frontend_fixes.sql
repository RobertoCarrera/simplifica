-- Migration: Frontend Fixes & Missing RPCs
-- 1. update_service_variant_rpc (Partner to create_service_variant_rpc)

CREATE OR REPLACE FUNCTION update_service_variant_rpc(
  p_variant_id uuid,
  p_variant_name text DEFAULT NULL,
  p_pricing jsonb DEFAULT NULL,
  p_features jsonb DEFAULT NULL,
  p_display_config jsonb DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_sort_order int DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_company_id uuid;
BEGIN
  -- Validate Auth
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get Service and Company ID to verify permissions
  SELECT s.company_id
  INTO v_company_id
  FROM service_variants sv
  JOIN services s ON s.id = sv.service_id
  WHERE sv.id = p_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant not found';
  END IF;

  SELECT company_id INTO v_user_company_id FROM users WHERE auth_user_id = auth.uid();
  
  IF v_user_company_id IS NULL OR v_user_company_id != v_company_id THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Update
  UPDATE service_variants
  SET
    variant_name = COALESCE(p_variant_name, variant_name),
    pricing = COALESCE(p_pricing, pricing),
    features = COALESCE(p_features, features),
    display_config = COALESCE(p_display_config, display_config),
    is_active = COALESCE(p_is_active, is_active),
    sort_order = COALESCE(p_sort_order, sort_order),
    updated_at = now()
  WHERE id = p_variant_id;

  RETURN json_build_object('success', true, 'id', p_variant_id);
END;
$$;

GRANT EXECUTE ON FUNCTION update_service_variant_rpc TO authenticated;
GRANT EXECUTE ON FUNCTION update_service_variant_rpc TO service_role;
