-- Tax settings migration for IVA/IRPF configuration
-- App-level defaults
ALTER TABLE IF EXISTS app_settings
  ADD COLUMN IF NOT EXISTS default_prices_include_tax boolean,
  ADD COLUMN IF NOT EXISTS default_iva_enabled boolean,
  ADD COLUMN IF NOT EXISTS default_iva_rate numeric,
  ADD COLUMN IF NOT EXISTS default_irpf_enabled boolean,
  ADD COLUMN IF NOT EXISTS default_irpf_rate numeric;

-- Company-level overrides
ALTER TABLE IF EXISTS company_settings
  ADD COLUMN IF NOT EXISTS prices_include_tax boolean,
  ADD COLUMN IF NOT EXISTS iva_enabled boolean,
  ADD COLUMN IF NOT EXISTS iva_rate numeric,
  ADD COLUMN IF NOT EXISTS irpf_enabled boolean,
  ADD COLUMN IF NOT EXISTS irpf_rate numeric;

-- Optional sensible defaults
UPDATE app_settings SET
  default_prices_include_tax = COALESCE(default_prices_include_tax, false),
  default_iva_enabled = COALESCE(default_iva_enabled, true),
  default_iva_rate = COALESCE(default_iva_rate, 21),
  default_irpf_enabled = COALESCE(default_irpf_enabled, false),
  default_irpf_rate = COALESCE(default_irpf_rate, 15)
WHERE TRUE;
