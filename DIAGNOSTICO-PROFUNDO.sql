-- ============================================================================
-- DIAGNÓSTICO PROFUNDO: ¿De dónde viene 'finalized'?
-- ============================================================================
-- EJECUTA ESTO PRIMERO para ver qué está pasando

-- 1. Ver el DEFAULT de la columna status en invoices
SELECT 
  column_name,
  column_default,
  data_type,
  udt_name
FROM information_schema.columns 
WHERE table_name = 'invoices' 
AND column_name = 'status';

-- 2. Ver los valores válidos del enum invoice_status
SELECT unnest(enum_range(NULL::invoice_status)) as valid_values;

-- 3. Ver TODAS las funciones convert_quote_to_invoice y sus OIDs
SELECT 
  p.oid,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  n.nspname as schema
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname LIKE '%convert_quote%';

-- 4. Ver el código de CADA función convert_quote_to_invoice
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN 
    SELECT p.oid, n.nspname || '.' || p.proname as fullname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'convert_quote_to_invoice'
  LOOP
    RAISE NOTICE '=== FUNCIÓN: % (OID: %) ===', r.fullname, r.oid;
    RAISE NOTICE '%', pg_get_functiondef(r.oid);
    RAISE NOTICE '---';
  END LOOP;
END $$;

-- 5. Buscar 'finalized' en TODOS los triggers de la tabla invoices
SELECT 
  tg.tgname as trigger_name,
  p.proname as function_name,
  pg_get_triggerdef(tg.oid) as trigger_def
FROM pg_trigger tg
JOIN pg_proc p ON tg.tgfoid = p.oid
JOIN pg_class c ON tg.tgrelid = c.oid
WHERE c.relname = 'invoices';

-- 6. Ver el código de TODOS los triggers que operan sobre invoices
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN 
    SELECT DISTINCT p.oid, p.proname
    FROM pg_trigger tg
    JOIN pg_proc p ON tg.tgfoid = p.oid
    JOIN pg_class c ON tg.tgrelid = c.oid
    WHERE c.relname = 'invoices'
  LOOP
    RAISE NOTICE '=== TRIGGER FUNCTION: % (OID: %) ===', r.proname, r.oid;
    RAISE NOTICE '%', pg_get_functiondef(r.oid);
    RAISE NOTICE '---';
  END LOOP;
END $$;

-- 7. Buscar si hay alguna RULE que afecte invoices
SELECT *
FROM pg_rules
WHERE tablename = 'invoices';

-- 8. Ver si hay políticas RLS que podrían interferir
SELECT 
  schemaname,
  tablename,
  policyname,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'invoices';

-- 9. Buscar 'finalized' en TODAS las funciones de la base de datos
SELECT 
  n.nspname as schema,
  p.proname as function_name,
  p.oid
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.prosrc ILIKE '%finalized%'
AND n.nspname NOT IN ('pg_catalog', 'information_schema');
