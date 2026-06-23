-- ============================================================================
-- Migration: system_settings_kill_switch
-- ============================================================================
-- PURPOSE: Global kill switch for the process-reminders Edge Function.
--          Single-row table enforced by CHECK on id = 1. Only super_admin
--          can read or write (RLS). Lets ops pause reminder emails and
--          review requests without redeploying code.
--
-- BEHAVIOR:
--   - id always 1 (CHECK + PK)
--   - process_reminders_paused defaults to false (unpaused)
--   - process_reminders_paused_at + process_reminders_paused_by are
--     informational and only meaningful while paused = true
--   - updated_at bumps on every UPDATE via trigger
--   - No INSERT/DELETE policies — the row is seeded once and the PK+CHECK
--     makes the table effectively append-free at the application layer.
--
-- SECURITY:
--   - is_super_admin() is SECURITY DEFINER so it can read public.users and
--     public.app_roles regardless of the caller's RLS grants.
--   - search_path pinned to public to avoid search-path hijack.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.system_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  process_reminders_paused boolean NOT NULL DEFAULT false,
  process_reminders_paused_at timestamptz,
  process_reminders_paused_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the single row if missing
INSERT INTO public.system_settings (id, process_reminders_paused)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Helper: is current user super_admin?
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.app_roles ar ON ar.id = u.app_role_id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name = 'super_admin'
  );
$$;

-- Only super_admin can SELECT
DROP POLICY IF EXISTS "super_admin_select_system_settings" ON public.system_settings;
CREATE POLICY "super_admin_select_system_settings" ON public.system_settings
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Only super_admin can UPDATE
DROP POLICY IF EXISTS "super_admin_update_system_settings" ON public.system_settings;
CREATE POLICY "super_admin_update_system_settings" ON public.system_settings
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- No INSERT/DELETE policies — the single row is enforced by PK+CHECK and seeded above

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_system_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_system_settings_updated_at();

COMMIT;
