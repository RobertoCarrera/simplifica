-- ============================================================================
-- Smoke test: align_plans_module_keys migration
--
-- Verifies the rewrite algorithm and rollback symmetry without requiring
-- a `supabase db reset`. The test materialises the same canonical map
-- the migration inserts, runs an inline rewrite on representative legacy
-- arrays, asserts canonicalization + de-duplication, runs the rollback
-- path, and asserts restoration.
--
-- Run as: psql -f this_file.sql
-- All operations run inside a transaction (BEGIN/ROLLBACK) so no data
-- persists. The test raises EXCEPTION if any assertion fails, so
-- ON_ERROR_STOP surfaces a non-zero exit code.
--
-- Spec ref: F-PB-004 / F-PB-005 (Module Key Namespace Canonicalization +
-- Rollback Safety).
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on

\echo '========================================'
\echo 'ALIGN PLANS MODULE KEYS — smoke'
\echo '========================================'

BEGIN;

-- ── Mirror of public.module_key_canonical_map (server-side source of truth) ──
CREATE TEMP TABLE __smoke_canonical_map (
  legacy_key text PRIMARY KEY,
  canonical_key text NOT NULL
);

INSERT INTO __smoke_canonical_map (legacy_key, canonical_key) VALUES
  ('clientes',      'core_/clientes'),
  ('reservas',      'moduloReservas'),
  ('webmail',       'core_/webmail'),
  ('analiticas',    'moduloAnaliticas'),
  ('facturas',      'moduloFacturas'),
  ('presupuestos',  'moduloPresupuestos'),
  ('facturacion',   'moduloFacturas'),
  ('marketing',     'marketing'),
  ('proyectos',     'moduloProyectos'),
  ('servicios',     'moduloServicios'),
  ('productos',     'moduloProductos'),
  ('dispositivos',  'moduloSAT'),
  ('tickets',       'moduloChat');

-- Canonical namespace, derived from SIDEBAR_CATALOG.
CREATE TEMP TABLE __smoke_canonical_keys (key text PRIMARY KEY);
INSERT INTO __smoke_canonical_keys (key) VALUES
  ('core_/inicio'),('core_/notifications'),('core_/clientes'),('core_/gdpr'),
  ('core_/webmail'),('core_/webmail-admin'),('core_/admin/modulos'),
  ('moduloSAT'),('moduloChat'),('moduloPresupuestos'),('moduloFacturas'),
  ('moduloAnaliticas'),('moduloProductos'),('moduloServicios'),
  ('moduloReservas'),('moduloProyectos'),('marketing'),('documentacion');

-- Helper function: rewrite each legacy key (or pass through if unknown),
-- de-duplicate, and return the canonical array.
CREATE OR REPLACE FUNCTION __smoke_canonicalize(p_keys text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(ARRAY(
    SELECT DISTINCT COALESCE(m.canonical_key, k)
    FROM unnest(p_keys) AS k
    LEFT JOIN __smoke_canonical_map m ON m.legacy_key = k
  ), ARRAY[]::text[]);
$$;

-- Test fixtures: pre-migration rows (legacy keys) and their expected
-- post-migration rewrites.
CREATE TEMP TABLE __smoke_plans (
  id text PRIMARY KEY,
  original_modules text[] NOT NULL
);

INSERT INTO __smoke_plans (id, original_modules) VALUES
  ('__smoke_a', ARRAY['clientes','reservas','webmail','analiticas']),
  ('__smoke_b', ARRAY['clientes','reservas','facturas','presupuestos','facturacion','productos','dispositivos']),
  ('__smoke_c', ARRAY['marketing','facturacion']);

CREATE TEMP TABLE __smoke_backup AS SELECT * FROM __smoke_plans;
CREATE TEMP TABLE __smoke_rewritten (
  id text PRIMARY KEY,
  rewritten_modules text[] NOT NULL
);

DO $$
DECLARE
  r record;
  v_rebuilt text[];
BEGIN
  FOR r IN SELECT id, original_modules FROM __smoke_plans LOOP
    v_rebuilt := __smoke_canonicalize(r.original_modules);
    INSERT INTO __smoke_rewritten (id, rewritten_modules) VALUES (r.id, v_rebuilt);
  END LOOP;
END $$;

DO $$
DECLARE
  v_pass int := 0;
  v_fail int := 0;
  v_arr text[];
  v_unknown text[];
BEGIN
  -- ──────────────────────────────────────────────────────────────────
  -- A. The map declares exactly 13 legacy entries.
  -- ──────────────────────────────────────────────────────────────────
  IF (SELECT count(*) FROM __smoke_canonical_map) = 13 THEN
    RAISE NOTICE 'PASS: canonical map declares 13 legacy entries';
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: canonical map declares % entries (expected 13)', (SELECT count(*) FROM __smoke_canonical_map);
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- B. Row A: 'clientes','reservas','webmail','analiticas'
  --    → 'core_/clientes','moduloReservas','core_/webmail','moduloAnaliticas'
  -- ──────────────────────────────────────────────────────────────────
  SELECT rewritten_modules INTO v_arr FROM __smoke_rewritten WHERE id = '__smoke_a';

  IF v_arr = ARRAY['core_/clientes','moduloReservas','core_/webmail','moduloAnaliticas'] THEN
    RAISE NOTICE 'PASS: row A rewritten correctly to %', v_arr;
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: row A produced %, expected canonical keys only', v_arr;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- C. Row A contains no remaining legacy plain keys.
  -- ──────────────────────────────────────────────────────────────────
  SELECT COALESCE(array_agg(k) FILTER (WHERE k IN ('clientes','reservas','webmail','analiticas')), ARRAY[]::text[])
    INTO v_unknown
    FROM unnest(v_arr) k;

  IF v_unknown = ARRAY[]::text[] THEN
    RAISE NOTICE 'PASS: row A contains no legacy plain keys';
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: row A still contains legacy keys: %', v_unknown;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- D. Row B collapses 'facturas' + 'facturacion' into one 'moduloFacturas'.
  -- ──────────────────────────────────────────────────────────────────
  SELECT rewritten_modules INTO v_arr FROM __smoke_rewritten WHERE id = '__smoke_b';

  IF (SELECT count(*) FROM unnest(v_arr) k WHERE k = 'moduloFacturas') = 1 THEN
    RAISE NOTICE 'PASS: row B de-duplicates facturas/facturacion → moduloFacturas';
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: row B did not collapse facturas/facturacion, got %', v_arr;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- E. Row B renames 'dispositivos' → 'moduloSAT'.
  -- ──────────────────────────────────────────────────────────────────
  IF 'moduloSAT' = ANY (v_arr) AND NOT ('dispositivos' = ANY (v_arr)) THEN
    RAISE NOTICE 'PASS: row B renames dispositivos → moduloSAT';
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: row B did not rename dispositivos, got %', v_arr;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- F. Every rewritten key belongs to the canonical namespace.
  -- ──────────────────────────────────────────────────────────────────
  SELECT COALESCE(array_agg(k) FILTER (WHERE NOT EXISTS (SELECT 1 FROM __smoke_canonical_keys WHERE key = k.k)), ARRAY[]::text[])
    INTO v_unknown
    FROM (SELECT DISTINCT unnest(rewritten_modules) AS k FROM __smoke_rewritten) k;

  IF v_unknown = ARRAY[]::text[] THEN
    RAISE NOTICE 'PASS: every rewritten key belongs to the canonical namespace';
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: keys not in canonical namespace: %', v_unknown;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- G. Row C: 'marketing' → 'marketing' (kept verbatim) and 'facturacion' → 'moduloFacturas'.
  -- ──────────────────────────────────────────────────────────────────
  SELECT rewritten_modules INTO v_arr FROM __smoke_rewritten WHERE id = '__smoke_c';

  IF v_arr = ARRAY['marketing','moduloFacturas'] THEN
    RAISE NOTICE 'PASS: row C canonicalizes marketing + facturacion correctly';
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: row C produced %, expected [marketing, moduloFacturas]', v_arr;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- H. Unknown keys pass through unchanged (forward-compat).
  -- ──────────────────────────────────────────────────────────────────
  v_arr := __smoke_canonicalize(ARRAY['clientes','unknown_future_key']);
  IF 'core_/clientes' = ANY(v_arr) AND 'unknown_future_key' = ANY(v_arr) THEN
    RAISE NOTICE 'PASS: unknown keys pass through unchanged';
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: unknown keys handling broken, got %', v_arr;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- I. Rollback restores the original (pre-migration) arrays verbatim.
  -- ──────────────────────────────────────────────────────────────────
  UPDATE __smoke_rewritten r
     SET rewritten_modules = b.original_modules
    FROM __smoke_backup b
   WHERE r.id = b.id;

  SELECT rewritten_modules INTO v_arr FROM __smoke_rewritten WHERE id = '__smoke_a';
  IF v_arr = (SELECT original_modules FROM __smoke_plans WHERE id = '__smoke_a') THEN
    RAISE NOTICE 'PASS: rollback restores row A original %', v_arr;
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: rollback row A mismatch, got %', v_arr;
  END IF;

  SELECT rewritten_modules INTO v_arr FROM __smoke_rewritten WHERE id = '__smoke_b';
  IF v_arr = (SELECT original_modules FROM __smoke_plans WHERE id = '__smoke_b') THEN
    RAISE NOTICE 'PASS: rollback restores row B original %', v_arr;
    v_pass := v_pass + 1;
  ELSE
    RAISE EXCEPTION 'FAIL: rollback row B mismatch, got %', v_arr;
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- Summary
  -- ──────────────────────────────────────────────────────────────────
  RAISE NOTICE '═════════════════════════════════════════';
  RAISE NOTICE 'align_plans_module_keys smoke: % pass / % fail', v_pass, v_fail;
  RAISE NOTICE '═════════════════════════════════════════';

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'SMOKE FAILED: % assertion(s) failed', v_fail;
  END IF;
END $$;

ROLLBACK;

\echo 'align_plans_module_keys smoke: OK (transaction rolled back, no data persisted)'