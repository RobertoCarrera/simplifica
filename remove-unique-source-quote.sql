-- Eliminar el constraint único de source_quote_id
-- Esto permite que múltiples facturas puedan referenciar el mismo presupuesto
-- (necesario para facturación recurrente)

DROP INDEX IF EXISTS public.invoices_source_quote_unique;

-- Comentar la razón del cambio
COMMENT ON COLUMN public.invoices.source_quote_id IS 
  'Presupuesto origen de la factura. Permite múltiples facturas del mismo presupuesto para casos de facturación recurrente.';
