-- ============================================================
-- RESET COMPLETO DE VERIFACTU - Dejar sistema limpio
-- ============================================================
-- Este script elimina todos los datos de VeriFactu pero mantiene
-- la estructura, configuración y datos de negocio intactos.
-- ============================================================

BEGIN;

-- 1. Eliminar todos los eventos VeriFactu
DELETE FROM verifactu.events;

-- 2. Eliminar todos los metadatos VeriFactu de facturas
DELETE FROM verifactu.invoice_meta;

-- 3. Resetear estados de facturas que fueron modificados por VeriFactu
-- Cambiar 'rectified' a 'paid' (asumiendo que estaban pagadas antes de rectificar)
UPDATE public.invoices 
SET status = 'paid', 
    updated_at = NOW()
WHERE status = 'rectified';

-- Cambiar 'void' a 'paid' (facturas que se anularon en VeriFactu)
UPDATE public.invoices 
SET status = 'paid', 
    updated_at = NOW()
WHERE status = 'void';

-- 4. Eliminar presupuestos rectificativos que se crearon
DELETE FROM public.quote_items 
WHERE quote_id IN (
  SELECT id FROM public.quotes WHERE rectifies_invoice_id IS NOT NULL
);

DELETE FROM public.quotes 
WHERE rectifies_invoice_id IS NOT NULL;

-- 5. Opcional: Resetear contadores de cadena (empezar fresh)
-- Si tienes una tabla de contadores, ajústala aquí
-- UPDATE verifactu.chain_state SET last_position = 0, last_hash = NULL WHERE company_id = 'TU_COMPANY_ID';

COMMIT;

-- Verificación
SELECT 
  'Eventos VeriFactu' as tabla,
  COUNT(*) as registros
FROM verifactu.events
UNION ALL
SELECT 
  'Metadatos VeriFactu' as tabla,
  COUNT(*) as registros
FROM verifactu.invoice_meta
UNION ALL
SELECT 
  'Facturas rectificadas' as tabla,
  COUNT(*) as registros
FROM public.invoices
WHERE status = 'rectified'
UNION ALL
SELECT 
  'Facturas anuladas' as tabla,
  COUNT(*) as registros
FROM public.invoices
WHERE status = 'void'
UNION ALL
SELECT 
  'Presupuestos rectificativos' as tabla,
  COUNT(*) as registros
FROM public.quotes
WHERE rectifies_invoice_id IS NOT NULL;
