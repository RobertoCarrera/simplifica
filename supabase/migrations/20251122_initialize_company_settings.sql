-- Initialize company_settings for all companies that don't have it
-- Date: 2025-11-22

BEGIN;

-- Insert default company_settings for all companies that don't have one
INSERT INTO company_settings (company_id, prices_include_tax, iva_enabled, iva_rate)
SELECT 
  id as company_id,
  true as prices_include_tax,  -- Default to prices including tax
  true as iva_enabled,          -- Default to IVA enabled
  21 as iva_rate                -- Default Spanish IVA rate
FROM companies
WHERE id NOT IN (SELECT company_id FROM company_settings);

COMMIT;
