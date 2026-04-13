-- ============================================================
-- Migration: 20260323211000_waitlist_rpcs.sql
-- Feature: Waitlist Feature — Phase 2 RPCs + Rate Limiting
-- Date: 2026-03-23 21:10:00
--
-- Implements:
--   T05b — waitlist_rate_limits table (24h per-client-per-service rate limit)
--   T05  — notify_waitlist() RPC (SECURITY DEFINER, returns { notified, emails_to_send[] })
--   T06  — promote_waitlist() RPC (admin-only SECURITY DEFINER, returns promotion payload)
--
-- Depends on: 20260323210000_waitlist_feature.sql
--
-- IMPORTANT — notifications table schema (from supabase-db.types.ts):
--   columns: company_id, recipient_id (users.id), client_recipient_id (clients.id),
--            type, reference_id, title, content, is_read
--   NOT: user_id, data — those are not real columns.
--
-- IMPORTANT — users table uses `name` (+ `surname`), NOT `full_name`.
-- Display name is constructed as: COALESCE(name || ' ' || surname, name, email)
--
-- Rollback SQL is at the bottom of this file.
-- ============================================================

-- ============================================================
-- T05b: waitlist_rate_limits table
-- Purpose: DB-managed rate limiting for passive notifications.
-- 24h TTL per (company_id, service_id, user_id) triplet.
-- Managed exclusively by SECURITY DEFINER RPCs — no direct RLS needed.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.waitlist_rate_limits (
  company_id       UUID        NOT NULL REFERENCES public.companies(id)  ON DELETE CASCADE,
  service_id       UUID        NOT NULL REFERENCES public.services(id)   ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  last_notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, service_id, user_id)
);

COMMENT ON TABLE public.waitlist_rate_limits IS
  'Tracks last notification timestamp per client/service pair. Enforces 24h rate limit for passive waitlist notifications. Managed exclusively by SECURITY DEFINER RPCs — do not expose via RLS.';

COMMENT ON COLUMN public.waitlist_rate_limits.user_id IS
  'FK to public.users.id (waitlist.client_id target). NOT clients.id.';

-- Index for rate limit lookup inside notify_waitlist loop
CREATE INDEX IF NOT EXISTS idx_waitlist_rate_limits_lookup
  ON public.waitlist_rate_limits(company_id, service_id, user_id);

-- Index for periodic cleanup of stale records (older than 24h+)
CREATE INDEX IF NOT EXISTS idx_waitlist_rate_limits_last_notified
  ON public.waitlist_rate_limits(last_notified_at);

-- ============================================================
-- T06: promote_waitlist() RPC
-- Purpose: Admin-only. Promotes the first pending active entry.
--   - Checks waitlist_auto_promote setting.
--   - Uses SELECT FOR UPDATE SKIP LOCKED to prevent race conditions.
--   - Inserts in-app notification.
--   - Returns full email payload for Angular to dispatch via send-waitlist-email.
-- ============================================================

CREATE OR REPLACE FUNCTION public.promote_waitlist(
  p_service_id  UUID,
  p_start_time  TIMESTAMPTZ,
  p_end_time    TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id    UUID;
  v_auto_promote  BOOLEAN;
  v_entry         public.waitlist%ROWTYPE;
  v_client_email  TEXT;
  v_client_name   TEXT;
  v_service_name  TEXT;
  v_recipient_id  UUID;  -- users.id for notification recipient
BEGIN
  -- Derive company_id from auth context — never trust caller
  SELECT u.company_id INTO v_company_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Check admin role via shared helper
  IF NOT public.is_company_admin(v_company_id) THEN
    RETURN jsonb_build_object('error', 'permission_denied');
  END IF;

  -- Read auto-promote setting (default true if not configured)
  SELECT COALESCE(cs.waitlist_auto_promote, true)
  INTO v_auto_promote
  FROM public.company_settings cs
  WHERE cs.company_id = v_company_id
  LIMIT 1;

  IF v_auto_promote IS NULL THEN
    v_auto_promote := true;
  END IF;

  -- If auto-promote disabled, signal Angular to use notify instead
  IF NOT v_auto_promote THEN
    RETURN jsonb_build_object(
      'promoted', false,
      'notify_instead', true
    );
  END IF;

  -- Lock the first pending active entry for this slot (SKIP LOCKED = no wait)
  SELECT * INTO v_entry
  FROM public.waitlist w
  WHERE w.service_id  = p_service_id
    AND w.company_id  = v_company_id
    AND w.start_time  = p_start_time
    AND w.end_time    = p_end_time
    AND w.status      = 'pending'
    AND w.mode        = 'active'
  ORDER BY w.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'promoted', false,
      'message', 'no_pending_entries'
    );
  END IF;

  -- Promote: mark as converting
  UPDATE public.waitlist
  SET
    status      = 'converting',
    notified_at = NOW(),
    updated_at  = NOW()
  WHERE id = v_entry.id;

  -- Resolve client's email and name from users table
  -- (waitlist.client_id → users.id; users has `name` + `surname` columns, NOT full_name)
  SELECT u.email,
         COALESCE(NULLIF(TRIM(COALESCE(u.name,'') || ' ' || COALESCE(u.surname,'')), ''), u.email),
         u.id
  INTO v_client_email, v_client_name, v_recipient_id
  FROM public.users u
  WHERE u.id = v_entry.client_id
  LIMIT 1;

  -- Resolve service name
  SELECT s.name INTO v_service_name
  FROM public.services s
  WHERE s.id = p_service_id
  LIMIT 1;

  -- Insert in-app notification for the promoted client
  -- Using notifications schema: recipient_id (users.id), reference_id, title, content
  IF v_recipient_id IS NOT NULL THEN
    INSERT INTO public.notifications(
      company_id,
      recipient_id,
      type,
      reference_id,
      title,
      content,
      is_read
    ) VALUES (
      v_company_id,
      v_recipient_id,
      'waitlist_promoted',
      v_entry.id,
      '¡Plaza disponible! - ' || COALESCE(v_service_name, 'Servicio'),
      'Se ha liberado una plaza para ' || COALESCE(v_service_name, 'el servicio') ||
        '. Tienes prioridad para reservar.',
      false
    );
  END IF;

  RETURN jsonb_build_object(
    'promoted',      true,
    'waitlist_id',   v_entry.id,
    'client_email',  v_client_email,
    'client_name',   v_client_name,
    'service_name',  COALESCE(v_service_name, 'Servicio')
  );
END;
$$;

COMMENT ON FUNCTION public.promote_waitlist(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  IS 'Admin-only RPC. Promotes first pending active waitlist entry on slot cancellation. '
     'Returns email payload for Angular to dispatch via send-waitlist-email Edge Function. '
     'Uses SELECT FOR UPDATE SKIP LOCKED for concurrency safety.';

GRANT EXECUTE ON FUNCTION public.promote_waitlist(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;

-- ============================================================
-- T05: notify_waitlist() RPC
-- Purpose: DB logic for notification dispatch.
--   Active mode: notifies first pending active entry (same as promote but without auto-promote check).
--   Passive mode: bulk-notifies all pending passive entries respecting 24h rate limit.
--   Returns { notified: N, emails_to_send: [{email, name, service_name, waitlist_id}] }
--   for Angular to dispatch one-by-one via send-waitlist-email.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_waitlist(
  p_service_id  UUID,
  p_start_time  TIMESTAMPTZ,
  p_end_time    TIMESTAMPTZ,
  p_mode        TEXT DEFAULT 'active'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id      UUID;
  v_service_name    TEXT;
  v_entry           public.waitlist%ROWTYPE;
  v_emails          JSONB    := '[]'::JSONB;
  v_count           INTEGER  := 0;
  v_last_notified   TIMESTAMPTZ;
  v_client_email    TEXT;
  v_client_name     TEXT;
  v_recipient_id    UUID;
BEGIN
  -- Derive company_id from auth context — never trust caller
  SELECT u.company_id INTO v_company_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Admin check
  IF NOT public.is_company_admin(v_company_id) THEN
    RETURN jsonb_build_object('error', 'permission_denied');
  END IF;

  -- Resolve service name once
  SELECT s.name INTO v_service_name
  FROM public.services s
  WHERE s.id = p_service_id
  LIMIT 1;

  -- Iterate over pending entries matching the mode.
  -- Active mode: filter by exact slot time (p_start_time / p_end_time) so we only
  --   notify the correct session — not every pending active entry for the service.
  -- Passive mode: slot-agnostic, so start_time/end_time are not filtered.
  FOR v_entry IN
    SELECT * FROM public.waitlist w
    WHERE w.service_id = p_service_id
      AND w.company_id = v_company_id
      AND w.status     = 'pending'
      AND w.mode       = p_mode
      AND (
        p_mode = 'passive'
        OR (w.start_time = p_start_time AND w.end_time = p_end_time)
      )
    ORDER BY w.created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- ── Rate limiting (passive mode only) ────────────────────────────────
    IF p_mode = 'passive' THEN
      SELECT rl.last_notified_at INTO v_last_notified
      FROM public.waitlist_rate_limits rl
      WHERE rl.company_id = v_company_id
        AND rl.service_id = p_service_id
        AND rl.user_id    = v_entry.client_id;

      -- Skip if notified within the last 24 hours
      CONTINUE WHEN v_last_notified IS NOT NULL
        AND v_last_notified > (NOW() - INTERVAL '24 hours');
    END IF;

    -- ── Update waitlist entry status ─────────────────────────────────────
    UPDATE public.waitlist
    SET
      status      = 'notified',
      notified_at = NOW(),
      updated_at  = NOW()
    WHERE id = v_entry.id;

    -- ── Upsert rate limit record (passive mode only) ─────────────────────
    IF p_mode = 'passive' THEN
      INSERT INTO public.waitlist_rate_limits(
        company_id, service_id, user_id, last_notified_at
      )
      VALUES (v_company_id, p_service_id, v_entry.client_id, NOW())
      ON CONFLICT (company_id, service_id, user_id)
      DO UPDATE SET last_notified_at = NOW();
    END IF;

    -- ── Resolve client contact info ───────────────────────────────────────
    -- users table has `name` + `surname` columns, NOT full_name
    SELECT u.email,
           COALESCE(NULLIF(TRIM(COALESCE(u.name,'') || ' ' || COALESCE(u.surname,'')), ''), u.email),
           u.id
    INTO v_client_email, v_client_name, v_recipient_id
    FROM public.users u
    WHERE u.id = v_entry.client_id
    LIMIT 1;

    -- ── Insert in-app notification ────────────────────────────────────────
    IF v_recipient_id IS NOT NULL THEN
      INSERT INTO public.notifications(
        company_id,
        recipient_id,
        type,
        reference_id,
        title,
        content,
        is_read
      ) VALUES (
        v_company_id,
        v_recipient_id,
        CASE p_mode
          WHEN 'passive' THEN 'waitlist_passive_notified'
          ELSE 'waitlist_active_notified'
        END,
        v_entry.id,
        '¡Plaza disponible! - ' || COALESCE(v_service_name, 'Servicio'),
        CASE p_mode
          WHEN 'passive' THEN
            'Se ha liberado una plaza para ' || COALESCE(v_service_name, 'el servicio') ||
            '. Entra a reservar antes de que expire.'
          ELSE
            'Se ha liberado una plaza para ' || COALESCE(v_service_name, 'el servicio') ||
            '. Tienes prioridad para reservar.'
        END,
        false
      );
    END IF;

    -- ── Append to email dispatch list ─────────────────────────────────────
    v_emails := v_emails || jsonb_build_array(
      jsonb_build_object(
        'email',        v_client_email,
        'name',         v_client_name,
        'service_name', COALESCE(v_service_name, 'Servicio'),
        'waitlist_id',  v_entry.id
      )
    );
    v_count := v_count + 1;

    -- ── Active mode: only process the first pending entry ─────────────────
    EXIT WHEN p_mode = 'active';
  END LOOP;

  RETURN jsonb_build_object(
    'notified',      v_count,
    'emails_to_send', v_emails
  );
END;
$$;

COMMENT ON FUNCTION public.notify_waitlist(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  IS 'Admin-only RPC. Notifies pending waitlist entries on slot cancellation. '
     'Active mode: processes first entry only. Passive mode: bulk-notifies all within 24h rate limit. '
     'Returns emails_to_send[] for Angular to dispatch via send-waitlist-email Edge Function.';

GRANT EXECUTE ON FUNCTION public.notify_waitlist(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  TO authenticated;

-- ============================================================
-- Waitlist UPDATE policy (moved from 20260324_waitlist_feature.sql)
-- ============================================================

-- Clients can update (cancel) their own pending entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'waitlist'
      AND policyname = 'Clients can cancel own waitlist entries'
  ) THEN
    CREATE POLICY "Clients can cancel own waitlist entries"
      ON public.waitlist FOR UPDATE TO authenticated
      USING (
        client_id IN (
          SELECT id FROM public.users
          WHERE auth_user_id = auth.uid()
        )
        AND status IN ('pending', 'notified')
      )
      WITH CHECK (status = 'cancelled');
  END IF;
END $$;

-- ============================================================
-- ROLLBACK SQL (run manually if needed)
-- ============================================================
-- DROP POLICY IF EXISTS "Clients can cancel own waitlist entries" ON public.waitlist;
-- DROP FUNCTION IF EXISTS public.notify_waitlist(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);
-- DROP FUNCTION IF EXISTS public.promote_waitlist(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
-- DROP TABLE IF EXISTS public.waitlist_rate_limits;
