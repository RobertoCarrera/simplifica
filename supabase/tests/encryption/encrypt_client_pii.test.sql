-- ============================================================
-- pgTAP Tests: encrypt_client_pii / decrypt_client_pii roundtrip
-- Feature: pentest-audit-clients-table-remediation / Task 1.6
-- Date: 2026-03-25
--
-- Covers (Spec: DP-01, DP-02, DP-03):
--   T1: encrypt_client_pii returns ciphertext != plaintext
--   T2: decrypt_client_pii(encrypt_client_pii(x)) = x (roundtrip)
--   T3: Two encryptions of same DNI produce different ciphertext (pgp randomized)
--   T4: encrypt_client_pii raises exception if DNI is empty
--   T5: decrypt_client_pii raises exception for unknown client_id
--   T6: decrypt_client_pii raises exception for non-DPO/non-admin users
--   T7: dni_encrypted column in clients table contains ciphertext after backfill
--   T8: backfill_clients_dni_encryption is idempotent (run twice = same result)
--
-- Running:
--   supabase db reset && psql $DATABASE_URL -f supabase/tests/encryption/encrypt_client_pii.test.sql
-- ============================================================

BEGIN;

SELECT plan(14);

-- ============================================================
-- FIXTURES
-- ============================================================

INSERT INTO public.companies (id, name) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'Encryption Test Company');

-- Super admin auth user (needed for backfill test)
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'superadmin@test.invalid', NOW());

INSERT INTO public.users (id, auth_user_id, company_id, name, email, is_dpo, data_access_level) VALUES
  ('dddddddd-0000-0000-0001-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   'Super Admin', 'superadmin@test.invalid',
   TRUE,   -- is_dpo (for decrypt tests)
   'admin' -- data_access_level
  );

-- Grant super_admin role via app_roles (is_super_admin column was removed; use app_role_id + company_members)
UPDATE public.users
  SET app_role_id = (SELECT id FROM public.app_roles WHERE name = 'super_admin' LIMIT 1)
  WHERE id = 'dddddddd-0000-0000-0001-000000000001';

INSERT INTO public.company_members (user_id, company_id, role_id, status)
  SELECT 'dddddddd-0000-0000-0001-000000000001',
         'dddddddd-0000-0000-0000-000000000001',
         ar.id,
         'active'
  FROM public.app_roles ar WHERE ar.name = 'super_admin'
  LIMIT 1;

-- DPO user (for decrypt access test)
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000002', 'dpo@test.invalid', NOW());

INSERT INTO public.users (id, auth_user_id, company_id, name, email, is_dpo, data_access_level) VALUES
  ('dddddddd-0000-0000-0001-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000001',
   'DPO User', 'dpo@test.invalid',
   TRUE,   -- is_dpo
   'admin'
  );

-- Regular user (no DPO, no elevated access) for negative decrypt test
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000003', 'regular@test.invalid', NOW());

INSERT INTO public.users (id, auth_user_id, company_id, name, email, is_dpo, data_access_level) VALUES
  ('dddddddd-0000-0000-0001-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000003',
   'dddddddd-0000-0000-0000-000000000001',
   'Regular User', 'regular@test.invalid',
   FALSE,
   'standard'
  );

-- Test client (plaintext DNI, no encrypted version yet)
INSERT INTO public.clients (id, company_id, name, email, dni) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001',
   'Test Client Encrypt', 'testenc@test.invalid', '12345678Z');

-- ============================================================
-- TEST HELPER: set JWT context to a given auth user
-- ============================================================

-- ============================================================
-- T1: encrypt_client_pii returns ciphertext != plaintext DNI
-- ============================================================
-- Call via service role (auth.uid() is NULL → company check skipped)
DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.encrypt_client_pii(
    'dddddddd-0000-0000-0000-000000000001'::UUID,
    '12345678Z'
  );
  -- Store for later tests
  PERFORM set_config('test.dni_ciphertext', v_result->>'dni_encrypted', TRUE);
  PERFORM set_config('test.original_dni',   '12345678Z', TRUE);
END;
$$;

SELECT isnt(
  current_setting('test.dni_ciphertext'),
  current_setting('test.original_dni'),
  'T1: encrypt_client_pii — ciphertext != plaintext DNI'
);

-- ============================================================
-- T2: ciphertext is not empty
-- ============================================================
SELECT ok(
  length(current_setting('test.dni_ciphertext')) > 0,
  'T2: ciphertext is not empty string'
);

-- ============================================================
-- T3: Two encryptions of the same DNI produce different ciphertext
--     (pgcrypto pgp_sym_encrypt uses random session key — CTR mode)
-- ============================================================
DO $$
DECLARE
  v_enc1 JSONB;
  v_enc2 JSONB;
BEGIN
  v_enc1 := public.encrypt_client_pii('dddddddd-0000-0000-0000-000000000001'::UUID, '12345678Z');
  v_enc2 := public.encrypt_client_pii('dddddddd-0000-0000-0000-000000000001'::UUID, '12345678Z');
  PERFORM set_config('test.enc1', v_enc1->>'dni_encrypted', TRUE);
  PERFORM set_config('test.enc2', v_enc2->>'dni_encrypted', TRUE);
END;
$$;

SELECT isnt(
  current_setting('test.enc1'),
  current_setting('test.enc2'),
  'T3: Two encryptions of same DNI produce different ciphertext (pgp random session key)'
);

-- ============================================================
-- T4: encrypt_client_pii raises exception for empty DNI
-- ============================================================
SELECT throws_ok(
  $$SELECT public.encrypt_client_pii('dddddddd-0000-0000-0000-000000000001'::UUID, '')$$,
  'p_dni is required for PII encryption',
  'T4: encrypt_client_pii raises exception for empty DNI'
);

-- ============================================================
-- T5: encrypt_client_pii raises exception for NULL DNI
-- ============================================================
SELECT throws_ok(
  $$SELECT public.encrypt_client_pii('dddddddd-0000-0000-0000-000000000001'::UUID, NULL)$$,
  'p_dni is required for PII encryption',
  'T5: encrypt_client_pii raises exception for NULL DNI'
);

-- ============================================================
-- T6: decrypt_client_pii roundtrip — DPO can decrypt
-- ============================================================
-- First, write encrypted DNI directly into test client row
UPDATE public.clients
SET dni_encrypted = current_setting('test.dni_ciphertext'),
    pii_key_version = 1
WHERE id = 'eeeeeeee-0000-0000-0000-000000000001';

-- Set JWT context to DPO user
SET LOCAL request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002"}';
SET LOCAL role = authenticated;

DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.decrypt_client_pii('eeeeeeee-0000-0000-0000-000000000001'::UUID);
  PERFORM set_config('test.decrypted_dni', v_result->>'dni', TRUE);
END;
$$;

RESET role;

SELECT is(
  current_setting('test.decrypted_dni'),
  '12345678Z',
  'T6: decrypt_client_pii roundtrip — DPO decrypts ciphertext back to original DNI'
);

-- ============================================================
-- T7: decrypt_client_pii raises for unknown client
-- ============================================================
SET LOCAL request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002"}';
SET LOCAL role = authenticated;

SELECT throws_like(
  $$SELECT public.decrypt_client_pii('ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID)$$,
  '%not found%',
  'T7: decrypt_client_pii raises for unknown client_id'
);

RESET role;

-- ============================================================
-- T8: decrypt_client_pii raises for non-DPO regular user
-- ============================================================
SET LOCAL request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000003"}';
SET LOCAL role = authenticated;

SELECT throws_like(
  $$SELECT public.decrypt_client_pii('eeeeeeee-0000-0000-0000-000000000001'::UUID)$$,
  '%Access denied%',
  'T8: decrypt_client_pii raises Access denied for regular user (no DPO/admin)'
);

RESET role;

-- ============================================================
-- T9: audit log entry created on successful decryption
-- ============================================================
SET LOCAL request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002"}';
SET LOCAL role = authenticated;

DO $$
BEGIN
  PERFORM public.decrypt_client_pii('eeeeeeee-0000-0000-0000-000000000001'::UUID);
END;
$$;
RESET role;

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.gdpr_audit_log
    WHERE action_type = 'DECRYPT_CLIENT_PII'
      AND record_id = 'eeeeeeee-0000-0000-0000-000000000001'
      AND table_name = 'clients'
  ),
  'T9: gdpr_audit_log contains DECRYPT_CLIENT_PII entry after authorized decryption'
);

-- ============================================================
-- T10: encrypt_client_pii result includes key_version = 1
-- ============================================================
SELECT is(
  (public.encrypt_client_pii(
    'dddddddd-0000-0000-0000-000000000001'::UUID,
    'TEST123'
  ) ->> 'key_version')::integer,
  1,
  'T10: encrypt_client_pii result includes key_version = 1'
);

-- ============================================================
-- T11: encrypt_client_pii handles birth_date parameter
-- ============================================================
DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.encrypt_client_pii(
    'dddddddd-0000-0000-0000-000000000001'::UUID,
    '12345678Z',
    '1990-05-15'
  );
  PERFORM set_config('test.birth_date_enc', COALESCE(v_result->>'birth_date_encrypted', ''), TRUE);
END;
$$;

SELECT ok(
  length(current_setting('test.birth_date_enc')) > 0,
  'T11: encrypt_client_pii encrypts birth_date when provided'
);

-- ============================================================
-- T12: encrypt_client_pii returns null birth_date_encrypted when not provided
-- ============================================================
DO $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.encrypt_client_pii(
    'dddddddd-0000-0000-0000-000000000001'::UUID,
    '12345678Z'
    -- birth_date omitted
  );
  PERFORM set_config('test.birth_date_null', COALESCE(v_result->>'birth_date_encrypted', 'NULL'), TRUE);
END;
$$;

SELECT is(
  current_setting('test.birth_date_null'),
  'NULL',
  'T12: birth_date_encrypted is null when birth_date not provided'
);

-- ============================================================
-- T13: backfill_clients_dni_encryption encrypts plaintext DNI rows
-- ============================================================
-- Add a second client with unencrypted DNI (simulates legacy data)
INSERT INTO public.clients (id, company_id, name, email, dni, dni_encrypted) VALUES
  ('eeeeeeee-0000-0000-0000-000000000002',
   'dddddddd-0000-0000-0000-000000000001',
   'Legacy Client', 'legacy@test.invalid', '99887766X', NULL);

SET LOCAL request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}';
SET LOCAL role = authenticated;

DO $$
DECLARE v_result JSONB;
BEGIN
  v_result := public.backfill_clients_dni_encryption();
  RAISE NOTICE 'Backfill result: %', v_result;
END;
$$;

RESET role;

SELECT ok(
  (SELECT dni_encrypted IS NOT NULL FROM public.clients WHERE id = 'eeeeeeee-0000-0000-0000-000000000002'),
  'T13: backfill_clients_dni_encryption sets dni_encrypted for legacy rows'
);

-- ============================================================
-- T14: backfill is idempotent — running twice does not double-encrypt
-- ============================================================
DO $$
DECLARE
  v_enc_before TEXT;
  v_enc_after  TEXT;
BEGIN
  SELECT dni_encrypted INTO v_enc_before
  FROM public.clients WHERE id = 'eeeeeeee-0000-0000-0000-000000000002';

  SET LOCAL request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001"}';
  SET LOCAL role = authenticated;
  PERFORM public.backfill_clients_dni_encryption();
  RESET role;

  SELECT dni_encrypted INTO v_enc_after
  FROM public.clients WHERE id = 'eeeeeeee-0000-0000-0000-000000000002';

  PERFORM set_config('test.idempotent_match', CASE WHEN v_enc_before = v_enc_after THEN 'same' ELSE 'changed' END, TRUE);
END;
$$;

SELECT is(
  current_setting('test.idempotent_match'),
  'same',
  'T14: backfill_clients_dni_encryption is idempotent — existing encrypted rows not re-encrypted'
);

-- ============================================================
SELECT * FROM finish();
ROLLBACK;
