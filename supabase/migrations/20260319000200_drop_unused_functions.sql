-- ============================================================
-- CLEANUP: Drop SQL functions never called from frontend
-- Date: 2026-03-19
-- These functions have zero .rpc() references in the Angular app
-- and are NOT used as triggers, RLS helpers, or internal callees.
-- ============================================================

-- Debug/test functions
DROP FUNCTION IF EXISTS public.invite_user_to_company_debug(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.debug_client_modules(uuid);

-- Duplicate/replaced auth functions
DROP FUNCTION IF EXISTS public.accept_company_invitation_admin(uuid);
DROP FUNCTION IF EXISTS public.admin_list_owners();
DROP FUNCTION IF EXISTS public.is_super_admin_by_id(uuid);

-- Replaced configuration functions (edge functions replaced these)
DROP FUNCTION IF EXISTS public.get_company_config_stages(uuid);
DROP FUNCTION IF EXISTS public.get_company_config_units(uuid);

-- Unused client/portal RPCs
DROP FUNCTION IF EXISTS public.get_client_invoices_rpc(uuid);
DROP FUNCTION IF EXISTS public.get_client_quotes_rpc(uuid);
DROP FUNCTION IF EXISTS public.upsert_client_rpc(jsonb);

-- Unused device/ticket management RPCs
DROP FUNCTION IF EXISTS public.delete_stage_safe_rpc(uuid);
DROP FUNCTION IF EXISTS public.link_ticket_device(uuid, uuid);
DROP FUNCTION IF EXISTS public.list_company_devices_rpc(uuid);
DROP FUNCTION IF EXISTS public.reorder_stages(jsonb);

-- Unused schedule function
DROP FUNCTION IF EXISTS public.get_company_schedule(uuid);

-- Address/locality RPCs (replaced by edge functions)
DROP FUNCTION IF EXISTS public.create_address_rpc(jsonb);
DROP FUNCTION IF EXISTS public.create_locality_rpc(jsonb);

-- Unused helper
DROP FUNCTION IF EXISTS public.get_my_company_ids();
