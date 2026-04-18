-- ============================================
-- Fix: admin_update_sidebar_navigation_order was using
-- raw_user_meta_data->>'is_super_admin' which is never set.
-- The correct check (matching admin_list_companies) is via
-- public.users JOIN public.app_roles WHERE name = 'super_admin'.
-- ============================================

CREATE OR REPLACE FUNCTION public.admin_update_sidebar_navigation_order(
  p_entries JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  entry JSONB;
  v_module_key TEXT;
  v_order_index INTEGER;
  v_is_visible BOOLEAN;
  v_role_name TEXT;
BEGIN
  -- Verify super_admin via app_roles table (same as admin_list_companies)
  SELECT r.name
  INTO v_role_name
  FROM public.users u
  JOIN public.app_roles r ON u.app_role_id = r.id
  WHERE u.auth_user_id = auth.uid();

  IF v_role_name IS NULL OR v_role_name != 'super_admin' THEN
    RAISE EXCEPTION 'Permission denied: super_admin required';
  END IF;

  -- Upsert each entry
  FOR entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_module_key := entry->>'module_key';
    v_order_index := (entry->>'order_index')::INTEGER;
    v_is_visible := (entry->>'is_visible')::BOOLEAN;

    INSERT INTO public.sidebar_navigation_order (module_key, order_index, is_visible, updated_at)
    VALUES (v_module_key, v_order_index, v_is_visible, now())
    ON CONFLICT (module_key)
    DO UPDATE SET
      order_index = EXCLUDED.order_index,
      is_visible  = EXCLUDED.is_visible,
      updated_at  = now();
  END LOOP;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_sidebar_navigation_order TO authenticated;
