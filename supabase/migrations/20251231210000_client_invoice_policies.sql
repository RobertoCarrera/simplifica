-- Enable RLS on tables if not already enabled
ALTER TABLE IF EXISTS "public"."invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."quote_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "public"."invoice_items" ENABLE ROW LEVEL SECURITY;

-- Policy: Clients can view their own INVOICES
DROP POLICY IF EXISTS "Clients can view own invoices" ON "public"."invoices";
CREATE POLICY "Clients can view own invoices" ON "public"."invoices"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE auth_user_id = auth.uid()
  )
);

-- Policy: Clients can view their own QUOTES
DROP POLICY IF EXISTS "Clients can view own quotes" ON "public"."quotes";
CREATE POLICY "Clients can view own quotes" ON "public"."quotes"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE auth_user_id = auth.uid()
  )
);

-- Policy: Clients can view Items of their own Quotes
DROP POLICY IF EXISTS "Clients can view own quote items" ON "public"."quote_items";
CREATE POLICY "Clients can view own quote items" ON "public"."quote_items"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
  quote_id IN (
    SELECT q.id FROM public.quotes q
    WHERE q.client_id IN (
        SELECT c.id FROM public.clients c WHERE c.auth_user_id = auth.uid()
    )
  )
);

-- Policy: Clients can view Items of their own Invoices
DROP POLICY IF EXISTS "Clients can view own invoice items" ON "public"."invoice_items";
CREATE POLICY "Clients can view own invoice items" ON "public"."invoice_items"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
  invoice_id IN (
    SELECT i.id FROM public.invoices i
    WHERE i.client_id IN (
        SELECT c.id FROM public.clients c WHERE c.auth_user_id = auth.uid()
    )
  )
);
