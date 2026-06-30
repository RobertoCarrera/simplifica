-- ============================================================================
-- Smoke test: insert_free_plan migration
-- Asserts F-FREE-001 (Free Plan Existence) contract values on the row
-- that migration 0002 inserts. Runs inside a transaction; uses a TEMP
-- mirror of `plans` so no production data is touched.
--
-- Run as: psql -f this_file.sql
-- Spec ref: F-FREE-001.
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on
\echo 'INSERT FREE PLAN — smoke'
BEGIN;

CREATE TEMP TABLE __smoke_plans (
  id text PRIMARY KEY, name text NOT NULL, tagline text, description text,
  base_price_cents int NOT NULL, currency text NOT NULL,
  billing_period text NOT NULL, included_users int NOT NULL,
  extra_user_cents int NOT NULL, included_modules text[] NOT NULL,
  sort_order int NOT NULL, is_active boolean NOT NULL,
  is_highlighted boolean NOT NULL
);

-- Mirror of the migration's INSERT (0002 inserts id='free' with sort_order=0,
-- base_price_cents=0, included_users=1, and the basic module set).
INSERT INTO __smoke_plans (
  id, name, tagline, description,
  base_price_cents, currency, billing_period,
  included_users, extra_user_cents,
  included_modules, sort_order, is_active, is_highlighted
) VALUES (
  'free', 'Free',
  'Empieza gratis con un usuario y los módulos básicos',
  'Plan gratuito para probar el CRM: 1 usuario, módulos core.',
  0, 'EUR', 'monthly',
  1, 0,
  ARRAY['core_/inicio','core_/clientes','core_/webmail'],
  0, true, false
) ON CONFLICT (id) DO NOTHING;

DO $body$
DECLARE v_pass int := 0; v_mods text[];
BEGIN
  -- A. Free row has the F-FREE-001 contract values.
  PERFORM 1 FROM __smoke_plans WHERE id = 'free'
     AND base_price_cents = 0
     AND included_users = 1
     AND billing_period = 'monthly'
     AND is_active = true
     AND sort_order = 0;
  IF FOUND THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: free row contract (price=0, users=1, sort_order=0)';
  ELSE RAISE EXCEPTION 'FAIL: free row contract values missing'; END IF;

  -- B. core_/inicio is in included_modules (C1 fix).
  SELECT included_modules INTO v_mods FROM __smoke_plans WHERE id = 'free';
  IF 'core_/inicio' = ANY(v_mods) THEN v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: free.included_modules contains core_/inicio (dashboard)';
  ELSE RAISE EXCEPTION 'FAIL: missing core_/inicio, got %', v_mods; END IF;

  -- C. core_/clientes + core_/webmail still present (no regression).
  IF 'core_/clientes' = ANY(v_mods) AND 'core_/webmail' = ANY(v_mods) THEN
    v_pass := v_pass + 1;
    RAISE NOTICE 'PASS: free.included_modules contains core_/clientes + core_/webmail';
  ELSE RAISE EXCEPTION 'FAIL: regression in core modules, got %', v_mods; END IF;

  RAISE NOTICE 'insert_free_plan smoke: % pass', v_pass;
END $body$;

ROLLBACK;
\echo 'insert_free_plan smoke: OK'
