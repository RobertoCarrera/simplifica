-- =====================================================================
-- Migration: Fix backfill_clients_dni_encryption() — is_super_admin column
-- Date: 2026-03-25
-- Ticket: pentest-audit-clients-table-remediation / Task 1.1 bugfix
--
-- Problem: backfill_clients_dni_encryption() referenced `is_super_admin`
-- column on the users table, but this column does not exist. The correct
-- check uses app_role_id FK to app_roles where name = 'super_admin'.
--
-- This migration replaces the function with the corrected version.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.backfill_clients_dni_encryption()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_key     TEXT;
  v_count   INTEGER := 0;
  v_skipped INTEGER := 0;
  v_failed  INTEGER := 0;
  rec       RECORD;
BEGIN
  -- Super admin only — this is a one-time admin operation.
  -- Allow service role (auth.uid() IS NULL) for automated/admin execution.
  -- When called by an authenticated user, verify super_admin role via app_roles.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.app_roles r ON r.id = u.app_role_id
    WHERE u.auth_user_id = auth.uid()
      AND r.name = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: super_admin role required for backfill operation';
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'clients_pii_key_v1';

  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'clients_pii_key_v1 not found in Vault — run the encrypt_clients_pii migration first.';
  END IF;

  FOR rec IN
    SELECT id, dni
    FROM public.clients
    WHERE dni IS NOT NULL
      AND dni <> ''
      AND dni <> 'PENDIENTE'
      AND dni_encrypted IS NULL     -- skip already-encrypted rows (idempotency)
    FOR UPDATE SKIP LOCKED          -- skip rows locked by concurrent writes
  LOOP
    BEGIN
      UPDATE public.clients
      SET
        dni_encrypted   = extensions.pgp_sym_encrypt(rec.dni, v_key),
        pii_key_version = 1,
        updated_at      = NOW()
      WHERE id = rec.id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Backfill failed for client id=% : %. Row skipped.', rec.id, SQLERRM;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  -- Audit the backfill operation
  BEGIN
    INSERT INTO public.gdpr_audit_log (
      action_type, table_name, purpose, user_id
    ) VALUES (
      'BACKFILL_PII_ENCRYPTION',
      'clients',
      format('Backfilled DNI encryption: %s encrypted, %s skipped, %s failed', v_count, v_skipped, v_failed),
      (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Audit log insert failed during backfill: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'success',   true,
    'encrypted', v_count,
    'skipped',   v_skipped,
    'failed',    v_failed
  );
END;
$$;

-- Only super_admin can run backfill (service role bypasses this)
GRANT EXECUTE ON FUNCTION public.backfill_clients_dni_encryption() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_clients_dni_encryption() FROM anon;
