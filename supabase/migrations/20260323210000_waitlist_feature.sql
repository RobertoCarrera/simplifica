-- ============================================================
-- Migration: 20260323210000_waitlist_feature.sql
-- Feature: Waitlist Feature — Phase 1 Foundation
-- Date: 2026-03-23 21:00:00
--
-- T01 Decision: Real table names are:
--   - public.waitlist          (NOT waitlist_entries)
--   - public.company_settings  (NOT booking_settings)
--
-- Rollback SQL is at the bottom of this file.
-- ============================================================

-- ============================================================
-- 0. waitlist — create table if it doesn't exist yet
--    (Table may already exist in production; IF NOT EXISTS ensures idempotency)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'waitlist_status' AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.waitlist_status AS ENUM ('pending', 'notified', 'expired', 'converted');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status public.waitlist_status NOT NULL DEFAULT 'pending',
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 1. services — per-service waitlist flags
-- ============================================================
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS enable_waitlist BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active_mode_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS passive_mode_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.services.enable_waitlist IS 'Master toggle: enables the waitlist UI for this service.';
COMMENT ON COLUMN public.services.active_mode_enabled IS 'Sub-flag: allow clients to join the active (slot-specific) waitlist.';
COMMENT ON COLUMN public.services.passive_mode_enabled IS 'Sub-flag: allow clients to subscribe to general service interest (passive mode).';

-- ============================================================
-- 2. company_settings — tenant-level waitlist configuration
-- ============================================================
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS waitlist_active_mode BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS waitlist_passive_mode BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS waitlist_auto_promote BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS waitlist_notification_window INTEGER NOT NULL DEFAULT 15;

COMMENT ON COLUMN public.company_settings.waitlist_active_mode IS 'Tenant-level override: enable/disable active waitlist mode globally.';
COMMENT ON COLUMN public.company_settings.waitlist_passive_mode IS 'Tenant-level override: enable/disable passive waitlist mode globally.';
COMMENT ON COLUMN public.company_settings.waitlist_auto_promote IS 'If true, system auto-promotes first pending active entry on cancellation.';
COMMENT ON COLUMN public.company_settings.waitlist_notification_window IS 'Minutes a client has to claim a notified passive spot before it expires.';

-- ============================================================
-- 3. waitlist — extend with mode, notified_at, converted_booking_id
-- ============================================================
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'active'
    CHECK (mode IN ('active', 'passive')),
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.waitlist.mode IS 'active = specific slot, passive = general service interest.';
COMMENT ON COLUMN public.waitlist.notified_at IS 'Timestamp when notification was sent (used for window expiry check).';
COMMENT ON COLUMN public.waitlist.converted_booking_id IS 'FK to booking created when this waitlist entry was converted.';

-- ============================================================
-- 4. Extend waitlist_status enum with new states
--    (PostgreSQL requires recreating the enum or using ALTER TYPE ADD VALUE)
-- ============================================================

-- Add 'converting' state (transient: entry has been promoted, booking being created)
ALTER TYPE public.waitlist_status ADD VALUE IF NOT EXISTS 'converting';

-- Add 'cancelled' state (client voluntarily left the waitlist)
ALTER TYPE public.waitlist_status ADD VALUE IF NOT EXISTS 'cancelled';

-- ============================================================
-- 5. Indexes for hot query paths
-- ============================================================

-- Index for active mode: find pending active entries for a slot
CREATE INDEX IF NOT EXISTS idx_waitlist_service_mode_status
  ON public.waitlist(service_id, mode, status)
  WHERE status = 'pending';

-- Index for active mode promote: first pending active entry for slot
CREATE INDEX IF NOT EXISTS idx_waitlist_service_slot
  ON public.waitlist(service_id, start_time, end_time)
  WHERE status = 'pending' AND mode = 'active';

-- Index for passive mode: find passive entries per service
CREATE INDEX IF NOT EXISTS idx_waitlist_passive_service
  ON public.waitlist(service_id, mode, status)
  WHERE status = 'pending' AND mode = 'passive';

-- Index for client lookups (my waitlist entries)
CREATE INDEX IF NOT EXISTS idx_waitlist_client_service
  ON public.waitlist(client_id, service_id);

-- ============================================================
-- 6. RLS — ensure waitlist table has RLS enabled and policies
-- ============================================================
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Company staff (admin/owner) can view all their company's waitlist entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'waitlist'
      AND policyname = 'Company members can view waitlist'
  ) THEN
    CREATE POLICY "Company members can view waitlist"
      ON public.waitlist FOR SELECT TO authenticated
      USING (company_id = public.get_user_company_id());
  END IF;
END $$;

-- Company admins can manage (insert/update/delete) waitlist entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'waitlist'
      AND policyname = 'Admins can manage waitlist'
  ) THEN
    CREATE POLICY "Admins can manage waitlist"
      ON public.waitlist FOR ALL TO authenticated
      USING (public.is_company_admin(company_id));
  END IF;
END $$;

-- Clients can view their own waitlist entries
-- NOTE: waitlist.client_id → FK to public.users (NOT public.clients)
-- Confirmed via supabase-db.types.ts: waitlist_client_id_fkey references public.users.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'waitlist'
      AND policyname = 'Clients can view own waitlist entries'
  ) THEN
    CREATE POLICY "Clients can view own waitlist entries"
      ON public.waitlist FOR SELECT TO authenticated
      USING (
        client_id IN (
          SELECT id FROM public.users
          WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Clients can insert their own waitlist entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'waitlist'
      AND policyname = 'Clients can join waitlist'
  ) THEN
    CREATE POLICY "Clients can join waitlist"
      ON public.waitlist FOR INSERT TO authenticated
      WITH CHECK (
        client_id IN (
          SELECT id FROM public.users
          WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- NOTE: The "Clients can cancel own waitlist entries" UPDATE policy is intentionally
-- NOT created here. It uses WITH CHECK (status = 'cancelled'), which references the
-- newly added enum value 'cancelled'. PostgreSQL does not allow referencing a newly
-- added enum value (via ALTER TYPE ADD VALUE) in the same transaction.
-- This policy is created in the next migration: 20260325_waitlist_rpcs.sql

-- ============================================================
-- 7. RPC: claim_waitlist_spot (atomic passive claim with row lock)
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_waitlist_spot(p_waitlist_entry_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry        public.waitlist%ROWTYPE;
  v_window       INTEGER;
  v_booking_id   UUID;
  v_client_id    UUID;   -- clients.id (FK from bookings.client_id)
  v_client_name  TEXT;
  v_client_email TEXT;
  v_caller_user_id UUID;  -- users.id of the authenticated caller
BEGIN
  -- ── Auth check: caller must own this waitlist entry ───────────────────────
  -- Resolve the calling user's users.id from auth.uid()
  SELECT u.id INTO v_caller_user_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_caller_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Lock the row; SKIP LOCKED returns no row if another transaction holds the lock
  SELECT * INTO v_entry
  FROM public.waitlist
  WHERE id = p_waitlist_entry_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'spot_taken');
  END IF;

  -- Ownership check: waitlist.client_id must match the authenticated user's users.id
  IF v_entry.client_id != v_caller_user_id THEN
    RETURN jsonb_build_object('error', 'permission_denied');
  END IF;

  -- Validate status
  IF v_entry.status != 'notified' THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  -- Validate notification window using company_settings
  SELECT COALESCE(waitlist_notification_window, 15)
  INTO v_window
  FROM public.company_settings
  WHERE company_id = v_entry.company_id;

  IF v_entry.notified_at IS NULL OR
     v_entry.notified_at < NOW() - (v_window || ' minutes')::INTERVAL THEN
    UPDATE public.waitlist
    SET status = 'expired', updated_at = NOW()
    WHERE id = p_waitlist_entry_id;
    RETURN jsonb_build_object('error', 'window_expired');
  END IF;

  -- Resolve clients.id from users.id
  -- NOTE: waitlist.client_id → FK to public.users (NOT public.clients)
  --       bookings.client_id → FK to public.clients
  -- We must look up the matching clients row via the auth_user_id of the user.
  SELECT c.id, c.name, c.email
  INTO v_client_id, v_client_name, v_client_email
  FROM public.clients c
  JOIN public.users u ON u.auth_user_id = c.auth_user_id
  WHERE u.id = v_entry.client_id
    AND c.company_id = v_entry.company_id
  LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('error', 'client_not_found');
  END IF;

  -- Check for duplicate booking overlap (using resolved clients.id)
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE client_id = v_client_id
      AND service_id = v_entry.service_id
      AND status != 'cancelled'
      AND tstzrange(start_time, end_time) &&
          tstzrange(v_entry.start_time::TIMESTAMPTZ, v_entry.end_time::TIMESTAMPTZ)
  ) THEN
    RETURN jsonb_build_object('error', 'already_booked');
  END IF;

  -- Create the booking
  INSERT INTO public.bookings(
    company_id, service_id, client_id,
    start_time, end_time, status,
    customer_name, customer_email
  )
  VALUES (
    v_entry.company_id,
    v_entry.service_id,
    v_client_id,
    v_entry.start_time::TIMESTAMPTZ,
    v_entry.end_time::TIMESTAMPTZ,
    'confirmed',
    v_client_name,
    v_client_email
  )
  RETURNING id INTO v_booking_id;

  -- Mark waitlist entry as converted
  UPDATE public.waitlist
  SET
    status = 'converted',
    converted_booking_id = v_booking_id,
    updated_at = NOW()
  WHERE id = p_waitlist_entry_id;

  RETURN jsonb_build_object('booking_id', v_booking_id);
END;
$$;

COMMENT ON FUNCTION public.claim_waitlist_spot(UUID)
  IS 'Atomically claims a passive waitlist spot. Verifies caller owns the entry (waitlist.client_id = auth.uid() → users.id). Uses SELECT FOR UPDATE SKIP LOCKED to prevent concurrent double-booking.';

-- ============================================================
-- ROLLBACK SQL (run manually if needed)
-- ============================================================
-- -- Remove services columns
-- ALTER TABLE public.services
--   DROP COLUMN IF EXISTS enable_waitlist,
--   DROP COLUMN IF EXISTS active_mode_enabled,
--   DROP COLUMN IF EXISTS passive_mode_enabled;
--
-- -- Remove company_settings columns
-- ALTER TABLE public.company_settings
--   DROP COLUMN IF EXISTS waitlist_active_mode,
--   DROP COLUMN IF EXISTS waitlist_passive_mode,
--   DROP COLUMN IF EXISTS waitlist_auto_promote,
--   DROP COLUMN IF EXISTS waitlist_notification_window;
--
-- -- Remove waitlist columns
-- ALTER TABLE public.waitlist
--   DROP COLUMN IF EXISTS mode,
--   DROP COLUMN IF EXISTS notified_at,
--   DROP COLUMN IF EXISTS converted_booking_id;
--
-- -- Remove indexes
-- DROP INDEX IF EXISTS public.idx_waitlist_service_mode_status;
-- DROP INDEX IF EXISTS public.idx_waitlist_service_slot;
-- DROP INDEX IF EXISTS public.idx_waitlist_passive_service;
-- DROP INDEX IF EXISTS public.idx_waitlist_client_service;
--
-- -- Remove RPC
-- DROP FUNCTION IF EXISTS public.claim_waitlist_spot(UUID);
--
-- -- Remove RLS policies (can't remove enum values in Postgres without type recreation)
-- DROP POLICY IF EXISTS "Company members can view waitlist" ON public.waitlist;
-- DROP POLICY IF EXISTS "Admins can manage waitlist" ON public.waitlist;
-- DROP POLICY IF EXISTS "Clients can view own waitlist entries" ON public.waitlist;
-- DROP POLICY IF EXISTS "Clients can join waitlist" ON public.waitlist;
-- DROP POLICY IF EXISTS "Clients can cancel own waitlist entries" ON public.waitlist;
-- NOTE: Enum values 'converting' and 'cancelled' cannot be easily removed from
-- waitlist_status. To rollback fully, recreate the enum without those values
-- after migrating any rows using them.
