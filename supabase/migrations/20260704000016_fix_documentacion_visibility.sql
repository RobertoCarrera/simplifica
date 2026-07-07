-- Fix documentacion sidebar visibility flags.
--
-- Documentación was registered with visibleToClients=false and
-- visibleToTeam=false, so the sidebar filter (which only allows
-- an item to pass if visibleToTeam=true for non-super-admins) hid
-- it from every team member even when the plan included it.
--
-- The fix: flip visibleToClients, visibleToTeam, is_dev_mode so the
-- module is reachable by teams and clients when their plan grants it.
UPDATE public.sidebar_navigation_order
SET visible_to_clients = true,
    visible_to_team    = true,
    is_dev_mode        = false,
    updated_at         = now()
WHERE module_key = 'documentacion';
