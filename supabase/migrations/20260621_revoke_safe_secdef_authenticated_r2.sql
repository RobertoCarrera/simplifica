-- Migration: revoke_safe_secdef_authenticated_r2
-- Sprint: Rafter v0.14.2 (REVOKE_SAFE batch)
-- Author: AI sub-agent (sdd-apply)
-- Date: 2026-06-21
--
-- Correction to r1: functions had `{=X/postgres}` ACL — authenticated
-- inherited EXECUTE via PUBLIC, not via explicit grant. r1's
-- `REVOKE FROM authenticated` was a no-op. This migration revokes from
-- PUBLIC to actually remove the privilege.
--
-- Methodology: docs/rafter-v12-secdef-frontend-migration-needed.md

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_my_user_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mail_account_company_admin(p_account_id uuid) FROM PUBLIC;

COMMIT;
