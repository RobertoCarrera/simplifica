-- Migration: Add role-specific invite email types and email template editor columns
-- Date: 2026-04-16
-- Purpose:
--   1) Add role-specific email types: invite_owner, invite_admin, invite_member,
--      invite_professional, invite_agent, invite_client
--   2) Add columns to company_email_settings for full template customization:
--      custom_header_template, custom_button_text
--   3) Insert default rows for all new email types per existing company

-- Step 1: Update CHECK constraint on email_type to include new types
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
  'password_reset', 'magic_link', 'welcome', 'staff_credentials'
));

-- Step 2: Add new columns for full template customization
ALTER TABLE public.company_email_settings
ADD COLUMN IF NOT EXISTS custom_header_template TEXT,
ADD COLUMN IF NOT EXISTS custom_button_text VARCHAR(100);

-- Step 3: Insert default settings rows for all new email types
-- (only for companies that already have at least one email_settings row)
INSERT INTO public.company_email_settings (company_id, email_type, is_active)
SELECT DISTINCT company_id, new_type, true
FROM (
  SELECT DISTINCT company_id FROM public.company_email_settings
) base
CROSS JOIN unnest(ARRAY[
  'invite_owner', 'invite_admin', 'invite_member',
  'invite_professional', 'invite_agent', 'invite_client',
  'booking_reminder', 'booking_cancellation',
  'password_reset', 'magic_link', 'welcome', 'staff_credentials'
]) AS new_type
ON CONFLICT (company_id, email_type) DO NOTHING;

-- Step 4: Add RLS policy for new columns (already covered by existing SELECT/ALL policies)
-- The existing RLS policies on company_email_settings cover SELECT/INSERT/UPDATE/DELETE
-- No new policies needed.

COMMENT ON COLUMN public.company_email_settings.custom_header_template IS
'Custom HTML header block prepended to the email body. Use {{var}} for interpolation.';
COMMENT ON COLUMN public.company_email_settings.custom_button_text IS
'Custom label for the primary action button (e.g. "Aceptar invitación", "Ver factura").';
