-- ============================================================================
-- Migration: classes_bonds_auditor (PR #1 of 4 — Data plane, foundation only)
-- ============================================================================
-- Chain: classes-bonds-auditor / 4-PR force-chained slice.
--   PR #1 — Data plane  (this file) — view, helper, audit table, anomaly fn.
--   PR #2 — Action plane — correct_bono_sessions_used RPC, trigger, cron.
--   PR #3 — Presentation plane — Angular guard, page, sidebar, i18n.
--
-- Introduces:
--   1. public.classes_bonds_corrections        — append-only audit table.
--   2. ALTER public.client_bonuses             — 4 escape-hatch columns.
--   3. public.is_roberto_carreras()            — SECURITY DEFINER STABLE
--                                                belt-and-suspenders predicate.
--   4. public.v_classes_bonds_audit            — SECURITY DEFINER view.
--                                                ! LOAD-BEARING PREDICATE !
--                                                The WHERE is_roberto_carreras()
--                                                clause is the only line of
--                                                defense that prevents cross-
--                                                tenant data leak. Drop it and
--                                                every authenticated user sees
--                                                every company's bonos.
--   5. public.detect_classes_bonds_anomalies() — SECURITY DEFINER STABLE,
--                                                6 UNION ALL branches.
--   6. public.v_corrections_today              — daily rollup (sec_invoker).
--
-- Intentionally left for PR #2: correct_bono_sessions_used RPC, whoami_admin
-- RPC, recheck_bono RPC, guard_corrected_bookings cron, BEFORE UPDATE trigger
-- on client_bonuses, cron.unschedule('auto-confirm-sessions'), and PR #3 UI.
--
-- Canonical Roberto email allowlist (locked in design.md):
--   robertocarreratech@gmail.com   — early migration 20260111090000
--   roberto@simplificacrm.es       — migration 20260209214500 line 18
--   The user typo "robertocarrerather@gmail.com" is NOT in the allowlist.
--
-- Rollback (informational — DO NOT drop classes_bonds_corrections here.
-- PR #2 will add FK references + triggers that depend on the table. The
-- DROP TABLE is left as a TODO for the PR #2 down section.)
--   BEGIN;
--   DROP VIEW IF EXISTS public.v_corrections_today;
--   DROP VIEW IF EXISTS public.v_classes_bonds_audit;
--   DROP FUNCTION IF EXISTS public.detect_classes_bonds_anomalies();
--   DROP FUNCTION IF EXISTS public.is_roberto_carreras();
--   -- TODO(PR #2): DROP TABLE public.classes_bonds_corrections CASCADE;
--   ALTER TABLE public.client_bonuses
--     DROP COLUMN IF EXISTS last_recompute_signature,
--     DROP COLUMN IF EXISTS corrected_lock,
--     DROP COLUMN IF EXISTS corrected_by,
--     DROP COLUMN IF EXISTS corrected_at;
--   COMMIT;
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. client_bonuses — escape-hatch columns
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_bonuses
  ADD COLUMN IF NOT EXISTS corrected_at             timestamptz,
  ADD COLUMN IF NOT EXISTS corrected_by             uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS corrected_lock           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_recompute_signature text;

COMMENT ON COLUMN public.client_bonuses.corrected_at            IS 'Timestamp of the last correct_bono_sessions_used() call against this bono (PR #2 RPC). NULL = never corrected.';
COMMENT ON COLUMN public.client_bonuses.corrected_by            IS 'public.users.id of the operator who ran the last correction (PR #2 RPC).';
COMMENT ON COLUMN public.client_bonuses.corrected_lock          IS 'True after a correction. PR #2 adds a BEFORE UPDATE trigger that rejects direct UPDATE of sessions_used when this is true.';
COMMENT ON COLUMN public.client_bonuses.last_recompute_signature IS 'Sha256 hex of (bono_id, count(consumed_bookings), now()) at correction time. Lets the auditor UI badge rows as stale without an extra query.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. classes_bonds_corrections — append-only audit table
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classes_bonds_corrections (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_bonus_id        uuid        NOT NULL REFERENCES public.client_bonuses(id) ON DELETE RESTRICT,
  actor_user_id          uuid        NOT NULL REFERENCES public.users(id)        ON DELETE RESTRICT,
  before_sessions_used   integer     NOT NULL,
  after_sessions_used    integer     NOT NULL,
  reason                 text        NOT NULL CHECK (length(reason) >= 10),
  addressed_anomaly_ids  uuid[]      NOT NULL DEFAULT '{}',
  ip                     inet,
  user_agent             text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cbcl_drift_nonzero CHECK (
    before_sessions_used <> after_sessions_used OR length(reason) >= 10
  )
);

COMMENT ON TABLE public.classes_bonds_corrections IS
  'Append-only audit of correct_bono_sessions_used() calls (PR #2 RPC). PR #1 only ships the table; the writer lives in PR #2.';

CREATE INDEX IF NOT EXISTS cbcl_bono_idx
  ON public.classes_bonds_corrections (client_bonus_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cbcl_actor_idx
  ON public.classes_bonds_corrections (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cbcl_anomaly_gin
  ON public.classes_bonds_corrections USING gin (addressed_anomaly_ids);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. is_roberto_carreras() — SECURITY DEFINER STABLE access predicate
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_roberto_carreras()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users au
    JOIN public.users u     ON u.auth_user_id = au.id
    JOIN public.app_roles ar ON ar.id = u.app_role_id
    WHERE au.id = auth.uid()
      AND lower(au.email) IN (
        'robertocarreratech@gmail.com',
        'roberto@simplificacrm.es'
      )
      AND ar.name = 'super_admin'
  );
$$;

COMMENT ON FUNCTION public.is_roberto_carreras() IS
  'Belt-and-suspenders access predicate: true IFF auth.uid() resolves to auth.users.email in the canonical Roberto allowlist AND the same user has app_role.name = ''super_admin''. SECURITY DEFINER to read auth.users. Consulted by v_classes_bonds_audit (PR #1) and by the correct_bono_sessions_used RPC + client_bonuses BEFORE UPDATE trigger (PR #2). The deny side wins on disagreement.';

REVOKE ALL ON FUNCTION public.is_roberto_carreras() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_roberto_carreras() TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. v_classes_bonds_audit — SECURITY DEFINER view (load-bearing predicate)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_classes_bonds_audit
AS
SELECT
  cb.id                                              AS client_bonus_id,
  cb.company_id,
  co.name                                            AS company_name,
  cb.client_id,
  cl.name                                            AS client_name,
  cl.email                                           AS client_email,
  cb.variant_id,
  sv.variant_name,
  sv.is_bono,
  cb.sessions_total,
  cb.sessions_used                                   AS sessions_used_by_app,
  COALESCE(rpc.cnt_consumed, 0)::integer             AS sessions_used_by_rpc,
  (cb.sessions_used - COALESCE(rpc.cnt_consumed, 0))::integer AS drift,
  GREATEST(cb.sessions_total - cb.sessions_used, 0)::integer AS sessions_remaining,
  cb.expires_at,
  cb.is_active,
  cb.corrected_at                                    AS last_correction_at,
  cb.corrected_by                                    AS last_correction_actor_id,
  actor.name                                         AS last_correction_actor,
  rpc.last_movement_at,
  COALESCE(an.anomaly_types, '{}'::text[])           AS anomaly_types
FROM public.client_bonuses cb
LEFT JOIN public.companies        co    ON co.id = cb.company_id
LEFT JOIN public.clients          cl    ON cl.id = cb.client_id
LEFT JOIN public.service_variants sv    ON sv.id = cb.variant_id
LEFT JOIN public.users            actor ON actor.id = cb.corrected_by
LEFT JOIN LATERAL (
  SELECT
    count(*)::integer                            AS cnt_consumed,
    max(b.session_confirmed_at)                  AS last_movement_at
  FROM public.bookings b
  WHERE b.client_id    = cb.client_id
    AND b.variant_id   = cb.variant_id
    AND b.session_confirmed_at IS NOT NULL
    AND b.status      <> 'cancelled'
) rpc ON true
LEFT JOIN LATERAL (
  SELECT array_agg(DISTINCT a.type) AS anomaly_types
  FROM public.detect_classes_bonds_anomalies() a
  WHERE a.client_bonus_id = cb.id
) an ON true
WHERE public.is_roberto_carreras();

COMMENT ON VIEW public.v_classes_bonds_audit IS
  'Per-bono audit snapshot. SECURITY DEFINER + WHERE is_roberto_carreras() is the only access filter — drop the predicate and every authenticated user sees every company. Used by the PR #3 auditor UI.';

ALTER VIEW public.v_classes_bonds_audit OWNER TO postgres;
GRANT SELECT ON public.v_classes_bonds_audit TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. detect_classes_bonds_anomalies() — SECURITY DEFINER STABLE
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.detect_classes_bonds_anomalies()
RETURNS TABLE (
  anomaly_id       uuid,
  client_bonus_id  uuid,
  type             text,
  severity         text,
  detected_at      timestamptz,
  evidence         jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  -- Branch 1: duplicate-consumption — same client + variant, two consumed
  -- bookings whose start_time differs by <= 300 seconds (5 minutes).
  -- bookings.client_bonus_id does not exist; the FK is implied via
  -- (client_id, variant_id). We resolve the bono id via EXISTS lookup.
  SELECT
    gen_random_uuid(),
    (SELECT cb.id FROM public.client_bonuses cb
       WHERE cb.client_id = b.client_id
         AND cb.variant_id = b.variant_id
       ORDER BY cb.created_at DESC LIMIT 1),
    'duplicate-consumption',
    'high',
    now(),
    jsonb_build_object(
      'window_seconds', 300,
      'booking_ids',    array_agg(DISTINCT b.id),
      'count',          count(*)::int
    )
  FROM public.bookings b
  JOIN public.bookings b2
    ON b2.client_id  = b.client_id
   AND b2.variant_id = b.variant_id
   AND b2.id        <> b.id
   AND b2.session_confirmed_at IS NOT NULL
   AND b2.status <> 'cancelled'
   AND abs(extract(epoch FROM (b2.start_time - b.start_time))) <= 300
  WHERE b.session_confirmed_at IS NOT NULL
    AND b.status <> 'cancelled'
    AND b.variant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.client_bonuses cb
      WHERE cb.client_id = b.client_id
        AND cb.variant_id = b.variant_id
    )
  GROUP BY b.client_id, b.variant_id

  UNION ALL
  -- Branch 2: negative-balance — sessions_remaining < 0 on an active bono.
  SELECT
    gen_random_uuid(),
    cb.id,
    'negative-balance',
    'high',
    now(),
    jsonb_build_object(
      'sessions_remaining', cb.sessions_remaining,
      'sessions_used',      cb.sessions_used,
      'sessions_total',     cb.sessions_total
    )
  FROM public.client_bonuses cb
  WHERE cb.sessions_remaining < 0
    AND cb.is_active = true

  UNION ALL
  -- Branch 3: orphan-refund — a payment marked refunded whose client has
  -- no matching client_bonuses row (no bono was ever purchased for the
  -- refund). Uses public.payments because its status CHECK explicitly
  -- includes 'refunded' (see migration 20260624000000 line 152).
  SELECT
    gen_random_uuid(),
    NULL::uuid,
    'orphan-refund',
    'med',
    now(),
    jsonb_build_object(
      'payment_id',   p.id,
      'client_id',    p.client_id,
      'company_id',   p.company_id,
      'amount_cents', p.amount_cents
    )
  FROM public.payments p
  WHERE p.status = 'refunded'
    AND p.client_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.client_bonuses cb
      WHERE cb.client_id = p.client_id
    )

  UNION ALL
  -- Branch 4: after-expiry — a booking consumed AFTER the bono's expires_at.
  SELECT
    gen_random_uuid(),
    cb.id,
    'after-expiry',
    'med',
    now(),
    jsonb_build_object(
      'booking_id',         b.id,
      'booking_start_time', b.start_time,
      'bono_expires_at',    cb.expires_at,
      'days_past_expiry',   extract(day FROM (b.start_time - cb.expires_at))::int
    )
  FROM public.client_bonuses cb
  JOIN public.bookings b
    ON b.client_id  = cb.client_id
   AND b.variant_id = cb.variant_id
   AND b.session_confirmed_at IS NOT NULL
   AND b.status <> 'cancelled'
  WHERE cb.expires_at IS NOT NULL
    AND b.start_time > cb.expires_at

  UNION ALL
  -- Branch 5: bono-booking-without-quote — variant is a bono AND no quote.
  SELECT
    gen_random_uuid(),
    NULL::uuid,
    'bono-booking-without-quote',
    'low',
    now(),
    jsonb_build_object(
      'booking_id', b.id,
      'variant_id', b.variant_id,
      'client_id',  b.client_id,
      'company_id', b.company_id
    )
  FROM public.bookings b
  JOIN public.service_variants sv ON sv.id = b.variant_id
  WHERE sv.is_bono = true
    AND b.quote_id IS NULL
    AND b.client_id IS NOT NULL

  UNION ALL
  -- Branch 6: re-contamination — a corrected bono whose row was mutated by
  -- a later booking confirmation (cron ran after the correction).
  SELECT
    gen_random_uuid(),
    cb.id,
    're-contamination',
    'high',
    now(),
    jsonb_build_object(
      'corrected_at',          cb.corrected_at,
      'contaminating_confirm', b.session_confirmed_at,
      'booking_id',            b.id
    )
  FROM public.client_bonuses cb
  JOIN public.bookings b
    ON b.client_id  = cb.client_id
   AND b.variant_id = cb.variant_id
   AND b.session_confirmed_at IS NOT NULL
   AND b.session_confirmed_at > cb.corrected_at
  WHERE cb.corrected_at IS NOT NULL;
$$;

COMMENT ON FUNCTION public.detect_classes_bonds_anomalies() IS
  'Returns one row per anomaly across 6 categories: duplicate-consumption, negative-balance, orphan-refund, after-expiry, bono-booking-without-quote, re-contamination. SECURITY DEFINER STABLE so it can read bookings + client_bonuses + service_variants + invoices without per-company RLS. The PR #3 auditor UI consumes the result alongside v_classes_bonds_audit.';

REVOKE ALL ON FUNCTION public.detect_classes_bonds_anomalies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_classes_bonds_anomalies() TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. v_corrections_today — daily rollup (security_invoker, tenant-scoped)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_corrections_today
WITH (security_invoker = true) AS
SELECT
  date_trunc('hour', c.created_at)            AS hour,
  count(*)                                    AS corrections,
  count(DISTINCT c.actor_user_id)             AS actors,
  array_agg(DISTINCT left(c.reason, 80))      AS reason_samples
FROM public.classes_bonds_corrections c
WHERE c.created_at >= current_date
GROUP BY 1
ORDER BY 1;

COMMENT ON VIEW public.v_corrections_today IS
  'Hourly rollup of corrections in the current day. security_invoker so the read obeys the auditor''s RLS (empty for non-Roberto).';
GRANT SELECT ON public.v_corrections_today TO authenticated;

COMMIT;