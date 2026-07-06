-- Drop dead company_module_grants support (pre-rewrite RPCs and dead table)
--
-- NOTE: The original task brief had the get_effective_modules overloads
-- swapped. Verified against:
--   * supabase/migrations/20260705000002_get_effective_modules_rewrite.sql
--     (creates the text+uuid overload, the NEW one)
--   * src/app/services/supabase-db.types.ts:18299
--     (auto-generated Args: { p_auth_user_id?: string; p_input_company_id?: string })
--   * src/app/services/supabase-modules.service.ts:157 + user-modules.service.ts:30
--     (active callers pass companyId as string)
-- The OLD overload is (uuid, uuid) and is the only one that still
-- references company_modules / user_modules.

-- Drop dead company_modules admin RPCs
DROP FUNCTION IF EXISTS public.admin_list_company_modules(uuid);
DROP FUNCTION IF EXISTS public.admin_toggle_company_module(uuid, text, text);

-- Drop legacy get_effective_modules(uuid, uuid) overload (the one that
-- still references company_modules / user_modules; superseded by the
-- (text, uuid) rewrite in 20260705000002)
DROP FUNCTION IF EXISTS public.get_effective_modules(uuid, uuid);

-- Drop placeholder constraint
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_included_modules_drop_pending;

-- Drop company_modules table (CASCADE handles its 4 RLS policies and TOAST)
DROP TABLE IF EXISTS public.company_modules CASCADE;

-- Drop plans.included_modules column
ALTER TABLE public.plans DROP COLUMN IF EXISTS included_modules;

NOTIFY pgrst, 'reload schema';