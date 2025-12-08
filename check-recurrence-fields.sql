-- Verificar campos de recurrencia en quotes
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'quotes' 
  AND table_schema = 'public'
  AND column_name LIKE '%recur%'
ORDER BY ordinal_position;

-- Ver presupuestos con recurrencia
SELECT 
  id,
  quote_number,
  status,
  is_recurring,
  recurrence_interval,
  recurrence_unit,
  recurrence_end_date,
  quote_date,
  created_at,
  subtotal,
  total_amount
FROM quotes
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
  AND is_recurring = true
ORDER BY created_at DESC;

-- Ver todas las columnas de quotes (para entender mejor la estructura)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'quotes' AND table_schema = 'public'
ORDER BY ordinal_position;
