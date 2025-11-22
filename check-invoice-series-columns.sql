-- Ver columnas de invoice_series (con guion bajo)
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'invoice_series'
ORDER BY ordinal_position;
