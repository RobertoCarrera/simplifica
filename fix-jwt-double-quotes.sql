-- ============================================================
-- FIX: Arreglar get_company_id_from_jwt() para evitar double-quotes
-- ============================================================
-- PROBLEMA: auth.jwt() -> 'company_id' devuelve "uuid" (con comillas dobles)
-- SOLUCIÓN: Usar ->> en lugar de -> para extraer texto sin comillas

-- Recrear la función con ->> (text extraction)
CREATE OR REPLACE FUNCTION public.get_company_id_from_jwt()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'company_id')::uuid,                           -- Root level (sin comillas)
    (auth.jwt() -> 'user_metadata' ->> 'company_id')::uuid,        -- user_metadata.company_id
    (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid          -- app_metadata.company_id
  );
$$;

-- Test (debería devolver el UUID limpio ahora)
SELECT 
  'JWT Test' as test,
  public.get_company_id_from_jwt() as company_id,
  auth.uid() as user_id;

-- Test facturas (debería devolver las 6 facturas)
SELECT 
  'Facturas Test' as test,
  COUNT(*) as facturas_count
FROM public.f_invoice_kpis_monthly('2025-12-01', '2025-12-31');

-- Test tickets
SELECT 
  'Tickets Test' as test,
  COUNT(*) as tickets_count
FROM public.f_ticket_kpis_monthly('2025-12-01', '2025-12-31');

-- Test presupuestos
SELECT 
  'Presupuestos Test' as test,
  COUNT(*) as quotes_count
FROM public.f_quote_kpis_monthly('2025-12-01', '2025-12-31');
