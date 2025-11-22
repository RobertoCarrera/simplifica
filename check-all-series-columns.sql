-- Ver TODAS las columnas de invoiceseries
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'invoiceseries'
ORDER BY ordinal_position;
