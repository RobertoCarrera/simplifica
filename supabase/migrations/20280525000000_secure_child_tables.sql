-- Secure invoice_items
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items of invoices from their company" ON invoice_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM invoices i
    JOIN company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.auth_user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert items to invoices from their company" ON invoice_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM invoices i
    JOIN company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.auth_user_id = auth.uid()
  )
);

CREATE POLICY "Users can update items of invoices from their company" ON invoice_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM invoices i
    JOIN company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.auth_user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete items of invoices from their company" ON invoice_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM invoices i
    JOIN company_members cm ON i.company_id = cm.company_id
    WHERE i.id = invoice_items.invoice_id
    AND cm.auth_user_id = auth.uid()
  )
);

-- Secure quote_items
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items of quotes from their company" ON quote_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM quotes q
    JOIN company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.auth_user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert items to quotes from their company" ON quote_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM quotes q
    JOIN company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.auth_user_id = auth.uid()
  )
);

CREATE POLICY "Users can update items of quotes from their company" ON quote_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM quotes q
    JOIN company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.auth_user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete items of quotes from their company" ON quote_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM quotes q
    JOIN company_members cm ON q.company_id = cm.company_id
    WHERE q.id = quote_items.quote_id
    AND cm.auth_user_id = auth.uid()
  )
);
