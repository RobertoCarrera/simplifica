/* Revert policies for tables that should remain internal (Deny All) */

-- 1. company_stage_order
DROP POLICY IF EXISTS "Enable read access for users based on company_id" ON public.company_stage_order;
DROP POLICY IF EXISTS "Enable insert access for users based on company_id" ON public.company_stage_order;
DROP POLICY IF EXISTS "Enable update access for users based on company_id" ON public.company_stage_order;
DROP POLICY IF EXISTS "Enable delete access for users based on company_id" ON public.company_stage_order;

-- 2. company_ticket_sequences
DROP POLICY IF EXISTS "Enable read access for users based on company_id" ON public.company_ticket_sequences;
DROP POLICY IF EXISTS "Enable update access for users based on company_id" ON public.company_ticket_sequences;
DROP POLICY IF EXISTS "Enable insert access for users based on company_id" ON public.company_ticket_sequences;

-- 3. invoice_meta
DROP POLICY IF EXISTS "Enable read access for invoice_meta based on company_id" ON public.invoice_meta;
DROP POLICY IF EXISTS "Enable insert access for invoice_meta based on company_id" ON public.invoice_meta;
DROP POLICY IF EXISTS "Enable update access for invoice_meta based on company_id" ON public.invoice_meta;
DROP POLICY IF EXISTS "Enable delete access for invoice_meta based on company_id" ON public.invoice_meta;
-- Also drop the corrected versions if applied via previous script
DROP POLICY IF EXISTS "Enable read access for invoice_meta via invoices" ON public.invoice_meta;
DROP POLICY IF EXISTS "Enable insert access for invoice_meta via invoices" ON public.invoice_meta;
DROP POLICY IF EXISTS "Enable update access for invoice_meta via invoices" ON public.invoice_meta;
DROP POLICY IF EXISTS "Enable delete access for invoice_meta via invoices" ON public.invoice_meta;

-- 4. verifactu_invoice_meta
DROP POLICY IF EXISTS "Enable read access for verifactu_invoice_meta via invoices" ON public.verifactu_invoice_meta;
DROP POLICY IF EXISTS "Enable insert access for verifactu_invoice_meta via invoices" ON public.verifactu_invoice_meta;
DROP POLICY IF EXISTS "Enable update access for verifactu_invoice_meta via invoices" ON public.verifactu_invoice_meta;
DROP POLICY IF EXISTS "Enable delete access for verifactu_invoice_meta via invoices" ON public.verifactu_invoice_meta;
