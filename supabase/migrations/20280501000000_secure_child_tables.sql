-- Secure child tables (invoice_items, quote_items)
-- Regression Fix: Re-applying policies lost from Jan 2026 rollback

-- Invoice Items
ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_items_access_policy" ON "public"."invoice_items";

CREATE POLICY "invoice_items_access_policy" ON "public"."invoice_items"
AS PERMISSIVE FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM invoices i
    JOIN company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.auth_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM invoices i
    JOIN company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.auth_user_id = auth.uid()
  )
);

-- Quote Items
ALTER TABLE "public"."quote_items" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_items_access_policy" ON "public"."quote_items";

CREATE POLICY "quote_items_access_policy" ON "public"."quote_items"
AS PERMISSIVE FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM quotes q
    JOIN company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.auth_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM quotes q
    JOIN company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.auth_user_id = auth.uid()
  )
);
