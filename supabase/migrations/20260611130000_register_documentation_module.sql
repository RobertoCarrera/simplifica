-- ============================================
-- Migration: register 'Documentación' module
-- Adds the docs system as a manageable module in the catalog,
-- the sidebar navigation order, and (as opt-in) in the Business plan.
-- ============================================

-- 1) Catalog: 'documentacion' como módulo facturable / gestionable.
INSERT INTO public.modules_catalog (key, label)
VALUES ('documentacion', 'Documentación')
ON CONFLICT (key) DO NOTHING;

-- 2) Sidebar: aparece al final, visible para el equipo pero NO para clientes
--    (la documentación interna es solo para usuarios de la empresa).
INSERT INTO public.sidebar_navigation_order
  (module_key, order_index, is_visible, is_dev_mode, visible_to_clients, visible_to_team, updated_at)
VALUES
  ('documentacion', 99, true, false, false, true, now())
ON CONFLICT (module_key) DO UPDATE SET
  is_visible        = EXCLUDED.is_visible,
  is_dev_mode       = EXCLUDED.is_dev_mode,
  visible_to_clients= EXCLUDED.visible_to_clients,
  visible_to_team   = EXCLUDED.visible_to_team,
  order_index       = EXCLUDED.order_index,
  updated_at        = now();

-- 3) Plan Business: incluir 'documentacion' por defecto.
UPDATE public.plans
   SET included_modules = (
         SELECT array_agg(DISTINCT e)
         FROM unnest(included_modules || ARRAY['documentacion']) AS e
       ),
       updated_at = now()
 WHERE id = 'business'
   AND NOT ('documentacion' = ANY(included_modules));
