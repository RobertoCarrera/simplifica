-- ============================================================================
-- Migration: custom_access_token_postgres_hook
-- ============================================================================
-- PURPOSE: Replace the HTTPS Edge Function (custom-access-token) with a
--          Postgres-native Auth Hook. The HTTPS variant is currently broken
--          because Supabase Gateway now requires the apikey header on
--          non-browser callers, and GoTrue's hook dispatcher doesn't send
--          one. This breaks login for ALL users (HTTP 500 -> 401 to client).
--
-- BEHAVIOR: Faithfully ports the claim logic from the EF:
--   1. Look up the user in public.users (joined with public.app_roles)
--      by auth_user_id, filtering on active=true AND deleted_at IS NULL.
--   2. If not found, fall back to public.clients (is_active=true AND
--      deleted_at IS NULL) — assigns user_role = 'client'.
--   3. Inject company_id and user_role (and app_role for internal users)
--      into the JWT claims, preserving any existing claims.
--
-- SECURITY: SECURITY DEFINER makes the function execute as its owner (the
--           migration runner, i.e. postgres) so it can read users / clients /
--           app_roles regardless of RLS. EXECUTE is revoked from PUBLIC,
--           anon, authenticated, and service_role; only supabase_auth_admin
--           (the actual hook caller) and authenticator are granted access.
--
-- ACTIVATION: After this migration runs, the user MUST flip the hook type
--             in Dashboard -> Auth -> Hooks -> Custom Access Token from
--             "HTTPS" to "Postgres" and select this function. Until then
--             the broken HTTPS hook is still active.
--
-- REFERENCES:
--   https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
--   supabase/functions/custom-access-token/index.ts (the EF being replaced)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claims jsonb;
  user_id uuid;
  company_id_text text;
  app_role_name text;
  user_role_name text;
BEGIN
  -- Extract user_id from the auth event payload
  -- (Supabase puts user_id at the root of the event, NOT nested under user.id)
  user_id := (event ->> 'user_id')::uuid;

  -- Start from whatever claims Supabase already provided (sub, email, role, etc.)
  claims := coalesce(event -> 'claims', '{}'::jsonb);

  -- 1) Look up internal user (joined with app_roles for the role name)
  SELECT
    u.company_id::text,
    ar.name
  INTO company_id_text, app_role_name
  FROM public.users u
  LEFT JOIN public.app_roles ar ON ar.id = u.app_role_id
  WHERE u.auth_user_id = user_id
    AND u.active = true
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF company_id_text IS NOT NULL OR app_role_name IS NOT NULL THEN
    user_role_name := app_role_name;
  ELSE
    -- 2) Fallback: client record. The EF used 'client' as the literal role.
    SELECT c.company_id::text
      INTO company_id_text
      FROM public.clients c
     WHERE c.auth_user_id = user_id
       AND c.is_active = true
       AND c.deleted_at IS NULL
     LIMIT 1;

    IF company_id_text IS NOT NULL THEN
      user_role_name := 'client';
    END IF;
  END IF;

  -- Inject custom claims (preserving every existing claim)
  IF company_id_text IS NOT NULL THEN
    claims := jsonb_set(claims, '{company_id}', to_jsonb(company_id_text));
  END IF;

  IF user_role_name IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role_name));
    -- Mirror the role under app_role for consumers that look it up there.
    -- (Internal users get their actual role; clients get 'client'.)
    claims := jsonb_set(claims, '{app_role}', to_jsonb(user_role_name));
  END IF;

  -- Auth Hook contract: return the full event with claims replaced.
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Lock down execution: only the auth admin (the actual hook caller) and
-- the request-time authenticator role may invoke it. Public / anon /
-- authenticated / service_role never need this hook and must be denied.
-- NOTE: REVOKE FROM PUBLIC alone is NOT enough on Supabase — anon,
-- authenticated, and service_role get default EXECUTE via the standard
-- role grants, so they must be revoked explicitly.
REVOKE EXECUTE ON FUNCTION public.custom_access_token(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.custom_access_token(jsonb) FROM service_role;
GRANT  EXECUTE ON FUNCTION public.custom_access_token(jsonb) TO supabase_auth_admin;
GRANT  EXECUTE ON FUNCTION public.custom_access_token(jsonb) TO authenticator;
