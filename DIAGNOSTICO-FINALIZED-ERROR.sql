-- ========================================================
-- DIAGNÓSTICO: ¿De dónde viene 'finalized'?
-- ========================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- ========================================================

-- 1. VER TODAS LAS FUNCIONES QUE CONTIENEN 'convert' O 'quote_to_invoice'
SELECT 
  n.nspname as schema,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) LIKE '%finalized%' AS contiene_finalized,
  pg_get_functiondef(p.oid) LIKE '%draft%' AS contiene_draft
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname LIKE '%convert%' 
   OR p.proname LIKE '%quote_to_invoice%'
ORDER BY n.nspname, p.proname;

-- 2. VER TODOS LOS TRIGGERS EN LA TABLA INVOICES
SELECT 
  t.tgname AS trigger_name,
  CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
  CASE 
    WHEN t.tgtype & 4 = 4 AND t.tgtype & 8 = 8 AND t.tgtype & 16 = 16 THEN 'INSERT/UPDATE/DELETE'
    WHEN t.tgtype & 4 = 4 AND t.tgtype & 16 = 16 THEN 'INSERT/UPDATE'
    WHEN t.tgtype & 4 = 4 THEN 'INSERT'
    WHEN t.tgtype & 8 = 8 THEN 'DELETE'
    WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
    ELSE 'UNKNOWN'
  END AS event,
  p.proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'public.invoices'::regclass
  AND NOT t.tgisinternal
ORDER BY trigger_name;

-- 3. VER SI ALGÚN TRIGGER CONTIENE 'finalized'
SELECT 
  t.tgname AS trigger_name,
  p.proname AS function_name,
  pg_get_functiondef(p.oid) LIKE '%finalized%' AS funcion_contiene_finalized
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'public.invoices'::regclass
  AND NOT t.tgisinternal
  AND pg_get_functiondef(p.oid) LIKE '%finalized%';

-- 4. VER EL DEFAULT DE LA COLUMNA STATUS
SELECT 
  column_name,
  column_default,
  data_type,
  udt_name
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'invoices' 
  AND column_name = 'status';

-- 5. VER VALORES VÁLIDOS DEL ENUM
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = 'public.invoice_status'::regtype
ORDER BY enumsortorder;

-- 6. BUSCAR 'finalized' EN TODAS LAS FUNCIONES DEL SCHEMA PUBLIC
SELECT 
  p.proname AS function_name,
  SUBSTRING(pg_get_functiondef(p.oid) FROM 1 FOR 200) AS definition_start
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND pg_get_functiondef(p.oid) LIKE '%finalized%'
  AND pg_get_functiondef(p.oid) LIKE '%invoice%';

-- 7. VER LA DEFINICIÓN COMPLETA DE convert_quote_to_invoice
SELECT pg_get_functiondef(oid) AS full_definition
FROM pg_proc 
WHERE proname = 'convert_quote_to_invoice'
LIMIT 1;
