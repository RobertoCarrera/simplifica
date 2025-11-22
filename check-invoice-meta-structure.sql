-- Ver TODAS las columnas NOT NULL de invoice_meta
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'verifactu' 
  AND table_name = 'invoice_meta'
  AND is_nullable = 'NO'
ORDER BY ordinal_position;
