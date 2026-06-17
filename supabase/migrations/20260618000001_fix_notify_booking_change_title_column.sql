-- ============================================================================
-- Hotfix: notify_booking_change() + trg_fn_bookings_notify_change() reference
-- columns that do not exist in the current schema. Every call has been
-- failing silently since the schema drift, with the trigger's
-- `EXCEPTION WHEN OTHERS` catching the error and logging a WARNING.
--
-- Broken references found on 2026-06-18:
--   b.title              -> does not exist (real: customer_name)
--   b.service_name       -> does not exist
--   b.starts_at          -> does not exist (real: start_time)
--   notifications.entity_id, entity_type, kind, user_id, audience, read
--                          -> none exist (real: reference_id, type, recipient_id,
--                              profile_type, is_read)
--   NEW.starts_at (trigger) -> does not exist (real: start_time)
--   clients.user_id      -> does not exist (real: auth_user_id)
--   (professionals.user_id DOES exist, unchanged)
--
-- Result in production: every docplanner sync run logged 5-10 errors like
-- `column bookings.title does not exist` (visible in postgres logs), the
-- in-app notifications for bookings were silently never inserted by this
-- path, and the unrelated `on_booking_changes -> notify_booking_notifier`
-- path was the only thing producing rows in `notifications` (which is why
-- the 434-spam symptom was visible).
--
-- Fix: rewrite the function to match the real schema. Surgical: keep the
-- signature, audience logic, settings checks, and edge call identical to
-- the original. Only column references change. The `EXCEPTION WHEN OTHERS`
-- in the trigger is preserved so a future regression doesn't break updates.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_booking_change(
  p_booking_id uuid,
  p_change_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_company_id      uuid;
  v_booking_title   text;
  v_booking_starts  timestamptz;
  v_booking_client  uuid;
  v_booking_pro     uuid;
  v_client_user_id  uuid;
  v_pro_user_id     uuid;
  v_settings        public.budget_notification_settings%ROWTYPE;
  v_title           text;
  v_body            text;
  v_audiences       text[] := '{}';
  v_inserted        integer := 0;
  v_edge_url        text;
  v_request_id      bigint;
  v_supabase_url    text;
BEGIN
  -- Resolve the booking and its relations. We use the *current* row
  -- (post-change) to build the user-facing message.
  --
  -- HOTFIX 2026-06-18: column names corrected to match real schema.
  --   b.title, b.service_name -> b.customer_name
  --   b.starts_at            -> b.start_time
  SELECT
    b.company_id,
    COALESCE(NULLIF(b.customer_name, ''), 'Tu reserva'),
    b.start_time,
    b.client_id,
    b.professional_id
  INTO
    v_company_id, v_booking_title, v_booking_starts,
    v_booking_client, v_booking_pro
  FROM public.bookings b
  WHERE b.id = p_booking_id;

  IF v_company_id IS NULL THEN
    RAISE WARNING '[notify_booking_change] booking % not found', p_booking_id;
    RETURN 0;
  END IF;

  -- Load company settings (1 row per company).
  SELECT * INTO v_settings
  FROM public.budget_notification_settings
  WHERE company_id = v_company_id;

  IF NOT FOUND THEN
    -- No row yet: default to NOT notifying. Seed migration
    -- (20260610000000) creates one row per company on the fly.
    RETURN 0;
  END IF;

  -- Build the user-facing copy per change_type.
  v_title := CASE p_change_type
    WHEN 'created'     THEN 'Nueva reserva creada'
    WHEN 'updated'     THEN 'Tu reserva se ha modificado'
    WHEN 'rescheduled' THEN 'Tu reserva se ha reagendado'
    WHEN 'cancelled'   THEN 'Tu reserva se ha cancelado'
    WHEN 'deleted'     THEN 'Tu reserva se ha eliminado'
    ELSE 'Cambio en tu reserva'
  END;
  v_body := COALESCE(v_booking_title, 'Reserva')
            || ' — '
            || to_char(v_booking_starts AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY HH24:MI');

  -- Resolve client + professional to their user_ids (if any).
  -- HOTFIX v2 2026-06-18: clients.user_id -> clients.auth_user_id
  IF v_booking_client IS NOT NULL THEN
    SELECT auth_user_id INTO v_client_user_id
    FROM public.clients WHERE id = v_booking_client;
  END IF;
  IF v_booking_pro IS NOT NULL THEN
    SELECT user_id INTO v_pro_user_id
    FROM public.professionals WHERE id = v_booking_pro;
  END IF;

  -- Decide which audiences are opted-in for in-app.
  IF v_settings.booking_inapp_enabled THEN
    IF v_settings.booking_notify_client       AND v_client_user_id IS NOT NULL THEN
      v_audiences := array_append(v_audiences, 'client');
    END IF;
    IF v_settings.booking_notify_professional AND v_pro_user_id    IS NOT NULL THEN
      v_audiences := array_append(v_audiences, 'professional');
    END IF;
    -- Admin in-app notifications are sent to all company_members with
    -- role in (admin, owner, super_admin) for the booking's company.
    IF v_settings.booking_notify_admin THEN
      v_audiences := array_append(v_audiences, 'admin');
    END IF;
  END IF;

  -- In-app notifications (one row per audience, with dedupe window).
  -- HOTFIX 2026-06-18: column names corrected for notifications table.
  --   user_id      -> recipient_id
  --   audience     -> profile_type
  --   entity_id    -> reference_id
  --   entity_type  -> dropped (always 'booking' for this fn)
  --   kind         -> type
  --   read         -> is_read
  IF array_length(v_audiences, 1) > 0 THEN
    WITH dedup AS (
      SELECT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.reference_id = p_booking_id
          AND n.type         = p_change_type
          AND n.created_at  > now() - interval '5 minutes'
      ) AS already
    )
    INSERT INTO public.notifications
      (company_id, recipient_id, profile_type, reference_id, type, title, content, is_read, created_at)
    SELECT
      v_company_id,
      CASE a
        WHEN 'client'       THEN v_client_user_id
        WHEN 'professional' THEN v_pro_user_id
        WHEN 'admin'        THEN NULL  -- broadcast to all admins
      END,
      a,
      p_booking_id,
      p_change_type,
      v_title,
      v_body,
      false,
      now()
    FROM unnest(v_audiences) AS a
    WHERE NOT (SELECT already FROM dedup)
      AND CASE a
            WHEN 'client'       THEN v_client_user_id
            WHEN 'professional' THEN v_pro_user_id
            WHEN 'admin'        THEN NULL
          END IS NOT NULL OR a = 'admin';

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  -- Email notifications: only if master switch + audience flags on.
  IF v_settings.booking_email_enabled THEN
    BEGIN
      v_supabase_url := current_setting('app.settings.supabase_url', true);
    EXCEPTION WHEN OTHERS THEN
      v_supabase_url := NULL;
    END;

    IF v_supabase_url IS NOT NULL THEN
      v_edge_url := v_supabase_url || '/functions/v1/notify-booking-change';

      -- Fire-and-forget; we don't wait for the response.
      SELECT net.http_post(
        url     := v_edge_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
        ),
        body    := jsonb_build_object(
          'booking_id',   p_booking_id,
          'company_id',   v_company_id,
          'change_type',  p_change_type,
          'notify_client',       v_settings.booking_notify_client,
          'notify_professional', v_settings.booking_notify_professional,
          'notify_admin',        v_settings.booking_notify_admin,
          'cc_admin',            v_settings.booking_email_cc_admin
        )
      ) INTO v_request_id;
    END IF;
  END IF;

  RETURN v_inserted;
END;
$func$;

COMMENT ON FUNCTION public.notify_booking_change(uuid, text) IS
  'Inserts in-app notifications (per audience flags) and invokes the notify-booking-change Edge Function for emails. Returns count of in-app rows inserted. Hotfix 2026-06-18: column names aligned with real schema (was silently failing in production).';

-- ============================================================================
-- Trigger function hotfix: trg_fn_bookings_notify_change
--   b.starts_at -> b.start_time
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_fn_bookings_notify_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_change text;
  v_id     uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_change := 'created';
    v_id     := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_change := 'deleted';
    v_id     := OLD.id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Determine the most meaningful change_type for the user.
    -- (a) Cancellation: status transitioned to 'cancelled' or similar.
    IF COALESCE(NEW.status,'') IS DISTINCT FROM COALESCE(OLD.status,'')
       AND LOWER(COALESCE(NEW.status,'')) IN ('cancelled','canceled','anulada','anulado') THEN
      v_change := 'cancelled';
    -- (b) Reschedule: time moved.
    -- HOTFIX 2026-06-18: starts_at -> start_time
    ELSIF NEW.start_time IS DISTINCT FROM OLD.start_time THEN
      v_change := 'rescheduled';
    -- (c) Anything else: generic update (notes, service, professional…).
    ELSE
      v_change := 'updated';
    END IF;
    v_id := NEW.id;
  END IF;

  -- Fire-and-forget; never block the writer on a notification failure.
  BEGIN
    PERFORM public.notify_booking_change(v_id, v_change);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[trg_bookings_notify_change] % %', SQLERRM, v_id;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$func$;
