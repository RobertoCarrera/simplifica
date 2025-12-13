-- MIGRATION: Fix numbering (P for Quotes, F for Invoices) and add 'pending' status

-- 1. Add 'pending' to quote_status enum
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'pending';

-- 2. Fix Quotes Numbering (Force 'P')
-- We need to drop dependent view first because it depends on the column we are about to drop
DROP VIEW IF EXISTS public.client_visible_quotes;

-- We drop and recreate the generated column to ensure the definition is correct.
-- Note: This will recalculate the column for all existing rows.
ALTER TABLE quotes DROP COLUMN IF EXISTS full_quote_number;

ALTER TABLE quotes ADD COLUMN full_quote_number VARCHAR(100) 
GENERATED ALWAYS AS (year || '-P-' || LPAD(sequence_number::TEXT, 5, '0')) STORED;

CREATE INDEX IF NOT EXISTS idx_quotes_full_number ON quotes(full_quote_number);

-- Recreate the view
CREATE OR REPLACE VIEW public.client_visible_quotes AS
  SELECT * FROM public.client_get_visible_quotes();

GRANT SELECT ON public.client_visible_quotes TO authenticated;

-- 3. Fix Invoices Numbering (Force 'F')
-- Update the configuration in invoice_series
UPDATE invoice_series 
SET prefix = REPLACE(prefix, '-I-', '-F-') 
WHERE prefix LIKE '%-I-%';

-- Update the denormalized column in invoices
-- This will automatically trigger the update of full_invoice_number because it is a generated column depending on invoice_series
UPDATE invoices 
SET invoice_series = REPLACE(invoice_series, '-I-', '-F-') 
WHERE invoice_series LIKE '%-I-%';

-- 4. Verify and fix any inconsistent invoice_series in invoices that might not match the pattern but are linked to a series
-- (Optional, but good practice if we want to be thorough)
-- UPDATE invoices i
-- SET invoice_series = s.prefix
-- FROM invoice_series s
-- WHERE i.series_id = s.id AND i.invoice_series != s.prefix;
