-- ========================================================
-- DIAGNÓSTICO: Ver la función convert_quote_to_invoice actual
-- ========================================================
-- Ejecuta esto primero para ver qué código tiene la función actualmente
-- ========================================================

SELECT pg_get_functiondef(oid) as function_definition
FROM pg_proc 
WHERE proname = 'convert_quote_to_invoice';

-- También verificar los valores válidos del enum invoice_status
SELECT enumlabel 
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'invoice_status'
ORDER BY e.enumsortorder;
