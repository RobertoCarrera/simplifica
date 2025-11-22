-- Ver si series tiene un campo 'code' o 'name' para el texto de la serie
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'invoiceseries'
  AND column_name IN ('id', 'code', 'name', 'prefix', 'series')
ORDER BY ordinal_position;
