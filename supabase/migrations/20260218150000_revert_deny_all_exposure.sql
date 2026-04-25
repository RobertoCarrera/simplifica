/* Revert policies for tables that should remain internal (Deny All) */
/* Wrapped in DO blocks because some tables may not exist yet at this point in migration order */

DO $$
BEGIN
  -- 1. company_stage_order
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'company_stage_order') THEN
    DROP POLICY IF EXISTS "Enable read access for users based on company_id" ON public.company_stage_order;
    DROP POLICY IF EXISTS "Enable insert access for users based on company_id" ON public.company_stage_order;
    DROP POLICY IF EXISTS "Enable update access for users based on company_id" ON public.company_stage_order;
    DROP POLICY IF EXISTS "Enable delete access for users based on company_id" ON public.company_stage_order;
  END IF;

  -- 2. company_ticket_sequences
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'company_ticket_sequences') THEN
    DROP POLICY IF EXISTS "Enable read access for users based on company_id" ON public.company_ticket_sequences;
    DROP POLICY IF EXISTS "Enable update access for users based on company_id" ON public.company_ticket_sequences;
    DROP POLICY IF EXISTS "Enable insert access for users based on company_id" ON public.company_ticket_sequences;
  END IF;

  -- 3. invoice_meta
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoice_meta') THEN
    DROP POLICY IF EXISTS "Enable read access for invoice_meta based on company_id" ON public.invoice_meta;
    DROP POLICY IF EXISTS "Enable insert access for invoice_meta based on company_id" ON public.invoice_meta;
    DROP POLICY IF EXISTS "Enable update access for invoice_meta based on company_id" ON public.invoice_meta;
    DROP POLICY IF EXISTS "Enable delete access for invoice_meta based on company_id" ON public.invoice_meta;
    DROP POLICY IF EXISTS "Enable read access for invoice_meta via invoices" ON public.invoice_meta;
    DROP POLICY IF EXISTS "Enable insert access for invoice_meta via invoices" ON public.invoice_meta;
    DROP POLICY IF EXISTS "Enable update access for invoice_meta via invoices" ON public.invoice_meta;
    DROP POLICY IF EXISTS "Enable delete access for invoice_meta via invoices" ON public.invoice_meta;
  END IF;

  -- 4. verifactu_invoice_meta
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'verifactu_invoice_meta') THEN
    DROP POLICY IF EXISTS "Enable read access for verifactu_invoice_meta via invoices" ON public.verifactu_invoice_meta;
    DROP POLICY IF EXISTS "Enable insert access for verifactu_invoice_meta via invoices" ON public.verifactu_invoice_meta;
    DROP POLICY IF EXISTS "Enable update access for verifactu_invoice_meta via invoices" ON public.verifactu_invoice_meta;
    DROP POLICY IF EXISTS "Enable delete access for verifactu_invoice_meta via invoices" ON public.verifactu_invoice_meta;
  END IF;
END $$;
