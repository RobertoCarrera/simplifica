-- =====================================================
-- Enhance quote_items with variant_id and billing_period
-- Date: 2025-11-10
-- Description:
--  - Add quote_items.variant_id (nullable) referencing service_variants(id)
--  - Add quote_items.billing_period (nullable) to capture selected periodicity
--  - Create helpful index
--  - Add lightweight CHECK to ensure billing_period is one of known values when set
-- =====================================================

-- Add columns if missing
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES service_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_period TEXT;

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_quote_items_variant ON quote_items(variant_id);

-- Constrain billing_period to known values when present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_quote_items_billing_period_values'
  ) THEN
    ALTER TABLE quote_items
      ADD CONSTRAINT chk_quote_items_billing_period_values
      CHECK (
        billing_period IS NULL OR billing_period IN ('one-time','monthly','quarterly','annually','annual','yearly','custom')
      );
  END IF;
END$$;

-- Optional informational comment
COMMENT ON COLUMN quote_items.variant_id IS 'Referencia a la variante del servicio seleccionada (si aplica)';
COMMENT ON COLUMN quote_items.billing_period IS 'Periodicidad aplicada a este item (one-time, monthly, quarterly, annually/yearly, custom)';

-- =====================================================
-- END
-- =====================================================
