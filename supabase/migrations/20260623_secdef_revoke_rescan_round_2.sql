-- Rafter SECDEF Re-Scan v2 (2026-06-23)
-- Project: ufutyjbqfjrlzkprvyvs.supabase.co
-- Total REVOKE statements: 4 (auth + anon)
-- 2026-06-23T10:01:48.421Z
-- DO NOT APPLY — review only

BEGIN;

-- === REVOKE FROM anon (2 statements) ===
REVOKE EXECUTE ON FUNCTION public.join_waiting_list(p_user_id uuid, p_class_session_id bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.migrate_legacy_users() FROM anon;

-- === REVOKE FROM authenticated (2 statements) ===
REVOKE EXECUTE ON FUNCTION public.join_waiting_list(p_user_id uuid, p_class_session_id bigint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.migrate_legacy_users() FROM authenticated;

COMMIT;
