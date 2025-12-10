-- =============================================================================
-- FIX: Sistema de cálculo de precios con/sin IVA incluido
-- =============================================================================
-- Este script corrige el trigger calculate_quote_item_totals() para que respete
-- la configuración prices_include_tax de la empresa.
--
-- EJECUTAR EN: Supabase SQL Editor
-- =============================================================================

BEGIN;

-- 1. Reemplazar la función de cálculo de quote_items
CREATE OR REPLACE FUNCTION calculate_quote_item_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_prices_include_tax boolean;
  v_divisor numeric;
BEGIN
  -- Obtener configuración de la empresa
  SELECT prices_include_tax INTO v_prices_include_tax 
  FROM company_settings 
  WHERE company_id = NEW.company_id;

  -- Si no hay configuración de empresa, usar la global
  IF v_prices_include_tax IS NULL THEN
    SELECT default_prices_include_tax INTO v_prices_include_tax
    FROM app_settings
    LIMIT 1;
  END IF;

  -- Default: FALSE (precios SIN IVA)
  v_prices_include_tax := COALESCE(v_prices_include_tax, false);

  IF v_prices_include_tax AND NEW.tax_rate > 0 THEN
    -- =============================================
    -- PRECIOS CON IVA INCLUIDO
    -- =============================================
    -- unit_price ya incluye IVA, así que:
    -- total = quantity * unit_price (el usuario ya puso el precio final)
    -- subtotal = total / (1 + tax_rate/100) (extraer base imponible)
    -- tax_amount = total - subtotal

    -- 1. Total bruto (antes de descuento)
    NEW.total := NEW.quantity * NEW.unit_price;
    
    -- 2. Aplicar descuento sobre el total
    NEW.discount_amount := NEW.total * (COALESCE(NEW.discount_percent, 0) / 100);
    NEW.total := NEW.total - NEW.discount_amount;

    -- 3. Extraer base imponible (subtotal) del total
    v_divisor := 1 + (NEW.tax_rate / 100);
    NEW.subtotal := NEW.total / v_divisor;
    
    -- 4. Calcular IVA (la diferencia)
    NEW.tax_amount := NEW.total - NEW.subtotal;
    
  ELSE
    -- =============================================
    -- PRECIOS SIN IVA INCLUIDO (comportamiento tradicional)
    -- =============================================
    -- unit_price es el precio neto, hay que añadir IVA

    -- 1. Subtotal = quantity * unit_price
    NEW.subtotal := NEW.quantity * NEW.unit_price;
    
    -- 2. Aplicar descuento
    NEW.discount_amount := NEW.subtotal * (COALESCE(NEW.discount_percent, 0) / 100);
    NEW.subtotal := NEW.subtotal - NEW.discount_amount;
    
    -- 3. Calcular IVA sobre la base imponible
    NEW.tax_amount := NEW.subtotal * (NEW.tax_rate / 100);
    
    -- 4. Total = base + IVA
    NEW.total := NEW.subtotal + NEW.tax_amount;
  END IF;
  
  -- Redondear a 2 decimales
  NEW.subtotal := ROUND(NEW.subtotal, 2);
  NEW.tax_amount := ROUND(NEW.tax_amount, 2);
  NEW.total := ROUND(NEW.total, 2);
  NEW.discount_amount := ROUND(COALESCE(NEW.discount_amount, 0), 2);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_quote_item_totals IS 
'Calcula subtotal, tax_amount y total de quote_items respetando prices_include_tax';

-- 2. Verificar que el trigger existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_calculate_quote_item_totals'
  ) THEN
    RAISE NOTICE 'Creando trigger trigger_calculate_quote_item_totals...';
    CREATE TRIGGER trigger_calculate_quote_item_totals
      BEFORE INSERT OR UPDATE ON quote_items
      FOR EACH ROW
      EXECUTE FUNCTION calculate_quote_item_totals();
  ELSE
    RAISE NOTICE 'Trigger ya existe, la función se ha actualizado.';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN: Ejecutar después del COMMIT para verificar
-- =============================================================================
/*
-- Ver la configuración de tu empresa
SELECT 
  c.name as empresa,
  cs.prices_include_tax
FROM companies c
LEFT JOIN company_settings cs ON cs.company_id = c.id
WHERE c.id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';

-- Debería mostrar: prices_include_tax = true
*/
