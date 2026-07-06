-- Admin RPCs for the plan-driven module access layer.
-- These give the /admin/modulos UI a clean surface to manage
-- plan_module_access, company_module_grants, and company_addon_grants
-- without exposing the underlying tables to the anon role.

-- ─── 1. Replace plans_module_access as a single source of truth ─────────
CREATE OR REPLACE FUNCTION public.admin_get_plan_module_access(p_plan_id text)
RETURNS TABLE(module_key text, included boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT r.name INTO v_role FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();
  IF v_role IS NULL OR v_role != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.key, COALESCE(pma.plan_id IS NOT NULL, false) AS included
    FROM public.modules_catalog m
    LEFT JOIN public.plan_module_access pma
      ON pma.module_key = m.key AND pma.plan_id = p_plan_id
   ORDER BY m.label;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_plan_module_access(
  p_plan_id   text,
  p_module_key text,
  p_included  boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT r.name INTO v_role FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();
  IF v_role IS NULL OR v_role != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required' USING ERRCODE = '42501';
  END IF;

  IF p_included THEN
    INSERT INTO public.plan_module_access (plan_id, module_key)
    VALUES (p_plan_id, p_module_key)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.plan_module_access
     WHERE plan_id = p_plan_id AND module_key = p_module_key;
  END IF;
END;
$function$;

-- ─── 2. Company-level grants (manual module grants + revocations) ─────────
CREATE OR REPLACE FUNCTION public.admin_get_company_module_grants(p_company_id uuid)
RETURNS TABLE(module_key text, status text, reason text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT r.name INTO v_role FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();
  IF v_role IS NULL OR v_role != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT g.module_key, g.status, g.reason, g.created_at
    FROM public.company_module_grants g
   WHERE g.company_id = p_company_id
   ORDER BY g.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_company_module_grant(
  p_company_id  uuid,
  p_module_key  text,
  p_status      text,
  p_reason      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_grantor uuid;
BEGIN
  SELECT r.name INTO v_role FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();
  IF v_role IS NULL OR v_role != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('active', 'revoked') THEN
    RAISE EXCEPTION 'invalid status: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_grantor FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;

  INSERT INTO public.company_module_grants (company_id, module_key, status, reason, granted_by, updated_at)
  VALUES (p_company_id, p_module_key, p_status, p_reason, v_grantor, now())
  ON CONFLICT (company_id, module_key) DO UPDATE
    SET status = EXCLUDED.status,
        reason = EXCLUDED.reason,
        granted_by = EXCLUDED.granted_by,
        updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_company_module_grant(
  p_company_id uuid,
  p_module_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT r.name INTO v_role FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();
  IF v_role IS NULL OR v_role != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.company_module_grants
   WHERE company_id = p_company_id AND module_key = p_module_key;
END;
$function$;

-- ─── 3. Company-level add-on grants (giftable add-ons with price override) ─
CREATE OR REPLACE FUNCTION public.admin_get_company_addon_grants(p_company_id uuid)
RETURNS TABLE(
  id              uuid,
  addon_id        text,
  status          text,
  price_override  integer,
  reason          text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT r.name INTO v_role FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();
  IF v_role IS NULL OR v_role != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT g.id, g.addon_id::text, g.status, g.price_eur_cents_override, g.reason, g.starts_at, g.ends_at, g.created_at
    FROM public.company_addon_grants g
   WHERE g.company_id = p_company_id
   ORDER BY g.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_company_addon_grant(
  p_company_id              uuid,
  p_addon_id                text,
  p_status                  text DEFAULT 'active',
  p_price_eur_cents_override integer DEFAULT NULL,
  p_reason                  text DEFAULT NULL,
  p_ends_at                 timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_grantor uuid;
  v_id uuid;
BEGIN
  SELECT r.name INTO v_role FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();
  IF v_role IS NULL OR v_role != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('active', 'revoked') THEN
    RAISE EXCEPTION 'invalid status: %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_price_eur_cents_override IS NOT NULL AND p_price_eur_cents_override < 0 THEN
    RAISE EXCEPTION 'price override must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_grantor FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;

  INSERT INTO public.company_addon_grants
    (company_id, addon_id, status, price_eur_cents_override, reason, granted_by, starts_at, ends_at, updated_at)
  VALUES
    (p_company_id, p_addon_id, p_status, p_price_eur_cents_override, p_reason, v_grantor, now(), p_ends_at, now())
  ON CONFLICT (company_id, addon_id) DO UPDATE
    SET status = EXCLUDED.status,
        price_eur_cents_override = EXCLUDED.price_eur_cents_override,
        reason = EXCLUDED.reason,
        ends_at = EXCLUDED.ends_at,
        granted_by = EXCLUDED.granted_by,
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_company_addon_grant(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT r.name INTO v_role FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();
  IF v_role IS NULL OR v_role != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.company_addon_grants WHERE id = p_id;
END;
$function$;

-- ─── 4. Grants ──────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.admin_get_plan_module_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_plan_module_access(text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_company_module_grants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_company_module_grant(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_company_module_grant(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_company_addon_grants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_company_addon_grant(uuid, text, text, integer, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_company_addon_grant(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
