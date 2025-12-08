-- Verificar el presupuesto en borrador
SELECT 
  id,
  quote_number,
  status,
  conversion_status,
  quote_date,
  created_at,
  quote_month,
  subtotal,
  tax_amount,
  total_amount
FROM quotes
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
  AND status = 'draft'
ORDER BY created_at DESC;

-- Todos los presupuestos con sus fechas
SELECT 
  quote_number,
  status,
  conversion_status,
  quote_date,
  quote_month,
  subtotal,
  total_amount
FROM quotes
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
ORDER BY quote_date DESC;
