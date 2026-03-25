-- Enable waitlist feature for testing
-- Run this in Supabase SQL Editor or via psql

-- 1. Enable waitlist for test company "Digitalizamos tu PYME"
-- Guard against missing company in local environments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = 'b6c61eba-9c6d-4011-8bb4-ae9aecc29913') THEN
    INSERT INTO company_settings (company_id, waitlist_active_mode, waitlist_passive_mode, waitlist_auto_promote, waitlist_notification_window)
    VALUES ('b6c61eba-9c6d-4011-8bb4-ae9aecc29913', true, true, true, 15)
    ON CONFLICT (company_id) DO UPDATE
    SET waitlist_active_mode = EXCLUDED.waitlist_active_mode,
        waitlist_passive_mode = EXCLUDED.waitlist_passive_mode,
        waitlist_auto_promote = EXCLUDED.waitlist_auto_promote,
        waitlist_notification_window = EXCLUDED.waitlist_notification_window,
        updated_at = NOW();
  END IF;
END;
$$;

-- 2. Enable waitlist for test services (only if they exist)
UPDATE services 
SET enable_waitlist = true,
    active_mode_enabled = true,
    passive_mode_enabled = true,
    updated_at = NOW()
WHERE id IN (
    'f7d567eb-1ddd-4ffb-9199-b0e7282090a8', -- Barre
    'ffb0c92f-361f-408a-ad09-2ed919079ff0', -- Fisioterapia
    'c8b4fa3f-513b-4537-a443-69b3299bc620'  -- Nutrición
);

-- 3. Verify settings
SELECT 
    cs.company_id,
    cs.waitlist_active_mode,
    cs.waitlist_passive_mode,
    cs.waitlist_auto_promote,
    cs.waitlist_notification_window
FROM company_settings cs
WHERE cs.company_id = 'b6c61eba-9c6d-4011-8bb4-ae9aecc29913';

-- 4. Verify services
SELECT
    s.id,
    s.name,
    s.enable_waitlist,
    s.active_mode_enabled,
    s.passive_mode_enabled
FROM services s
WHERE s.company_id = 'b6c61eba-9c6d-4011-8bb4-ae9aecc29913'
ORDER BY s.name;