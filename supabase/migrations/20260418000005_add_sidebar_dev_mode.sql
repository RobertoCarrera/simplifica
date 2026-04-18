-- ============================================
-- Add is_dev_mode column to sidebar_navigation_order
-- Items in dev mode are only visible to superadmins.
-- ============================================

ALTER TABLE public.sidebar_navigation_order
  ADD COLUMN IF NOT EXISTS is_dev_mode BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- Update get_sidebar_navigation_order to return is_dev_mode
-- Must DROP first because return type changes (PostgreSQL restriction)
-- ============================================
DROP FUNCTION IF EXISTS public.get_sidebar_navigation_order();
CREATE OR REPLACE FUNCTION public.get_sidebar_navigation_order()
RETURNS TABLE(module_key TEXT, order_index INTEGER, is_visible BOOLEAN, is_dev_mode BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT sno.module_key, sno.order_index, sno.is_visible, sno.is_dev_mode
  FROM public.sidebar_navigation_order sno
  ORDER BY sno.order_index ASC;
END;
$$;

-- ============================================
-- Update admin_update_sidebar_navigation_order to handle is_dev_mode
-- Expects: p_entries JSONB [{module_key, order_index, is_visible, is_dev_mode}]
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
  v_is_dev_mode BOOLEAN;
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
    v_module_key  := entry->>'module_key';
    v_order_index := (entry->>'order_index')::INTEGER;
    v_is_visible  := (entry->>'is_visible')::BOOLEAN;
    v_is_dev_mode := COALESCE((entry->>'is_dev_mode')::BOOLEAN, false);

    INSERT INTO public.sidebar_navigation_order (module_key, order_index, is_visible, is_dev_mode, updated_at)
    VALUES (v_module_key, v_order_index, v_is_visible, v_is_dev_mode, now())
    ON CONFLICT (module_key)
    DO UPDATE SET
      order_index  = EXCLUDED.order_index,
      is_visible   = EXCLUDED.is_visible,
      is_dev_mode  = EXCLUDED.is_dev_mode,
      updated_at   = now();
  END LOOP;

  RETURN true;
END;
$$;

-- Grants unchanged
GRANT EXECUTE ON FUNCTION public.get_sidebar_navigation_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_sidebar_navigation_order TO authenticated;
