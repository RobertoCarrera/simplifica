-- ============================================================
-- DIAGNÓSTICO COMPLETO: Auth Hook y RPC
-- ============================================================

-- 1. Verificar que las MVs tienen datos
SELECT 'MVs pobladas' as check_type,
       'Facturas' as vista,
       COUNT(*) as filas
FROM analytics.mv_invoice_kpis_monthly
UNION ALL
SELECT 'MVs pobladas', 'Tickets', COUNT(*)
FROM analytics.mv_ticket_kpis_monthly;

-- 2. Ver contenido de las MVs
SELECT 'Contenido Facturas' as tipo,
       period_month, invoices_count, total_sum
FROM analytics.mv_invoice_kpis_monthly
ORDER BY period_month DESC
LIMIT 3;

SELECT 'Contenido Tickets' as tipo,
       period_month, tickets_created, completed_count
FROM analytics.mv_ticket_kpis_monthly
ORDER BY period_month DESC
LIMIT 3;

-- 3. Verificar tu contexto de usuario (SOLO funciona si estás autenticado)
-- Si esto falla con "Missing company_id", el Auth Hook NO está funcionando
DO $$
BEGIN
  RAISE NOTICE 'Tu User ID: %', auth.uid();
  RAISE NOTICE 'Tu Company ID: %', public.get_user_company_id();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ERROR: %', SQLERRM;
  RAISE NOTICE 'El Auth Hook NO está configurado o no has hecho logout/login';
END $$;

-- 4. Probar función RPC de facturas (requiere auth)
-- Si falla, el problema es el Auth Hook
SELECT 'Test RPC Facturas' as test,
       period_month, invoices_count, total_sum
FROM public.f_invoice_kpis_monthly('2025-12-01', '2025-12-31');

-- 5. Probar función RPC de tickets (requiere auth)
SELECT 'Test RPC Tickets' as test,
       period_month, tickets_created, completed_count
FROM public.f_ticket_kpis_monthly('2025-12-01', '2025-12-31');

-- 6. Query directa SIN autenticación (para comparar)
SELECT 'Direct Query Facturas' as test,
       period_month, invoices_count, total_sum
FROM analytics.mv_invoice_kpis_monthly
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
  AND period_month >= '2025-12-01'
ORDER BY period_month DESC;

SELECT 'Direct Query Tickets' as test,
       period_month, tickets_created, completed_count
FROM analytics.mv_ticket_kpis_monthly
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
  AND period_month >= '2025-12-01'
ORDER BY period_month DESC;
