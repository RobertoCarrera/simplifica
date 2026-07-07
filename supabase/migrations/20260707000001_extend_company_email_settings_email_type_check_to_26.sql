-- Migration: Extend company_email_settings.email_type CHECK to all 26 types
-- Date: 2026-07-07
-- Purpose:
--   The send-branded-email Edge Function handles 26 transactional email types
--   but the DB CHECK constraint on company_email_settings.email_type was last
--   extended in `20260610000000_budget_notifications_config.sql` and only
--   allows 24 (missing google_review and booking_change added by the PR2c
--   fixture matrix). Upsert/insert of those two types would currently fail
--   with a CHECK constraint violation.
--
-- Strategy:
--   1) Discover the current CHECK constraint on company_email_settings that
--      touches email_type (idempotent — robust to renames).
--   2) Drop it.
--   3) Re-add it with the full 26-type list (typed as `AllEmailType` in
--      src/app/email-samples.ts and enumerated in
--      supabase/email-samples.json).
--   4) Reload PostgREST schema cache so the new constraint takes effect
--      immediately for API consumers.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'company_email_settings'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%email_type%';

  IF v_constraint_name IS NULL THEN
    RAISE EXCEPTION 'Could not find email_type CHECK constraint on company_email_settings';
  END IF;

  EXECUTE format('ALTER TABLE public.company_email_settings DROP CONSTRAINT %I', v_constraint_name);
END $$;

ALTER TABLE public.company_email_settings
  ADD CONSTRAINT company_email_settings_email_type_check
  CHECK (email_type IN (
    -- Reservas
    'booking_confirmation',
    'booking_reminder',
    'booking_cancellation',
    'booking_change',
    'waitlist',
    -- Facturación
    'invoice',
    'quote',
    'budget_created',
    'budget_reminder',
    'budget_overdue',
    -- Consentimiento
    'consent',
    -- Invitaciones
    'invite',
    'invite_owner',
    'invite_admin',
    'invite_member',
    'invite_professional',
    'invite_agent',
    'invite_marketer',
    'invite_client',
    -- Credenciales
    'password_reset',
    'magic_link',
    'welcome',
    'staff_credentials',
    -- Notificaciones
    'inactive_notice',
    'generic',
    'google_review'
  ));

NOTIFY pgrst, 'reload schema';