-- Secure invoice_items table
ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoice items if they can view the invoice"
ON "public"."invoice_items"
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM "public"."invoices" i
    WHERE i.id = invoice_items.invoice_id
  )
);

CREATE POLICY "Users can insert invoice items if they can insert the invoice"
ON "public"."invoice_items"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."invoices" i
    WHERE i.id = invoice_items.invoice_id
  )
);

CREATE POLICY "Users can update invoice items if they can update the invoice"
ON "public"."invoice_items"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM "public"."invoices" i
    WHERE i.id = invoice_items.invoice_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."invoices" i
    WHERE i.id = invoice_items.invoice_id
  )
);

CREATE POLICY "Users can delete invoice items if they can delete the invoice"
ON "public"."invoice_items"
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM "public"."invoices" i
    WHERE i.id = invoice_items.invoice_id
  )
);

-- Secure quote_items table
ALTER TABLE "public"."quote_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quote items if they can view the quote"
ON "public"."quote_items"
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM "public"."quotes" q
    WHERE q.id = quote_items.quote_id
  )
);

CREATE POLICY "Users can insert quote items if they can insert the quote"
ON "public"."quote_items"
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."quotes" q
    WHERE q.id = quote_items.quote_id
  )
);

CREATE POLICY "Users can update quote items if they can update the quote"
ON "public"."quote_items"
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM "public"."quotes" q
    WHERE q.id = quote_items.quote_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "public"."quotes" q
    WHERE q.id = quote_items.quote_id
  )
);

CREATE POLICY "Users can delete quote items if they can delete the quote"
ON "public"."quote_items"
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM "public"."quotes" q
    WHERE q.id = quote_items.quote_id
  )
);
