-- Rafter v0.50: extend kill switch to budget reminders
-- Adds a 4th toggle for the budget-related client emails that
-- weren't covered by the previous 3 switches (v0.42 + ffdf3fd8):
--   - send-budget-reminders  (cron daily 09:00)
--   - send-budget-notification (trigger + cron)
-- Both send email to the CLIENT about recurring_budgets.
-- Same pattern as the previous 3 toggles.

BEGIN;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS budget_reminders_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_reminders_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS budget_reminders_paused_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.system_settings.budget_reminders_paused IS
  'When true, send-budget-reminders and send-budget-notification EFs short-circuit with {paused:true}. Cron: 0 9 * * *. To: clients (recurring_budgets payment reminders).';

COMMIT;
