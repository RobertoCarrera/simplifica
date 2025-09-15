-- Update RLS for ticket_devices to rely on public.users membership (auth_user_id + company_id)
-- instead of user_companies. Idempotent.

DO $$
BEGIN
  -- Drop old insert policy if exists (by name) to avoid duplicates
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_devices' AND polname = 'Users can insert ticket devices from their company'
  ) THEN
    EXECUTE $$DROP POLICY "Users can insert ticket devices from their company" ON public.ticket_devices;$$;
  END IF;

  -- Replace/alter the main manage policy to use public.users in USING and WITH CHECK
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ticket_devices' AND polname = 'Users can manage ticket devices from their company'
  ) THEN
    EXECUTE $$ALTER POLICY "Users can manage ticket devices from their company" ON public.ticket_devices
      USING (
        EXISTS (
          SELECT 1 FROM public.tickets t
          JOIN public.users u ON u.company_id = t.company_id AND u.auth_user_id = auth.uid() AND u.active = TRUE
          WHERE t.id = ticket_devices.ticket_id
        )
      )
      WITH CHECK (
        -- Ensure ticket & device belong to same company
        (
          SELECT t3.company_id FROM public.tickets t3 WHERE t3.id = ticket_devices.ticket_id
        ) = (
          SELECT d2.company_id FROM public.devices d2 WHERE d2.id = ticket_devices.device_id
        )
        AND EXISTS (
          SELECT 1 FROM public.users u2
          WHERE u2.auth_user_id = auth.uid()
            AND u2.active = TRUE
            AND u2.company_id = (
              SELECT t4.company_id FROM public.tickets t4 WHERE t4.id = ticket_devices.ticket_id
            )
        )
      );$$;
  ELSE
    -- Create a consolidated SELECT policy if missing
    EXECUTE $$CREATE POLICY "Users can manage ticket devices from their company" ON public.ticket_devices
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.tickets t
          JOIN public.users u ON u.company_id = t.company_id AND u.auth_user_id = auth.uid() AND u.active = TRUE
          WHERE t.id = ticket_devices.ticket_id
        )
      );$$;

    -- Create INSERT policy w/ WITH CHECK
    EXECUTE $$CREATE POLICY "Users can insert ticket devices from their company" ON public.ticket_devices
      FOR INSERT WITH CHECK (
        (
          SELECT t3.company_id FROM public.tickets t3 WHERE t3.id = ticket_devices.ticket_id
        ) = (
          SELECT d2.company_id FROM public.devices d2 WHERE d2.id = ticket_devices.device_id
        )
        AND EXISTS (
          SELECT 1 FROM public.users u2
          WHERE u2.auth_user_id = auth.uid()
            AND u2.active = TRUE
            AND u2.company_id = (
              SELECT t4.company_id FROM public.tickets t4 WHERE t4.id = ticket_devices.ticket_id
            )
        )
      );$$;
  END IF;
END $$;

COMMENT ON POLICY "Users can manage ticket devices from their company" ON public.ticket_devices IS 'Uses public.users membership and enforces same-company ticket-device linking.';
