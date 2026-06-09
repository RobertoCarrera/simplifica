-- ============================================
-- Add role-based visibility flags to sidebar_navigation_order
-- visible_to_clients: controla si el módulo se muestra a clientes
-- visible_to_team: controla si el módulo se muestra al equipo (professionals, marketers, admins)
-- Ambos por defecto true para mantener compatibilidad con el comportamiento actual
-- ============================================

ALTER TABLE public.sidebar_navigation_order
  ADD COLUMN IF NOT EXISTS visible_to_clients BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.sidebar_navigation_order
  ADD COLUMN IF NOT EXISTS visible_to_team BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.sidebar_navigation_order.visible_to_clients IS 'Si el módulo es visible en el sidebar para usuarios con rol client';
COMMENT ON COLUMN public.sidebar_navigation_order.visible_to_team IS 'Si el módulo es visible en el sidebar para el equipo (professional, marketer, admin, owner, super_admin)';

-- ============================================
-- Actualizar get_sidebar_navigation_order para devolver los nuevos flags
-- Hay que dropear primero porque cambia el return type
-- ============================================
DROP FUNCTION IF EXISTS public.get_sidebar_navigation_order();
CREATE OR REPLACE FUNCTION public.get_sidebar_navigation_order()
RETURNS TABLE(
  module_key TEXT,
  order_index INTEGER,
  is_visible BOOLEAN,
  is_dev_mode BOOLEAN,
  visible_to_clients BOOLEAN,
  visible_to_team BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sno.module_key,
    sno.order_index,
    sno.is_visible,
    sno.is_dev_mode,
    sno.visible_to_clients,
    sno.visible_to_team
  FROM public.sidebar_navigation_order sno
  ORDER BY sno.order_index ASC;
END;
$$;

-- ============================================
-- Actualizar admin_update_sidebar_navigation_order para aceptar los nuevos flags
-- Espera: p_entries JSONB [{module_key, order_index, is_visible, is_dev_mode, visible_to_clients, visible_to_team}]
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
  v_visible_to_clients BOOLEAN;
  v_visible_to_team BOOLEAN;
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
    v_module_key         := entry->>'module_key';
    v_order_index        := (entry->>'order_index')::INTEGER;
    v_is_visible         := (entry->>'is_visible')::BOOLEAN;
    v_is_dev_mode        := COALESCE((entry->>'is_dev_mode')::BOOLEAN, false);
    v_visible_to_clients := COALESCE((entry->>'visible_to_clients')::BOOLEAN, true);
    v_visible_to_team    := COALESCE((entry->>'visible_to_team')::BOOLEAN, true);

    INSERT INTO public.sidebar_navigation_order
      (module_key, order_index, is_visible, is_dev_mode, visible_to_clients, visible_to_team, updated_at)
    VALUES
      (v_module_key, v_order_index, v_is_visible, v_is_dev_mode, v_visible_to_clients, v_visible_to_team, now())
    ON CONFLICT (module_key)
    DO UPDATE SET
      order_index        = EXCLUDED.order_index,
      is_visible         = EXCLUDED.is_visible,
      is_dev_mode        = EXCLUDED.is_dev_mode,
      visible_to_clients = EXCLUDED.visible_to_clients,
      visible_to_team    = EXCLUDED.visible_to_team,
      updated_at         = now();
  END LOOP;

  RETURN true;
END;
$$;

-- ============================================
-- Migración reversible: down migration
-- ============================================
-- Para revertir:
--   ALTER TABLE public.sidebar_navigation_order DROP COLUMN IF EXISTS visible_to_clients;
--   ALTER TABLE public.sidebar_navigation_order DROP COLUMN IF EXISTS visible_to_team;
--   DROP FUNCTION IF EXISTS public.get_sidebar_navigation_order();
--   -- Recrear get_sidebar_navigation_order() sin los nuevos campos (ver migración 20260418000005)
--   DROP FUNCTION IF EXISTS public.admin_update_sidebar_navigation_order(JSONB);
--   -- Recrear admin_update_sidebar_navigation_order(JSONB) sin los nuevos campos

-- Grants unchanged
GRANT EXECUTE ON FUNCTION public.get_sidebar_navigation_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_sidebar_navigation_order TO authenticated;
