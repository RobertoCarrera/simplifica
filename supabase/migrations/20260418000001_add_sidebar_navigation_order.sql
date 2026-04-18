-- ============================================
-- Sidebar Navigation Order: allows super_admin
-- to set custom display order for sidebar items
-- ============================================

CREATE TABLE IF NOT EXISTS public.sidebar_navigation_order (
  id          BIGSERIAL PRIMARY KEY,
  module_key  TEXT NOT NULL UNIQUE,  -- matches sidebar moduleKey or 'core_<id>'
  order_index INTEGER NOT NULL DEFAULT 0,
  is_visible  BOOLEAN NOT NULL DEFAULT true,  -- allows hiding items too
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sidebar_navigation_order IS 'Custom sort order and visibility for sidebar navigation items (super_admin only)';

-- RLS: anyone can read, only super_admin can write
ALTER TABLE public.sidebar_navigation_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sidebar_navigation_order_select"
  ON public.sidebar_navigation_order
  FOR SELECT
  USING (true);

CREATE POLICY "sidebar_navigation_order_admin_insert"
  ON public.sidebar_navigation_order
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users AS u
      JOIN public.company_members AS cm ON cm.user_id = u.id
      WHERE u.id = auth.uid()
        AND cm.role = 'super_admin'
        AND cm.company_id = COALESCE(
          (SELECT company_id FROM auth.users WHERE id = auth.uid()),
          '00000000-0000-0000-0000-000000000000'::uuid
        )
    )
    OR
    -- Direct super_admin check via is_super_admin flag
    EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = auth.uid()
        AND u.raw_user_meta_data->>'is_super_admin' = 'true'
    )
  );

CREATE POLICY "sidebar_navigation_order_admin_update"
  ON public.sidebar_navigation_order
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = auth.uid()
        AND u.raw_user_meta_data->>'is_super_admin' = 'true'
    )
  );

CREATE POLICY "sidebar_navigation_order_admin_delete"
  ON public.sidebar_navigation_order
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users AS u
      WHERE u.id = auth.uid()
        AND u.raw_user_meta_data->>'is_super_admin' = 'true'
    )
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_sidebar_navigation_order_module_key
  ON public.sidebar_navigation_order (module_key);
CREATE INDEX IF NOT EXISTS idx_sidebar_navigation_order_order_index
  ON public.sidebar_navigation_order (order_index);

-- ============================================
-- RPC: get_sidebar_navigation_order
-- Returns all sidebar order entries (public read)
-- ============================================
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

-- ============================================
-- RPC: admin_update_sidebar_navigation_order
-- Upserts sidebar order entries (super_admin only)
-- Expects: p_entries JSONB [{module_key, order_index, is_visible}]
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
