-- Fix RLS for ticket_devices: add WITH CHECK so inserts succeed and ensure device & ticket belong to same company
-- and both are within user's companies. Also enforce that ticket and device company match.

-- If the original policy exists without WITH CHECK, we alter it; if not, we recreate policies safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE polname = 'Users can manage ticket devices from their company' AND schemaname = 'public'
  ) THEN
    EXECUTE $$ALTER POLICY "Users can manage ticket devices from their company" ON public.ticket_devices
      USING (
        ticket_id IN (
          SELECT t.id FROM public.tickets t
          WHERE t.company_id IN (
            SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
          )
        )
      )
      WITH CHECK (
        -- Ticket belongs to one of user's companies
        ticket_id IN (
          SELECT t2.id FROM public.tickets t2
          WHERE t2.company_id IN (
            SELECT uc2.company_id FROM public.user_companies uc2 WHERE uc2.user_id = auth.uid()
          )
        )
        AND
        -- Device belongs to one of user's companies
        device_id IN (
          SELECT d.id FROM public.devices d
          WHERE d.company_id IN (
            SELECT uc3.company_id FROM public.user_companies uc3 WHERE uc3.user_id = auth.uid()
          )
        )
        AND
        -- Ticket company = Device company (prevent cross-company linking)
        (
          SELECT t3.company_id FROM public.tickets t3 WHERE t3.id = ticket_devices.ticket_id
        ) = (
          SELECT d2.company_id FROM public.devices d2 WHERE d2.id = ticket_devices.device_id
        )
      );$$;
  ELSE
    -- Create consolidated policies if missing
    EXECUTE $$CREATE POLICY "Users can manage ticket devices from their company" ON public.ticket_devices
      FOR SELECT USING (
        ticket_id IN (
          SELECT t.id FROM public.tickets t
          WHERE t.company_id IN (
            SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid()
          )
        )
      );$$;

    EXECUTE $$CREATE POLICY "Users can insert ticket devices from their company" ON public.ticket_devices
      FOR INSERT WITH CHECK (
        ticket_id IN (
          SELECT t2.id FROM public.tickets t2
          WHERE t2.company_id IN (
            SELECT uc2.company_id FROM public.user_companies uc2 WHERE uc2.user_id = auth.uid()
          )
        )
        AND device_id IN (
          SELECT d.id FROM public.devices d
          WHERE d.company_id IN (
            SELECT uc3.company_id FROM public.user_companies uc3 WHERE uc3.user_id = auth.uid()
          )
        )
        AND (
          SELECT t3.company_id FROM public.tickets t3 WHERE t3.id = ticket_devices.ticket_id
        ) = (
          SELECT d2.company_id FROM public.devices d2 WHERE d2.id = ticket_devices.device_id
        )
      );$$;
  END IF;
END $$;

COMMENT ON POLICY "Users can manage ticket devices from their company" ON public.ticket_devices IS 'Allows CRUD on ticket_devices when the ticket (and via WITH CHECK also the device) belongs to one of the user''s companies and both ticket & device share the same company.';
