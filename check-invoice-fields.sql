-- Ver qué campos tiene invoices para mapear a invoice_meta
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'invoices'
  AND column_name IN ('invoice_number', 'series_id', 'series', 'number', 'seriesid', 'created_at', 'issue_date', 'issued_at')
ORDER BY ordinal_position;
