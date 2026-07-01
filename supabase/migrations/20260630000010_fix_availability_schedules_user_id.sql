-- ============================================
-- Migration: Fix auto_create_availability_schedules user_id bug
-- PR 4.7.2 / plans-pricing-freemium.
--
-- The trigger function `auto_create_availability_schedules_for_company`
-- (AFTER INSERT/UPDATE on company_modules, fires when activating
-- moduloReservas) inserts default Mon-Fri 9-17 schedules using
-- `v_professionals.id` as the user_id:
--
--   INSERT INTO public.availability_schedules (user_id, ...)
--   VALUES (v_professionals.id, ...);
--
-- But availability_schedules.user_id has a foreign key to public.users.id,
-- not to public.professionals.id. The professional PK (v_professionals.id)
-- is NOT the same as the user_id. So whenever the trigger fires, the
-- insert fails with:
--
--   Key (user_id)=(8922ae54-...) is not present in table "users".
--
-- This bug was dormant until migration 0008 added the plan-to-company
-- module sync, which INSERTs into company_modules for every plan change
-- (activating moduloReservas in starter/pro/business), so the trigger
-- now fires on every plan change.
--
-- Fix: use v_professionals.user_id (the actual FK target) instead of
-- v_professionals.id. Also drop the now-unnecessary EXISTS check on
-- availability_schedules.user_id (was checking against the wrong
-- value; replace with the correct column).
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_create_availability_schedules_for_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_professionals RECORD;
  v_user_id uuid;
BEGIN
  -- Only trigger when activating moduloReservas
  IF NEW.module_key = 'moduloReservas' AND NEW.status = 'active' THEN
    -- Get all professionals for this company. We need their user_id
    -- (the actual FK target for availability_schedules.user_id), NOT
    -- their row id (professionals.id is a different UUID).
    FOR v_professionals IN
      SELECT user_id FROM public.professionals
       WHERE company_id = NEW.company_id AND is_active = true
    LOOP
      v_user_id := v_professionals.user_id;
      -- Skip if no user_id (data integrity issue, defensive)
      IF v_user_id IS NULL THEN
        CONTINUE;
      END IF;
      -- Check if user already has any availability schedule
      IF NOT EXISTS (
        SELECT 1 FROM public.availability_schedules
         WHERE user_id = v_user_id AND is_unavailable = false
      ) THEN
        -- Insert default Monday-Friday 9:00-17:00 schedule
        INSERT INTO public.availability_schedules
          (user_id, day_of_week, start_time, end_time, is_unavailable, created_at)
        VALUES
          (v_user_id, 1, '09:00:00', '17:00:00', false, NOW()),
          (v_user_id, 2, '09:00:00', '17:00:00', false, NOW()),
          (v_user_id, 3, '09:00:00', '17:00:00', false, NOW()),
          (v_user_id, 4, '09:00:00', '17:00:00', false, NOW()),
          (v_user_id, 5, '09:00:00', '17:00:00', false, NOW());
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;