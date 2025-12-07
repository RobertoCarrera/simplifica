-- =====================================================
-- ADD SCHEDULED CONVERSION DATE TO QUOTES
-- =====================================================
-- Fecha: 2025-01-25
-- Descripción: Añade columna para programar conversión automática
-- de presupuestos a facturas
-- =====================================================

-- Add column for scheduled conversion
ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS scheduled_conversion_date DATE;

-- Create index for efficient querying of scheduled conversions
CREATE INDEX IF NOT EXISTS idx_quotes_scheduled_conversion 
ON quotes (scheduled_conversion_date) 
WHERE scheduled_conversion_date IS NOT NULL AND status = 'accepted';

COMMENT ON COLUMN quotes.scheduled_conversion_date IS 
  'Fecha programada para la conversión automática a factura. Null si no hay conversión programada.';
