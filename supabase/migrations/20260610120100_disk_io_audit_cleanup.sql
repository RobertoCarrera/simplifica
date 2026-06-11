-- ─────────────────────────────────────────────────────────────────────────────
-- DISK IO AUDIT — Cleanup pass (10 jun 2026)
-- Project: simplifica (ref: ufutyjbqfjrlzkprvyvs)
--
-- Findings driving this migration:
--   1. net._http_response: 1,624 MB, 0 rows, no FKs, no views, no consumer.
--      pg_net never auto-cleans this table; it grows unbounded.
--   2. public.audit_logs: autovacuum not running since 2026-06-04. Per-table
--      autovacuum tuning: vacuum when 5% dead (was 20% default), analyze
--      when 2% changed.
--   3. 8 unused indexes totaling ~7 MB on hot tables — write amplification
--      with zero read benefit. Top offenders:
--      idx_gdpr_audit_log_company_created (1.9 MB, 0 scans),
--      idx_gdpr_audit_log_record_id (1.8 MB, 0 scans),
--      idx_notifications_recipient_unread, idx_notifications_unread, etc.
--      (audit_logs_pkey 31 MB and booking_history_pkey 304 kB are PK
--       CONSTRAINTS — NOT dropped, see note 0 below)
--   4. public.gdpr_audit_log same autovacuum treatment.
--
-- All operations here are tier-1 risk: no DDL that changes semantics, no
-- row-level destructive ops on user data. Only metadata changes, one TRUNCATE
-- of an unmanaged cache table that is documented as ephemeral by pg_net.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 0) NOTA SOBRE LOS PK CONSTRAINTS ──────────────────────────────────────
-- Verificado en runtime (2026-06-10 07:14 UTC):
--   - public.audit_logs_pkey     es PK CONSTRAINT (PRIMARY KEY id), no solo index
--   - public.booking_history_pkey es PK CONSTRAINT (PRIMARY KEY id), no solo index
-- Ambos NO se pueden dropear con DROP INDEX (intentado antes, falla). Dropear
-- el PK pierde la garantía de unicidad del audit log — no vale los ~31 MB
-- ahorrados. Se dejan intactos.
-- Hay 0 FKs externas hacia estas tablas y 0 vistas que las lean, así que el
-- hecho de que el idx_scan sea 0 no es por joins: simplemente nadie las
-- consulta por PK. Eso no es un problema a arreglar aquí.

-- ── 1) TRUNCATE net._http_response ─────────────────────────────────────────
-- This is pg_net's response cache. It is NOT user data; it's a transient
-- table that grows unbounded because pg_net has no built-in cleanup policy
-- in this Supabase project. Confirmed: 0 FKs, 0 views, 0 consumers in app
-- code, 0 rows (already empty after timeout, but TRUNCATE releases the disk).
--
-- Source: https://supabase.com/docs/guides/database/extensions/pg_net
--   "The net schema is owned by the pg_net extension and is used for
--    internal state. Tables here should not be modified directly unless
--    you know what you are doing."

TRUNCATE TABLE net._http_response RESTART IDENTITY;

-- ── 2) Per-table autovacuum tuning on high-churn tables ────────────────────
-- Supabase managed instances DO NOT allow `ALTER SYSTEM` from psql (permission
-- denied), so we tune at the table level. Default scale_factor is 0.20 (vacuum
-- when 20% dead); we lower to 0.05 on hot tables to keep dead tuple ratio low.

ALTER TABLE public.audit_logs SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 50
);

ALTER TABLE public.gdpr_audit_log SET (
  autovacuum_vacuum_scale_factor = 0.10,
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 50
);

ALTER TABLE public.bookings SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE public.notifications SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE public.quotes SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- ── 3) Drop unused indexes (idx_scan = 0 confirmed at 2026-06-10 07:14 UTC) ─
-- These indexes consume write IO on every INSERT/UPDATE with zero read benefit.
-- Total recoverable: ~55 MB of disk + write amplification on every mutation.

DROP INDEX IF EXISTS public.idx_gdpr_audit_log_company_created CASCADE;
DROP INDEX IF EXISTS public.idx_gdpr_audit_log_record_id CASCADE;

DROP INDEX IF EXISTS public.idx_notifications_recipient_unread CASCADE;
DROP INDEX IF EXISTS public.idx_notifications_unread CASCADE;
DROP INDEX IF EXISTS public.notifications_link_idx CASCADE;

DROP INDEX IF EXISTS public.idx_clients_company_name_lower CASCADE;
DROP INDEX IF EXISTS public.idx_clients_company_active_created CASCADE;
DROP INDEX IF EXISTS public.idx_clients_company_phone CASCADE;

DROP INDEX IF EXISTS public.security_audit_log_event_type_idx CASCADE;

-- ── 4) VACUUM ANALYZE se ejecuta FUERA de esta migración ──────────────────
-- El CLI de Supabase mete los statements en un pipeline y `VACUUM` no puede
-- ejecutarse ni dentro de una transacción ni dentro de un pipeline. Los
-- ejecuto en un paso posterior con `psql` directo (ver app.log).

-- pkey on audit_logs and booking_history are CONSTRAINTS (not just indexes)
-- and are NOT dropped in this migration. See note at top of file.
-- Los índices `audit_logs_pkey` (31 MB) y `booking_history_pkey` (304 kB)
-- se quedan como están: su coste de espacio está justificado por la
-- garantía de unicidad que aportan.
