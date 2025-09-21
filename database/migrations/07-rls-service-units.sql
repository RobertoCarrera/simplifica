-- Enable RLS and policies for service_units (Units of Measure)
-- Grants read access to global (company_id IS NULL) and company-scoped rows
-- and write access only within the user company. Honors soft delete via deleted_at.

BEGIN;

-- Ensure table exists before applying
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_units') THEN
    -- Enable RLS
    EXECUTE 'ALTER TABLE public.service_units ENABLE ROW LEVEL SECURITY';

    -- Drop existing policies if any to avoid duplicates during re-runs
    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_units' AND policyname='service_units_select_company_or_global'
    ) THEN EXECUTE 'DROP POLICY service_units_select_company_or_global ON public.service_units'; END IF;

    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_units' AND policyname='service_units_insert_company'
    ) THEN EXECUTE 'DROP POLICY service_units_insert_company ON public.service_units'; END IF;

    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_units' AND policyname='service_units_update_company'
    ) THEN EXECUTE 'DROP POLICY service_units_update_company ON public.service_units'; END IF;

    IF EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='service_units' AND policyname='service_units_delete_company'
    ) THEN EXECUTE 'DROP POLICY service_units_delete_company ON public.service_units'; END IF;

    -- SELECT: allow reading global units (company_id IS NULL) and own company units; exclude soft-deleted
    EXECUTE $$CREATE POLICY service_units_select_company_or_global ON public.service_units
      FOR SELECT
      USING (
        deleted_at IS NULL AND (
          company_id IS NULL OR company_id IN (
            SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
          )
        )
      )$$;

    -- INSERT: allow inserting units only for the user's company
    EXECUTE $$CREATE POLICY service_units_insert_company ON public.service_units
      FOR INSERT
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
        )
      )$$;

    -- UPDATE: allow updating units only within the user's company
    EXECUTE $$CREATE POLICY service_units_update_company ON public.service_units
      FOR UPDATE
      USING (
        company_id IN (
          SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
        )
      )
      WITH CHECK (
        company_id IN (
          SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
        )
      )$$;

    -- DELETE: allow deleting units only within the user's company
    EXECUTE $$CREATE POLICY service_units_delete_company ON public.service_units
      FOR DELETE
      USING (
        company_id IN (
          SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
        )
      )$$;

  END IF;
END$$;

COMMIT;
