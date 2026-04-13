-- =====================================================================
-- Migration: Vault RPC for Edge Functions
-- Date: 2026-03-25
-- Reason: The `vault` schema is NOT exposed via PostgREST, so
--         `.schema('vault').from('decrypted_secrets')` in the JS client
--         always fails silently (PostgREST rejects non-exposed schemas).
--
-- Solution: A SECURITY DEFINER function in public schema that reads
-- vault.decrypted_secrets at the postgres role level and returns the
-- secret value. Edge Functions call this via supabase.rpc().
--
-- Security model:
--   - REVOKE EXECUTE from anon, authenticated → only service_role can call it
--   - SECURITY DEFINER runs as the function owner (postgres role)
--   - Returns NULL if secret not found (never raises, to avoid secret name leakage)
--   - STABLE (read-only) so PostgREST allows it via GET as well as POST
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_vault_secret(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, vault
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = secret_name
   LIMIT 1;

  RETURN v_secret;
END;
$$;

-- Only service_role may call this — anon and authenticated have no access
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vault_secret(text) TO service_role;
