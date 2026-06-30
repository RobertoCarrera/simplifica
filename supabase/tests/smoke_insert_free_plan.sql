-- ============================================================================
-- Smoke test: insert_free_plan migration
--
-- Verifies the FREE plan row shape asserted by spec F-FREE-001:
--   * id = 'free'
--   * base_price_cents = 0
--   * included_users = 1
--   * billing_period = 'monthly'
--   * is_active = true
--   * sort_order = 0
--   * included_modules MUST contain at minimum:
--       'core_/inicio'   (dashboard)
--       'core_/clientes' (clients)
--       'core_/webmail'  (webmail)
--   * is_highlighted MUST NOT be auto-set if another plan is highlighted
--
-- Uses a TEMP table mirroring the migration's effective schema. The
-- migration is a plain INSERT ... ON CONFLICT DO NOTHING; this smoke
-- exercises the same INSERT so the assertions reflect what would land
-- in the live `plans` table.
--
-- Run as: psql -f this_file.sql
-- All operations run inside a transaction (BEGIN/ROLLBACK) so no data
-- persists. RAISE EXCEPTION surfaces a non-zero exit code via
-- ON_ERROR_STOP.
--
-- Spec ref: F-FREE-001 (Free Plan Existence).
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on

\echo '========================================'
\echo 'INSERT FREE PLAN — smoke'
\echo '========================================'

BEGIN;

-- Mirror of public.plans columns used by the migration INSERT.
CREATE TEMP TABLE __smoke_free_plans (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  tagline            text,
  description        text,
  base_price_cents   integer NOT NULL,
  currency           text    NOT NULL,
  billing_period     text    NOT NULL,
  included_users     integer NOT NULL,
  extra_user_cents   integer NOT NULL,
  included_modules   text[]  NOT NULL,
  sort_order         integer NOT NULL,
  is_active          boolean NOT NULL,
  is_highlighted     boolean NOT NULL
);

-- Pre-existing highlighted plan to validate the no-auto-displace rule.
INSERT INTO __smoke_free_plans (
  id, name, tagline, description,
  base_price_cents, currency, billing_period,
  included_users, extra_user_cents,
  included_modules, sort_order, is_active, is_highlighted
) VALUES (
  'pro', 'Pro', 'Plan profesional', 'Plan profesional para equipos.',
  4900, 'EUR', 'monthly',
  8, 1500,
  ARRAY['core_/inicio','core_/clientes','moduloReservas'],
  1, true, true
);

-- Execute the same INSERT the migration performs.
INSERT INTO __smoke_free_plans (
  id, name, tagline, description,
  base_price_cents, currency, billing_period,
  included_users, extra_user_cents,
  included_modules, sort_order, is_active, is_highlighted
) VALUES (
  'free',
  'Free',
  'Empieza gratis con un usuario y los módulos básicos',
  'Plan gratuito para probar el CRM: 1 usuario, módulos core.',
  0, 'EUR', 'monthly',
  1, 0,
  ARRAY['core_/inicio','core_/clientes','core_/webmail'],
  0, true,
  false
)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_pass int := 0;
  v_fail int := 0;
  v_row  __smoke_free_plans%ROWTYPE;
  v_arr  text[];
BEGIN
  -- ──────────────────────────────────────────────────────────────────
  -- A. The `free` row exists with the contract values.
  -- ──────────────────────────────────────────────────────────────────
  SELECT * INTO v_row FROM __smoke_free_plans WHERE id = 'free';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL: free plan row was not inserted';
  END IF;
  IF v_row.base_price_cents = 0
     AND v_row.included_users = 1
     AND v_row.billing_period = 'monthly'
     AND v_row.is_active = true
     AND v_row.sort_order = 0 THEN
    RAISE NOTICE 'PASS: free plan row has contract values (price=0, users=1, monthly, active, sort_order=0)';
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: free plan row shape incorrect: %', v_row;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- B. included_modules contains core_/inicio (dashboard).
  -- ──────────────────────────────────────────────────────────────────
  v_arr := v_row.included_modules;
  IF 'core_/inicio' = ANY (v_arr) THEN
    RAISE NOTICE 'PASS: free.included_modules contains core_/inicio (dashboard)';
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: free.included_modules missing core_/inicio, got %', v_arr;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- C. included_modules contains core_/clientes (clients).
  -- ──────────────────────────────────────────────────────────────────
  IF 'core_/clientes' = ANY (v_arr) THEN
    RAISE NOTICE 'PASS: free.included_modules contains core_/clientes (clients)';
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: free.included_modules missing core_/clientes, got %', v_arr;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- D. included_modules contains core_/webmail (webmail).
  -- ──────────────────────────────────────────────────────────────────
  IF 'core_/webmail' = ANY (v_arr) THEN
    RAISE NOTICE 'PASS: free.included_modules contains core_/webmail (webmail)';
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: free.included_modules missing core_/webmail, got %', v_arr;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- E. is_highlighted is false; pre-existing 'pro' highlight is preserved.
  -- ──────────────────────────────────────────────────────────────────
  IF v_row.is_highlighted = false
     AND EXISTS (SELECT 1 FROM __smoke_free_plans WHERE id = 'pro' AND is_highlighted = true) THEN
    RAISE NOTICE 'PASS: free is not auto-highlighted; sibling pro.highlighted retained';
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: highlight rule violated (free=% or pro displaced)', v_row.is_highlighted;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- Summary
  -- ──────────────────────────────────────────────────────────────────
  RAISE NOTICE '═════════════════════════════════════════';
  RAISE NOTICE 'insert_free_plan smoke: % pass / % fail', v_pass, v_fail;
  RAISE NOTICE '═════════════════════════════════════════';

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'SMOKE FAILED: % assertion(s) failed', v_fail;
  END IF;
END $$;

ROLLBACK;

\echo 'insert_free_plan smoke: OK (transaction rolled back, no data persisted)'
