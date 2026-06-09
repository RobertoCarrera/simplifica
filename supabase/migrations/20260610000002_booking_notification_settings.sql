-- Migration: Booking notification settings + trigger + RPC
-- --------------------------------------------------------------------
-- Adds the ability to notify clients / professionals / admins when a
-- booking is created, modified, rescheduled, or cancelled. The settings
-- live in the same row as `budget_notification_settings` (one row per
-- company) to keep the settings UI and ACL simple.
--
-- Decisions:
--   * Same table as budget notifications: 1 row per company, RLS-scoped.
--   * 6 new boolean columns with sensible defaults.
--   * Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
--   * Trigger fires AFTER INSERT/UPDATE/DELETE on `bookings` (the
--     underlying table; if your project uses a different name adjust
--     below).
--   * The trigger calls notify_booking_change(booking_id, change_type)
--     which inserts an in-app notification AND invokes the
--     notify-booking-change Edge Function to send the email. The
--     function is invoked with http_post from pg_net (already enabled
--     in this DB — see 20260609000003_schedule_recurring_budgets_cron.sql).
--   * Idempotency: we dedupe via a 5-minute window using the existing
--     notifications table (title + entity_id + created_at > now()-5min).
--   * All changes are gated by the company's booking_* settings; if
--     the company has not opted in, no email and no in-app row are
--     created.

--------------------------------------------------------------------------------
-- 1. COLUMNS on budget_notification_settings
--------------------------------------------------------------------------------
ALTER TABLE public.budget_notification_settings
  ADD COLUMN IF NOT EXISTS booking_email_enabled        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_inapp_enabled        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_notify_client        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_notify_professional  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_notify_admin         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_email_cc_admin       boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.budget_notification_settings.booking_email_enabled IS
  'Master switch — si false, no se envía email de ningún tipo por cambios en reservas.';
COMMENT ON COLUMN public.budget_notification_settings.booking_inapp_enabled IS
  'Master switch — si false, no se inserta notification in-app por cambios en reservas.';
COMMENT ON COLUMN public.budget_notification_settings.booking_notify_client IS
  'Notificar al cliente cuando su reserva se modifica, cancela, reagenda o crea.';
COMMENT ON COLUMN public.budget_notification_settings.booking_notify_professional IS
  'Notificar al profesional asignado cuando se modifica/cancela/reagenda una de sus reservas.';
COMMENT ON COLUMN public.budget_notification_settings.booking_notify_admin IS
  'Notificar a todos los admins/owners de la company en estos cambios.';
COMMENT ON COLUMN public.budget_notification_settings.booking_email_cc_admin IS
  'Si true, los admins reciben copia (CC) de los emails enviados al cliente/profesional.';

--------------------------------------------------------------------------------
-- 2. RPC: notify_booking_change(booking_id, change_type)
--------------------------------------------------------------------------------
-- Inserts in-app notifications (gated by *_inapp_enabled + audience flags)
-- and triggers the Edge Function via pg_net.http_post for emails.
--
-- change_type: 'created' | 'updated' | 'rescheduled' | 'cancelled' | 'deleted'
--
-- SECURITY: SECURITY DEFINER, ejecuta como service_role para bypassear
-- RLS al insertar en `notifications`. RLS sigue aplicando al cliente que
-- las lee (solo ve las suyas).
CREATE OR REPLACE FUNCTION public.notify_booking_change(
  p_booking_id uuid,
  p_change_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  v_edge_secret     text;
  v_request_id      bigint;
  v_supabase_url    text;
BEGIN
  -- Resolve the booking and its relations. We use the *current* row
  -- (post-change) to build the user-facing message.
  SELECT
    b.company_id,
    COALESCE(b.title, b.service_name, 'Tu reserva'),
    b.starts_at,
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
  IF v_booking_client IS NOT NULL THEN
    SELECT user_id INTO v_client_user_id
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
  IF array_length(v_audiences, 1) > 0 THEN
    WITH params AS (
      SELECT
        v_company_id    AS company_id,
        v_booking_id    AS entity_id,
        'booking'       AS entity_type,
        p_change_type   AS change_type,
        v_title         AS title,
        v_body          AS body,
        v_settings.booking_inapp_enabled AS enabled
    ),
    dedup AS (
      SELECT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.entity_id   = p_booking_id
          AND n.entity_type = 'booking'
          AND n.kind        = p_change_type
          AND n.created_at > now() - interval '5 minutes'
      ) AS already
    )
    INSERT INTO public.notifications
      (company_id, user_id, audience, entity_id, entity_type, kind, title, body, read, created_at)
    SELECT
      v_company_id,
      CASE a
        WHEN 'client'       THEN v_client_user_id
        WHEN 'professional' THEN v_pro_user_id
        WHEN 'admin'        THEN NULL  -- broadcast to all admins
      END,
      a,
      v_booking_id,
      'booking',
      p_change_type,
      v_title,
      v_body,
      false,
      now()
    FROM unnest(v_audiences) AS a
    WHERE NOT (SELECT already FROM dedup);

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  -- Email notifications: only if master switch + audience flags on.
  IF v_settings.booking_email_enabled THEN
    -- Resolve Edge Function URL from env (set in supabase/config.toml).
    -- We rely on pg_net being available (extended in migration 20260609000003).
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
$$;

COMMENT ON FUNCTION public.notify_booking_change(uuid, text) IS
  'Inserts in-app notifications (per audience flags) and invokes the notify-booking-change Edge Function for emails. Returns count of in-app rows inserted.';

--------------------------------------------------------------------------------
-- 3. TRIGGER: bookings → notify_booking_change
--------------------------------------------------------------------------------
-- Fires AFTER INSERT/UPDATE/DELETE. We classify the change_type by
-- comparing OLD vs NEW on:
--   * INSERT: created
--   * DELETE: deleted
--   * UPDATE: if status changed to 'cancelled' → cancelled
--             if starts_at changed → rescheduled
--             otherwise → updated
DROP TRIGGER IF EXISTS trg_bookings_notify_change ON public.bookings;
DROP FUNCTION IF EXISTS public.trg_fn_bookings_notify_change();

CREATE OR REPLACE FUNCTION public.trg_fn_bookings_notify_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    ELSIF NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
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
$$;

CREATE TRIGGER trg_bookings_notify_change
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_bookings_notify_change();

--------------------------------------------------------------------------------
-- 4. RLS — booking_email_enabled + booking_inapp_enabled follow the same
-- pattern as the rest of the budget_notification_settings columns. RLS
-- was already set in migration 20260610000000 and applies to all
-- columns, so the new ones inherit it automatically. No changes here.
--------------------------------------------------------------------------------
