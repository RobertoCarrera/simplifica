-- Migration: Session Close Flow
-- Phase 1: Notify professional when session ends
-- Phase 2: Google Review email (GDPR-compliant with marketing_consent)
--
-- Adds:
--   - bookings: session_end_notified_at, session_confirmed_at, session_confirmed_by
--   - clients: has_left_google_review, google_review_date
--   - company_settings: google_review_url (configurable per company)

-- ── 1. Bookings table: session close tracking ──────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS session_end_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_confirmed_by uuid REFERENCES public.users(id);

COMMENT ON COLUMN bookings.session_end_notified_at IS 'Timestamp when the professional was notified that this session ended';
COMMENT ON COLUMN bookings.session_confirmed_at IS 'Timestamp when the professional confirmed the session took place';
COMMENT ON COLUMN bookings.session_confirmed_by IS 'User ID of the professional/owner who confirmed the session';

-- ── 2. Clients table: Google Review flags ─────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS has_left_google_review boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS google_review_date timestamptz;

COMMENT ON COLUMN clients.has_left_google_review IS 'True if the client has manually confirmed they left a Google Review (prevents spamming)';
COMMENT ON COLUMN clients.google_review_date IS 'Date when the client left the Google Review (if known)';

-- ── 3. Company settings: Google Review URL ────────────────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS google_review_url text;

COMMENT ON COLUMN company_settings.google_review_url IS 'Custom Google Review link configured by the company owner (e.g. https://g.page/r/XXXX/review)';

-- ── 4. Notifications table: add priority column ────────────────────────────────
-- Only add if it doesn't exist (may already exist from other migrations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'priority'
  ) THEN
    ALTER TABLE public.notifications
      ADD COLUMN priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
  END IF;
END $$;

COMMENT ON COLUMN notifications.priority IS 'Notification priority: low, medium, high (intrusive), urgent';

-- ── 5. RLS policies for new columns ────────────────────────────────────────────
-- Bookings: allow professionals to update their own session tracking columns
CREATE OR REPLACE POLICY "professionals_can_update_session_tracking"
  ON public.bookings
  FOR UPDATE
  USING (
    auth.uid() = bookings.professional_id
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = bookings.company_id
        AND cm.status = 'active'
        AND cm.role_id IN (
          SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin')
        )
    )
  )
  WITH CHECK (
    auth.uid() = bookings.professional_id
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = bookings.company_id
        AND cm.status = 'active'
        AND cm.role_id IN (
          SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin')
        )
    )
  );

-- Clients: allow staff to update review flags
CREATE OR REPLACE POLICY "staff_can_update_google_review_flags"
  ON public.clients
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = clients.company_id
        AND cm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = clients.company_id
        AND cm.status = 'active'
    )
  );

-- ── 6. RPC: confirm_session ────────────────────────────────────────────────────
-- Allows professional/owner to confirm a completed session
CREATE OR REPLACE FUNCTION confirm_session_rpc(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_booking_company_id uuid;
  v_professional_id uuid;
  v_client_id uuid;
  v_service_name text;
  v_client_name text;
  v_client_email text;
  v_marketing_consent boolean;
  v_google_review_url text;
  v_payment_status text;
  v_session_confirmed_at timestamptz := now();
BEGIN
  -- 1. Verify user has access
  SELECT company_id INTO v_company_id
  FROM public.users
  WHERE auth_user_id = v_user_id
    AND active = true
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not authorized or no company found';
  END IF;

  -- 2. Fetch booking
  SELECT company_id, professional_id, client_id, service_id, status
  INTO v_booking_company_id, v_professional_id, v_client_id, v_service_name, v_payment_status
  FROM public.bookings
  WHERE id = p_booking_id;

  IF v_booking_company_id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking_company_id != v_company_id THEN
    RAISE EXCEPTION 'Booking does not belong to your company';
  END IF;

  -- 3. Verify user is the professional or an owner/admin
  IF v_professional_id != (
    SELECT u.id FROM public.users u WHERE u.auth_user_id = v_user_id LIMIT 1
  ) AND NOT EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.app_roles ar ON ar.id = cm.role_id
    WHERE cm.user_id = v_user_id
      AND cm.company_id = v_company_id
      AND cm.status = 'active'
      AND ar.name IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only the assigned professional or an owner/admin can confirm this session';
  END IF;

  -- 4. Update booking
  UPDATE public.bookings
  SET
    session_confirmed_at = v_session_confirmed_at,
    session_confirmed_by = (
      SELECT id FROM public.users WHERE auth_user_id = v_user_id LIMIT 1
    ),
    updated_at = now()
  WHERE id = p_booking_id;

  -- 5. Return confirmation data (used by frontend to decide whether to send review email)
  SELECT
    c.marketing_consent,
    c.email,
    c.name,
    cs.google_review_url
  INTO v_marketing_consent, v_client_email, v_client_name, v_google_review_url
  FROM public.clients c
  LEFT JOIN public.company_settings cs ON cs.company_id = c.company_id
  WHERE c.id = v_client_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'session_confirmed_at', v_session_confirmed_at,
    'client_marketing_consent', v_marketing_consent,
    'client_email', v_client_email,
    'client_name', v_client_name,
    'google_review_url', v_google_review_url
  );
END;
$$;
