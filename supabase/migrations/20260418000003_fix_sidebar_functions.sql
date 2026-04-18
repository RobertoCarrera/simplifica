-- ============================================
-- Fix: re-apply sidebar navigation order functions
-- The previous migration failed because policies already existed,
-- which rolled back the function creation too.
-- These are idempotent (CREATE OR REPLACE).
-- ============================================

-- RPC: get_sidebar_navigation_order
-- Returns all sidebar order entries (public read)
CREATE OR REPLACE FUNCTION public.get_sidebar_navigation_order()
RETURNS TABLE(module_key TEXT, order_index INTEGER, is_visible BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT sno.module_key, sno.order_index, sno.is_visible
  FROM public.sidebar_navigation_order sno
  ORDER BY sno.order_index ASC;
END;
$$;

-- RPC: admin_update_sidebar_navigation_order
-- Upserts sidebar order entries (super_admin only)
-- Expects: p_entries JSONB [{module_key, order_index, is_visible}]
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
BEGIN
  -- Verify super_admin
  IF NOT EXISTS (
    SELECT 1 FROM auth.users AS u
    WHERE u.id = auth.uid()
      AND u.raw_user_meta_data->>'is_super_admin' = 'true'
  ) THEN
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_sidebar_navigation_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_sidebar_navigation_order TO authenticated;
