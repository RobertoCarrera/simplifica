-- Ver estructura real de la tabla invoices
SELECT 
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'invoices'
  AND column_name IN ('status', 'state', 'voided_at', 'void_reason')
ORDER BY ordinal_position;
