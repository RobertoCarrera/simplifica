-- =====================================================
-- ENHANCEMENTS: Link quotes to tickets and items to services/products
-- Date: 2025-11-04
-- Description:
--  1) Add quotes.ticket_id with partial unique index to enforce at most one active quote per ticket.
--  2) Add quote_items.service_id and quote_items.product_id (nullable) to allow restoring selections in UI.
--  3) Add CHECK to ensure only one of service_id/product_id is set per item.
-- =====================================================

-- 1) Link quotes to tickets
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL;

-- Partial unique index: one active (non-cancelled, non-invoiced, non-anonymized) quote per ticket per company
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_active_quote_per_ticket'
  ) THEN
    EXECUTE $$
      CREATE UNIQUE INDEX uq_active_quote_per_ticket
      ON quotes(company_id, ticket_id)
      WHERE ticket_id IS NOT NULL
        AND status IN ('draft','sent','viewed','accepted')
        AND invoice_id IS NULL
        AND NOT is_anonymized
    $$;
  END IF;
END$$;

COMMENT ON COLUMN quotes.ticket_id IS 'Referencia al ticket origen del presupuesto (si aplica)';

-- 2) Link quote items to services/products
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- 3) Ensure only one of service_id/product_id is present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_quote_items_single_reference'
  ) THEN
    ALTER TABLE quote_items
      ADD CONSTRAINT chk_quote_items_single_reference
      CHECK (
        (service_id IS NOT NULL AND product_id IS NULL)
        OR (service_id IS NULL AND product_id IS NOT NULL)
        OR (service_id IS NULL AND product_id IS NULL)
      );
  END IF;
END$$;

-- Helpful indexes for lookups
CREATE INDEX IF NOT EXISTS idx_quote_items_service ON quote_items(service_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_product ON quote_items(product_id);

-- RLS remains valid since company_id is already enforced on quote_items and quotes.

-- =====================================================
-- END
-- =====================================================
