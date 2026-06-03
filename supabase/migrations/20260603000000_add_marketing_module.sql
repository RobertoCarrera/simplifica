-- Migration: Add Marketing module to catalog and sidebar navigation order
-- Marketing module is superadmin-only (is_dev_mode = true in sidebar_navigation_order)

-- Add marketing module to the catalog
INSERT INTO public.modules_catalog (key, label)
VALUES ('marketing', 'Marketing')
ON CONFLICT (key) DO NOTHING;

-- Set sidebar navigation: devMode=true means only superadmins can see it
INSERT INTO public.sidebar_navigation_order (module_key, order_index, is_visible, is_dev_mode, updated_at)
VALUES ('marketing', 50, true, true, now())
ON CONFLICT (module_key)
DO UPDATE SET is_dev_mode = true, is_visible = true, order_index = 50, updated_at = now();
