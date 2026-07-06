-- ============================================
-- Migration: admin_upsert_plan — drop deprecated p_included_modules,
-- route plan → module membership through plan_module_access.
-- Phase: plan-driven module access (post-20260705000001)
-- ============================================
--
-- Before this migration:
--   admin_upsert_plan(p_id, p_name, ..., p_included_modules text[], ...)
--   wrote p_included_modules into the deprecated plans.included_modules text[]
--   column. Per-module toggles were routed through this RPC by rebuilding the
--   array to include or exclude the target key — a "save the whole plan every
--   toggle" path that became racy the moment the sidebar started reading from
--   a different table (company_module_grants, via plan_module_access UNION).
--
-- After this migration:
--   admin_upsert_plan(p_id, p_name, ..., p_module_keys text[] DEFAULT NULL)
--     - Writes plan metadata to public.plans WITHOUT touching the deprecated
--       plans.included_modules column. Existing values there are frozen at
--       their current snapshot (which matches plan_module_access at the time
--       of migration 20260705000001 ran).
--     - When p_module_keys IS NOT NULL: replaces all rows in plan_module_access
--       WHERE plan_id = p_id with the provided set.
--       Passing an empty array clears the plan's module access.
--     - When p_module_keys IS NULL (default): leaves plan_module_access
--       untouched. This is the common case from /admin/modulos when the user
--       only edits price, name, tagline, included_users, etc.
--
-- Per-module toggles (commit d392a07d + commit 6551c57d) already use
-- admin_set_plan_module_access(plan_id, module_key, included) directly, which
-- validates the module_key against public.modules_catalog via FK. This RPC is
-- no longer the canonical way to change a plan's module list; it is a
-- convenience upsert for callers who want to set the whole membership in one
-- call (e.g. an "Import plan from JSON" admin tool).
--
-- Guards kept (from migration 20260630000004):
--   - SQLSTATE 42501 when the caller is not super_admin.
--   - is_highlighted mutex (ADR-06): when p_is_highlighted = true, atomically
--     clear is_highlighted on every sibling plan in the same transaction.
--
-- Guards REMOVED:
--   - The 22023 "non-canonical module key" guard. That guard existed to police
--     legacy route-string keys (e.g. 'clientes' instead of 'core_/clientes')
--     sneaking into the deprecated text[] array. module_key is now a FK to
--     public.modules_catalog.key — invalid keys fail at the database layer, no
--     custom guard needed.

BEGIN;

DROP FUNCTION IF EXISTS public.admin_upsert_plan CASCADE;

CREATE OR REPLACE FUNCTION public.admin_upsert_plan(
  p_id                  text,
  p_name                text,
  p_tagline             text,
  p_description         text,
  p_base_price_eur_cents integer,
  p_currency            text,
  p_included_users      integer,
  p_extra_user_cents    integer,
  p_sort_order          integer,
  p_is_active           boolean,
  p_is_highlighted      boolean,
  p_module_keys         text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_name text;
BEGIN
  -- (1) super_admin guard — SQLSTATE 42501 (client-translatable Spanish toast).
  SELECT r.name INTO v_role_name
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();
  IF v_role_name IS NULL OR v_role_name != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required'
      USING ERRCODE = '42501';
  END IF;

  -- (2) is_highlighted mutex (ADR-06). Atomically clear every other plan's
  -- flag BEFORE the UPSERT so any reader after the RPC returns never sees
  -- two plans highlighted at once. Uses the plans_touch_updated_at trigger to
  -- refresh updated_at on the affected siblings.
  IF p_is_highlighted = true THEN
    UPDATE public.plans
       SET is_highlighted = false
     WHERE id <> p_id AND is_highlighted = true;
  END IF;

  -- (3) Plan metadata upsert. The deprecated plans.included_modules column is
  -- intentionally NOT written here. Module membership is owned by
  -- plan_module_access; see step (4) and the per-toggle RPC
  -- admin_set_plan_module_access for the canonical write path.
  INSERT INTO public.plans (
    id, name, tagline, description, base_price_eur_cents, currency,
    included_users, extra_user_cents,
    sort_order, is_active, is_highlighted, updated_at
  ) VALUES (
    p_id, p_name, p_tagline, p_description, p_base_price_eur_cents, p_currency,
    p_included_users, p_extra_user_cents,
    p_sort_order, p_is_active, p_is_highlighted, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name                 = EXCLUDED.name,
    tagline              = EXCLUDED.tagline,
    description          = EXCLUDED.description,
    base_price_eur_cents = EXCLUDED.base_price_eur_cents,
    currency             = EXCLUDED.currency,
    included_users       = EXCLUDED.included_users,
    extra_user_cents     = EXCLUDED.extra_user_cents,
    sort_order           = EXCLUDED.sort_order,
    is_active            = EXCLUDED.is_active,
    is_highlighted       = EXCLUDED.is_highlighted,
    updated_at           = EXCLUDED.updated_at;

  -- (4) Optional plan_module_access replace. NULL (default) → preserve the
  -- plan's current module list. Non-NULL array → atomic replace: delete all
  -- existing rows for this plan, then bulk-insert the new set. The
  -- module_key FK enforces that every key in p_module_keys references a real
  -- public.modules_catalog.key (otherwise this INSERT raises a 23503).
  IF p_module_keys IS NOT NULL THEN
    DELETE FROM public.plan_module_access WHERE plan_id = p_id;
    IF array_length(p_module_keys, 1) > 0 THEN
      INSERT INTO public.plan_module_access (plan_id, module_key)
        SELECT p_id, k FROM unnest(p_module_keys) AS k
        ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Lightweight acknowledgement payload. Callers that want the full plan row
  -- can SELECT * FROM public.plans WHERE id = p_id themselves.
  RETURN jsonb_build_object('id', p_id, 'name', p_name, 'is_active', p_is_active);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_plan TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
