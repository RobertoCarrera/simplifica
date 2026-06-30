-- ============================================
-- Migration: Align plans.included_modules to SIDEBAR_CATALOG keys
-- Phase 1 / PR 1 of plans-pricing-freemium (Foundation).
--
-- Pre-migration `plans.included_modules` rows use legacy plain keys
-- (e.g. 'clientes', 'reservas') that do not match the canonical
-- SIDEBAR_CATALOG keys rendered by the Angular admin UI (e.g.
-- 'core_/clientes', 'moduloReservas'). This migration rewrites every
-- legacy key to its canonical equivalent in place and backs up the
-- original column contents for safe rollback.
--
-- The `module_key_canonical_map` table is the server-side source of
-- truth — the same aliases are mirrored on the client in
-- `src/app/shared/module-keys.ts` for defense in depth.
-- ============================================

BEGIN;

-- Server-side canonical map (source of truth). Same keys exposed
-- client-side as `LEGACY_MODULE_KEY_ALIASES` in
-- src/app/shared/module-keys.ts. Both MUST stay in sync.
CREATE TABLE IF NOT EXISTS public.module_key_canonical_map (
  legacy_key    text PRIMARY KEY,
  canonical_key text NOT NULL,
  note          text
);

INSERT INTO public.module_key_canonical_map (legacy_key, canonical_key, note) VALUES
  ('clientes',      'core_/clientes',      'legacy lowercase no-prefix'),
  ('reservas',      'moduloReservas',      'legacy lowercase no-prefix'),
  ('webmail',       'core_/webmail',       'legacy lowercase no-prefix'),
  ('analiticas',    'moduloAnaliticas',    'legacy lowercase no-prefix'),
  ('facturas',      'moduloFacturas',      'legacy lowercase no-prefix'),
  ('presupuestos',  'moduloPresupuestos',  'legacy lowercase no-prefix'),
  ('facturacion',   'moduloFacturas',      'early naming'),
  ('marketing',     'marketing',           'kept verbatim, dev-only'),
  ('proyectos',     'moduloProyectos',     'legacy'),
  ('servicios',     'moduloServicios',     'legacy'),
  ('productos',     'moduloProductos',     'legacy'),
  ('dispositivos',  'moduloSAT',           'legacy naming'),
  ('tickets',       'moduloChat',          'legacy naming')
ON CONFLICT (legacy_key) DO NOTHING;

-- Snapshot the original column for rollback safety.
CREATE TABLE IF NOT EXISTS public.plans_included_modules_backup AS
  SELECT id AS plan_id, included_modules
    FROM public.plans;

-- Take an exclusive lock on `plans` BEFORE the rewrite loop so a
-- concurrent `admin_upsert_plan` (which UPDATEs the same row) cannot
-- race the per-element array rewrite. AccessExclusiveMode blocks both
-- reads and writes; the migration blocks until any in-flight RPC
-- completes. Without this, the rewrite of a single row could be split
-- by an interleaved UPDATE from another transaction, producing a
-- mixed legacy/canonical array.
LOCK TABLE public.plans IN ACCESS EXCLUSIVE MODE;

-- Rewrite every plan's array element by element. Keys not present in
-- the map are preserved as-is (future canonical keys pass through).
DO $$
DECLARE r record;
DECLARE new_arr text[];
DECLARE v text;
DECLARE mapped text;
BEGIN
  FOR r IN SELECT id, included_modules FROM public.plans LOOP
    new_arr := ARRAY[]::text[];
    IF r.included_modules IS NOT NULL THEN
      FOREACH v IN ARRAY r.included_modules LOOP
        SELECT canonical_key INTO mapped
          FROM public.module_key_canonical_map
         WHERE legacy_key = v;
        new_arr := array_append(new_arr, COALESCE(mapped, v));
      END LOOP;
    END IF;
    UPDATE public.plans
       SET included_modules = ARRAY(
         SELECT DISTINCT unnest(new_arr)
       )
     WHERE id = r.id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;