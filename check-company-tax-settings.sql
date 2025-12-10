-- Check company tax settings
SELECT 
  c.id,
  c.name,
  cs.prices_include_tax,
  cs.iva_enabled,
  cs.iva_rate
FROM companies c
LEFT JOIN company_settings cs ON cs.company_id = c.id
WHERE c.id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';
