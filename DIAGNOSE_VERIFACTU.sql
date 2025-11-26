-- =====================================================
-- DIAGNÓSTICO COMPLETO VERIFACTU v2
-- Ejecutar en SQL Editor de Supabase para diagnosticar
-- =====================================================

-- ========== SECCIÓN 1: VERIFICAR INFRAESTRUCTURA ==========

-- 1.1 Schema verifactu
SELECT 'SCHEMA verifactu' as check_item,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'verifactu') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- 1.2 Tablas en verifactu
SELECT 'TABLE verifactu.invoice_meta' as check_item,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'verifactu' AND table_name = 'invoice_meta') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 'TABLE verifactu.events',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'verifactu' AND table_name = 'events') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'TABLE verifactu.invoice_sequence',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'verifactu' AND table_name = 'invoice_sequence') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END;

-- 1.3 Extensión pgcrypto
SELECT 'EXTENSION pgcrypto' as check_item,
    CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- ========== SECCIÓN 2: FUNCIONES CRÍTICAS ==========

SELECT 
    'FUNCTION public.finalize_invoice' as check_item,
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE p.proname = 'finalize_invoice' AND n.nspname = 'public') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL SELECT 
    'FUNCTION public.verifactu_preflight_issue',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE p.proname = 'verifactu_preflight_issue' AND n.nspname = 'public') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL SELECT 
    'FUNCTION verifactu.compute_invoice_hash',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE p.proname = 'compute_invoice_hash' AND n.nspname = 'verifactu') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL SELECT 
    'FUNCTION verifactu.get_next_invoice_number',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE p.proname = 'get_next_invoice_number' AND n.nspname = 'verifactu') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL SELECT 
    'FUNCTION verifactu.compute_vat_breakdown',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE p.proname = 'compute_vat_breakdown' AND n.nspname = 'verifactu') 
         THEN '✅ EXISTS' ELSE '❌ MISSING' END;

-- ========== SECCIÓN 3: COLUMNAS EN INVOICES ==========

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'invoices' 
  AND column_name IN ('finalized_at', 'canonical_payload', 'hash_prev', 'hash_current', 'series_id');

-- ========== SECCIÓN 4: ESTADO ACTUAL DE DATOS ==========

-- 4.1 Conteo registros
SELECT 'RECORDS in verifactu.invoice_meta' as metric, COUNT(*)::text as count FROM verifactu.invoice_meta
UNION ALL
SELECT 'RECORDS in verifactu.events', COUNT(*)::text FROM verifactu.events
UNION ALL
SELECT 'RECORDS in verifactu.invoice_sequence', COUNT(*)::text FROM verifactu.invoice_sequence;

-- 4.2 Últimas facturas (cualquier estado)
SELECT id, invoice_number, state, series_id, finalized_at, hash_current
FROM public.invoices 
ORDER BY created_at DESC 
LIMIT 5;

-- 4.3 Verificar series disponibles
SELECT * FROM public.invoice_series LIMIT 5;

-- ========== SECCIÓN 5: PRUEBA DIRECTA ==========
-- DESCOMENTA Y EJECUTA ESTA SECCIÓN PARA PROBAR CON UNA FACTURA REAL

/*
-- 5.1 Obtener un invoice_id para probar (usa uno en draft o approved)
SELECT id, invoice_number, state, series_id FROM public.invoices WHERE state IN ('draft', 'approved') LIMIT 1;

-- 5.2 Probar verifactu_preflight_issue (REEMPLAZA el UUID)
-- SELECT public.verifactu_preflight_issue('REEMPLAZA-CON-UUID-REAL'::uuid, 'DEV001', 'SOFT001');

-- 5.3 Si falla arriba, probar finalize_invoice directamente
-- SELECT public.finalize_invoice('REEMPLAZA-CON-UUID-REAL'::uuid, 'F', 'DEV001', 'SOFT001');
*/

-- ========== SECCIÓN 6: DETALLES DE FUNCIONES ==========

-- 6.1 Verificar la definición de verifactu_preflight_issue
SELECT pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'verifactu_preflight_issue' AND n.nspname = 'public'
LIMIT 1;

-- 6.2 Verificar signatura de finalize_invoice
SELECT 
    n.nspname as schema, 
    p.proname as name, 
    pg_get_function_arguments(p.oid) as args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'finalize_invoice';

-- ========== SECCIÓN 7: INVOICE_SEQUENCE ==========

SELECT * FROM verifactu.invoice_sequence LIMIT 10;
