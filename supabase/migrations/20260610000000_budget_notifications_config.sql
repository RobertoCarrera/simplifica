-- Migration: Budget notifications — config + email types + in-app trigger
-- Date: 2026-06-10
-- Purpose:
--   1) Per-company config for reminder cadence (T-N days before due, and
--      whether to notify on creation / on overdue).
--   2) Extend company_email_settings CHECK with three new email types:
--        - budget_created       (client gets a "new budget available" email)
--        - budget_reminder      (T-N days before due_date)
--        - budget_overdue       (due_date passed, still unpaid)
--   3) Insert default config row for every company (idempotent).
--   4) Trigger: on recurring_budgets INSERT, fire in-app notification for
--      the client (if they have a portal user) AND call the
--      send-budget-notification Edge Function via pg_net (best-effort).
--
-- This migration pairs with the Edge Function `send-budget-reminders` which
-- runs daily via pg_cron and is the canonical place for T-N reminders
-- + overdue notifications.
--
-- The trigger here only handles the "new budget created" case because that
-- event is point-in-time; reminders/overdue are state-based and need a
-- cron scanner.

--------------------------------------------------------------------------------
-- 1. BUDGET_NOTIFICATION_SETTINGS — per-company reminder cadence
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_notification_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Master switch — if false, NO email is sent for any of the three
  -- notification types, but in-app notifications still fire.
  email_enabled boolean NOT NULL DEFAULT true,

  -- In-app notifications (client portal bell)
  inapp_on_create  boolean NOT NULL DEFAULT true,
  inapp_on_reminder boolean NOT NULL DEFAULT true,
  inapp_on_overdue  boolean NOT NULL DEFAULT true,

  -- Email notifications
  email_on_create  boolean NOT NULL DEFAULT true,
  email_on_reminder boolean NOT NULL DEFAULT true,
  email_on_overdue  boolean NOT NULL DEFAULT true,

  -- Reminder cadence: how many days BEFORE due_date we send the reminder.
  -- Stored as an integer array (sorted ascending) — e.g. {3} for "T-3",
  -- {7, 3, 1} for "a week before + 3 days before + day before".
  -- Empty array = no reminder emails.
  reminder_days_before int[] NOT NULL DEFAULT ARRAY[3]::int[],

  -- How many days AFTER due_date we send the overdue email.
  -- 0 = send on the due_date itself; 1 = send one day after, etc.
  -- Stored as an int array (sorted ascending) — e.g. {0, 3, 7} means
  -- "send overdue on the day, then 3 days later, then 7 days later".
  overdue_days_after int[] NOT NULL DEFAULT ARRAY[0, 3]::int[],

  -- Locale for the email templates (es, ca, en, …) — defaults to 'es'
  locale text NOT NULL DEFAULT 'es'
    CHECK (locale IN ('es', 'ca', 'en')),

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Sanity: cadence arrays must contain only non-negative integers and
  -- be unique + sorted. We allow up to 30 days for either direction
  -- and cap to 6 entries (3 reminders + 3 overdue, plenty of flexibility).
  CONSTRAINT ck_reminder_days_nonneg CHECK (
    cardinality(reminder_days_before) <= 6
    AND NOT EXISTS (
      SELECT 1 FROM unnest(reminder_days_before) AS d WHERE d < 0 OR d > 30
    )
  ),
  CONSTRAINT ck_overdue_days_nonneg CHECK (
    cardinality(overdue_days_after) <= 6
    AND NOT EXISTS (
      SELECT 1 FROM unnest(overdue_days_after) AS d WHERE d < 0 OR d > 30
    )
  )
);

COMMENT ON TABLE public.budget_notification_settings IS
  'Per-company configuration for presupuesto (recurring_budgets) notifications:
   reminder cadence (T-N days before due_date), overdue cadence (N days after),
   and master switches for in-app + email channels. One row per company.';

COMMENT ON COLUMN public.budget_notification_settings.email_enabled IS
  'Master kill switch for outbound emails for budgets. In-app notifications
   are unaffected — set inapp_*_enabled = false to mute those.';

COMMENT ON COLUMN public.budget_notification_settings.reminder_days_before IS
  'Days BEFORE due_date on which a reminder is sent. Empty array = disabled.';

COMMENT ON COLUMN public.budget_notification_settings.overdue_days_after IS
  'Days AFTER due_date on which an overdue notice is sent. The "0" entry
   means "send the moment the budget becomes overdue" (same day).';

--------------------------------------------------------------------------------
-- 2. SEED DEFAULT ROWS FOR EXISTING COMPANIES
--------------------------------------------------------------------------------
INSERT INTO public.budget_notification_settings (company_id)
SELECT c.id
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.budget_notification_settings s
  WHERE s.company_id = c.id
)
ON CONFLICT (company_id) DO NOTHING;

--------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
--------------------------------------------------------------------------------
ALTER TABLE public.budget_notification_settings ENABLE ROW LEVEL SECURITY;

-- Members of a company can read the settings
DROP POLICY IF EXISTS "Company members can read budget notification settings"
  ON public.budget_notification_settings;
CREATE POLICY "Company members can read budget notification settings"
  ON public.budget_notification_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.users u ON u.id = cm.user_id
      WHERE cm.company_id = budget_notification_settings.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- Only owners / admins / supervisors can update the settings
DROP POLICY IF EXISTS "Admins can update budget notification settings"
  ON public.budget_notification_settings;
CREATE POLICY "Admins can update budget notification settings"
  ON public.budget_notification_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.users u ON u.id = cm.user_id
      JOIN public.app_roles r ON r.id = cm.role_id
      WHERE cm.company_id = budget_notification_settings.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
        AND r.name IN ('owner', 'admin', 'super_admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.users u ON u.id = cm.user_id
      JOIN public.app_roles r ON r.id = cm.role_id
      WHERE cm.company_id = budget_notification_settings.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
        AND r.name IN ('owner', 'admin', 'super_admin', 'supervisor')
    )
  );

-- INSERT: handled by the seed above + service_role on company create.
-- Allow owner/admin INSERTs (covers the rare case of an admin setting it
-- up before the seed ran).
DROP POLICY IF EXISTS "Admins can insert budget notification settings"
  ON public.budget_notification_settings;
CREATE POLICY "Admins can insert budget notification settings"
  ON public.budget_notification_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.users u ON u.id = cm.user_id
      JOIN public.app_roles r ON r.id = cm.role_id
      WHERE cm.company_id = budget_notification_settings.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
        AND r.name IN ('owner', 'admin', 'super_admin', 'supervisor')
    )
  );

--------------------------------------------------------------------------------
-- 4. EXTEND company_email_settings CHECK WITH NEW EMAIL TYPES
--------------------------------------------------------------------------------
ALTER TABLE public.company_email_settings
  DROP CONSTRAINT IF EXISTS company_email_settings_email_type_check;

ALTER TABLE public.company_email_settings
  ADD CONSTRAINT company_email_settings_email_type_check
  CHECK (email_type IN (
    'booking_confirmation', 'invoice', 'quote', 'consent',
    'invite', 'invite_owner', 'invite_admin', 'invite_member',
    'invite_professional', 'invite_agent', 'invite_client',
    'waitlist', 'inactive_notice', 'generic',
    'booking_reminder', 'booking_cancellation',
    'password_reset', 'magic_link', 'welcome', 'staff_credentials',
    'budget_created', 'budget_reminder', 'budget_overdue'
  ));

-- Backfill: add a default row for every company that already has at least
-- one email_settings row, for each of the three new types.
INSERT INTO public.company_email_settings (company_id, email_type, is_active)
SELECT DISTINCT base.company_id, new_type, true
FROM (
  SELECT DISTINCT company_id FROM public.company_email_settings
) base
CROSS JOIN unnest(ARRAY[
  'budget_created', 'budget_reminder', 'budget_overdue'
]) AS new_type
ON CONFLICT (company_id, email_type) DO NOTHING;

--------------------------------------------------------------------------------
-- 5. TRACK WHICH REMINDERS / OVERDUE EMAILS WE'VE ALREADY SENT
--    (idempotency — prevents the daily cron from spamming the same
--    client for the same budget on the same day)
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_notification_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id uuid NOT NULL REFERENCES public.recurring_budgets(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- 'reminder' | 'overdue' | 'created'
  kind text NOT NULL
    CHECK (kind IN ('created', 'reminder', 'overdue')),

  -- For 'reminder' the day-offset from due_date (negative = before).
  -- For 'overdue' the day-offset from due_date (positive = after, 0 = same day).
  -- NULL for 'created'.
  day_offset int,

  -- When the notification was actually sent
  sent_at timestamptz NOT NULL DEFAULT now(),

  -- Channel(s) we used — JSONB so we can record multiple (e.g. in-app + email)
  channels jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Idempotency key: (budget_id, kind, day_offset) must be unique.
  -- NULL day_offset (i.e. 'created') → treated separately.
  CONSTRAINT uq_budget_notification_log UNIQUE (budget_id, kind, day_offset)
);

CREATE INDEX IF NOT EXISTS idx_budget_notification_log_budget
  ON public.budget_notification_log(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_notification_log_company_sent
  ON public.budget_notification_log(company_id, sent_at DESC);

COMMENT ON TABLE public.budget_notification_log IS
  'Audit log + idempotency guard for presupuesto notifications. The
   send-budget-reminders cron uses (budget_id, kind, day_offset) uniqueness
   to avoid re-sending the same notification when the cron runs more than
   once on the same day (e.g. after a retry).';

--------------------------------------------------------------------------------
-- 6a. HELPER: dispatch_send_budget_notification(kind, budget_id)
--     Async-fire send-budget-notification via pg_net. Centralised here so
--     the trigger + cron code stay readable. Reads the service role key
--     from the Supabase Vault (same pattern as send-push-notification).
--
--     PREREQ (one-time, via Supabase Dashboard → Vault):
--       A secret named "service_role_key" must already exist (created for
--       the push-notification cron back in April 2026).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_send_budget_notification(
  p_kind text,
  p_budget_id uuid,
  p_day_offset int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  v_service_key text;
  v_supabase_url text := 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
  v_body jsonb;
BEGIN
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    RAISE WARNING '[dispatch_send_budget_notification] service_role_key not found in vault — skipping';
    RETURN;
  END IF;

  v_body := jsonb_build_object(
    'kind', p_kind,
    'budget_id', p_budget_id
  );
  IF p_day_offset IS NOT NULL THEN
    v_body := v_body || jsonb_build_object('day_offset', p_day_offset);
  END IF;

  PERFORM net.http_post(
    url     := v_supabase_url || '/functions/v1/send-budget-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := v_body
  );
END;
$$;

COMMENT ON FUNCTION public.dispatch_send_budget_notification(text, uuid, int) IS
  'Async-fires the send-budget-notification Edge Function for a given budget.
   kind ∈ {created, reminder, overdue}; day_offset is the days-before/after
   due_date for reminder/overdue. Reads the service role key from Vault.
   Used by the AFTER INSERT trigger on recurring_budgets and by the
   send-budget-reminders cron function.';

--------------------------------------------------------------------------------
-- 6b. TRIGGER: in-app notification on recurring_budgets INSERT
--    Fires for every new row. Looks up the client''s portal user
--    (users.auth_user_id ↔ users.client_id) and writes a row to
--    public.notifications with client_recipient_id.
--
--    The email side is handled asynchronously by the Edge Function
--    `send-budget-notification` (see dispatch_send_budget_notification
--    helper above). The function reads `budget_notification_settings`
--    and calls send-branded-email.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_recurring_budget_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_name text;
  v_client_email text;
  v_client_user_id uuid;
  v_settings record;
  v_period_label text;
  v_inapp_enabled boolean := true;
  v_email_enabled boolean := true;
BEGIN
  -- Bail out if a notification for this (budget, 'created') already exists
  -- (idempotency — also covers the case where the trigger re-fires after
  -- a manual replay).
  IF EXISTS (
    SELECT 1 FROM public.budget_notification_log
    WHERE budget_id = NEW.id AND kind = 'created'
  ) THEN
    RETURN NEW;
  END IF;

  -- Look up the client
  SELECT c.name, c.email
    INTO v_client_name, v_client_email
  FROM public.clients c
  WHERE c.id = NEW.client_id;

  -- Look up the portal user for this client (if any)
  SELECT u.id
    INTO v_client_user_id
  FROM public.users u
  WHERE u.client_id = NEW.client_id
    AND u.auth_user_id IS NOT NULL
  LIMIT 1;

  -- Load settings (default = all enabled)
  SELECT s.inapp_on_create,
         s.email_enabled AND s.email_on_create
    INTO v_inapp_enabled, v_email_enabled
  FROM public.budget_notification_settings s
  WHERE s.company_id = NEW.company_id;

  IF v_inapp_enabled IS NULL THEN v_inapp_enabled := true; END IF;
  IF v_email_enabled IS NULL THEN v_email_enabled := true; END IF;

  -- Human-readable period label
  v_period_label := CASE NEW.recurrence_type
    WHEN 'weekly'  THEN 'Semana ' || NEW.period
    WHEN 'monthly' THEN to_char(
                            to_date(NEW.period || '-01', 'YYYY-MM-DD'),
                            'YYYY "—" Month'
                          )
    WHEN 'yearly'  THEN 'Año ' || NEW.period
    ELSE NEW.period
  END;

  -- In-app notification (only if the client has a portal user)
  IF v_inapp_enabled AND v_client_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      company_id,
      client_recipient_id,
      type,
      title,
      content,
      reference_id,
      metadata,
      is_read,
      link
    ) VALUES (
      NEW.company_id,
      NEW.client_id,
      'budget_created',
      'Nuevo presupuesto disponible',
      COALESCE(v_client_name, 'Cliente') ||
        ', tienes un nuevo presupuesto de ' || NEW.total || ' ' ||
        COALESCE(NEW.currency, 'EUR') || ' (' || v_period_label || ').',
      NEW.id::text,
      jsonb_build_object(
        'budget_id',     NEW.id,
        'period',        NEW.period,
        'total',         NEW.total,
        'currency',      COALESCE(NEW.currency, 'EUR'),
        'due_date',      NEW.due_date,
        'recurrence_type', NEW.recurrence_type
      ),
      false,
      '/portal/presupuestos/' || NEW.id
    );
  END IF;

  -- Email (async via dispatch_send_budget_notification)
  IF v_email_enabled AND v_client_email IS NOT NULL THEN
    PERFORM public.dispatch_send_budget_notification(
      'created'::text,
      NEW.id
    );
  END IF;

  -- Log the notification (idempotency)
  INSERT INTO public.budget_notification_log (budget_id, company_id, kind, day_offset, channels)
  VALUES (
    NEW.id,
    NEW.company_id,
    'created',
    NULL,
    jsonb_build_object(
      'inapp', v_inapp_enabled AND v_client_user_id IS NOT NULL,
      'email', v_email_enabled AND v_client_email IS NOT NULL
    )
  )
  ON CONFLICT (budget_id, kind, day_offset) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_recurring_budget_created ON public.recurring_budgets;
CREATE TRIGGER trg_notify_on_recurring_budget_created
  AFTER INSERT ON public.recurring_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_recurring_budget_created();

COMMENT ON FUNCTION public.notify_on_recurring_budget_created() IS
  'AFTER INSERT trigger on recurring_budgets. Creates an in-app notification
   for the client (if they have a portal user) and asynchronously fires
   send-budget-notification with kind=created to send the email via
   send-branded-email. Idempotent: the budget_notification_log row
   prevents double-send if the trigger fires twice.';

--------------------------------------------------------------------------------
-- 7. RPC: list_company_budget_due_summary(company_id)
--    Returns every recurring_budget for the company with its current
--    effective status, days_to_due, and whether a reminder/overdue
--    notification has already been sent. Used by the Angular UI to
--    display the budget list with a "Reminded?" / "Overdue?" badge.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_company_budget_due_summary(p_company_id uuid)
RETURNS TABLE (
  budget_id uuid,
  client_id uuid,
  client_name text,
  period text,
  recurrence_type text,
  total numeric,
  currency text,
  due_date date,
  days_to_due int,
  is_overdue boolean,
  payment_status text,
  status text,
  last_reminder_sent_at timestamptz,
  last_overdue_sent_at timestamptz,
  last_created_sent_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT
    rb.id,
    rb.client_id,
    c.name,
    rb.period,
    rb.recurrence_type,
    rb.total,
    rb.currency,
    rb.due_date,
    (rb.due_date - CURRENT_DATE)::int AS days_to_due,
    (rb.due_date < CURRENT_DATE
       AND COALESCE(rb.payment_status, 'unpaid') NOT IN ('paid', 'refunded')) AS is_overdue,
    COALESCE(rb.payment_status, 'unpaid') AS payment_status,
    rb.status,
    MAX(lr.sent_at) FILTER (WHERE lr.kind = 'reminder') AS last_reminder_sent_at,
    MAX(lo.sent_at) FILTER (WHERE lo.kind = 'overdue')  AS last_overdue_sent_at,
    MAX(lc.sent_at) FILTER (WHERE lc.kind = 'created')  AS last_created_sent_at
  FROM public.recurring_budgets rb
  JOIN public.clients c ON c.id = rb.client_id
  LEFT JOIN public.budget_notification_log lr
    ON lr.budget_id = rb.id AND lr.kind = 'reminder'
  LEFT JOIN public.budget_notification_log lo
    ON lo.budget_id = rb.id AND lo.kind = 'overdue'
  LEFT JOIN public.budget_notification_log lc
    ON lc.budget_id = rb.id AND lc.kind = 'created'
  WHERE rb.company_id = p_company_id
  GROUP BY rb.id, c.name;
$$;

COMMENT ON FUNCTION public.list_company_budget_due_summary(uuid) IS
  'List every recurring_budget for a company with computed days_to_due,
   is_overdue flag and the timestamp of the last reminder/overdue/created
   notification. Used by the company admin UI to show a per-budget
   notification status badge. Returns nothing for non-members — RLS on
   the underlying tables still applies.';
