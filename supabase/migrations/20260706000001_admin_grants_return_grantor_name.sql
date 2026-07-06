-- Gift UI improvements for /admin/modulos:
--   1. Exclude already-granted modules/add-ons from the gift dropdown
--      (the frontend filters client-side using the returned list).
--   2. Show gift history (regalado el YYYY-MM-DD por [user] — "reason")
--      in the chip tooltip.
--
-- The grant tables already store granted_by + reason + created_at. The
-- only thing missing for the history tooltip is the human-readable name
-- of the grantor — so we LEFT JOIN public.users and surface
-- `granted_by_name` directly. The frontend never has to resolve UUIDs.

-- DROP first because the RETURN type changes; CREATE OR REPLACE alone
-- can't widen an existing RETURNS TABLE.
DROP FUNCTION IF EXISTS public.admin_get_company_module_grants(uuid);
DROP FUNCTION IF EXISTS public.admin_get_company_addon_grants(uuid);

-- ─── admin_get_company_module_grants ───
CREATE OR REPLACE FUNCTION public.admin_get_company_module_grants(p_company_id uuid)
RETURNS TABLE(
  module_key       text,
  status           text,
  reason           text,
  created_at       timestamptz,
  granted_by_name  text
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
  SELECT
    g.module_key,
    g.status,
    g.reason,
    g.created_at,
    COALESCE(
      NULLIF(TRIM(COALESCE(ugr.name, '') || ' ' || COALESCE(ugr.surname, '')), ''),
      ugr.email
    ) AS granted_by_name
    FROM public.company_module_grants g
    LEFT JOIN public.users ugr ON g.granted_by = ugr.id
   WHERE g.company_id = p_company_id
   ORDER BY g.created_at DESC;
END;
$function$;

-- ─── admin_get_company_addon_grants ───
CREATE OR REPLACE FUNCTION public.admin_get_company_addon_grants(p_company_id uuid)
RETURNS TABLE(
  id              uuid,
  addon_id        text,
  status          text,
  price_override  integer,
  reason          text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz,
  granted_by_name text
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
  SELECT
    g.id,
    g.addon_id::text,
    g.status,
    g.price_eur_cents_override,
    g.reason,
    g.starts_at,
    g.ends_at,
    g.created_at,
    COALESCE(
      NULLIF(TRIM(COALESCE(ugr.name, '') || ' ' || COALESCE(ugr.surname, '')), ''),
      ugr.email
    ) AS granted_by_name
    FROM public.company_addon_grants g
    LEFT JOIN public.users ugr ON g.granted_by = ugr.id
   WHERE g.company_id = p_company_id
   ORDER BY g.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_get_company_module_grants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_company_addon_grants(uuid) TO authenticated;