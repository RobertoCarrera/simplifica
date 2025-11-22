-- Fix calculate_quote_item_totals to respect prices_include_tax setting
-- V2: Correctly query company_settings table instead of companies table
-- Date: 2025-11-22

begin;

CREATE OR REPLACE FUNCTION calculate_quote_item_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_prices_include_tax boolean;
  v_app_settings record;
  v_company_settings record;
  v_divisor numeric;
BEGIN
  -- Get company settings
  -- FIX: Query company_settings table, not companies table
  SELECT prices_include_tax INTO v_prices_include_tax 
  FROM company_settings 
  WHERE company_id = NEW.company_id;

  -- If company setting is null, fallback to app_settings
  IF v_prices_include_tax IS NULL THEN
    SELECT default_prices_include_tax INTO v_prices_include_tax
    FROM app_settings
    LIMIT 1;
  END IF;

  -- Default to false if still null
  v_prices_include_tax := COALESCE(v_prices_include_tax, false);

  IF v_prices_include_tax AND NEW.tax_rate > 0 THEN
    -- INCLUSIVE TAX LOGIC
    -- unit_price is gross (includes tax)
    -- Total line gross = quantity * unit_price
    -- We need to back-calculate subtotal (net)
    
    -- 1. Calculate Gross Total for line
    NEW.total := NEW.quantity * NEW.unit_price;
    
    -- 2. Calculate Discount Amount (applied on Gross or Net? Usually on Gross for inclusive)
    -- If discount_percent is 10%, it reduces the total price by 10%.
    NEW.discount_amount := NEW.total * (COALESCE(NEW.discount_percent, 0) / 100);
    NEW.total := NEW.total - NEW.discount_amount;

    -- 3. Back-calculate Subtotal (Net) from Total
    v_divisor := 1 + (NEW.tax_rate / 100);
    NEW.subtotal := NEW.total / v_divisor;
    
    -- 4. Calculate Tax Amount
    NEW.tax_amount := NEW.total - NEW.subtotal;
    
  ELSE
    -- EXCLUSIVE TAX LOGIC (Original)
    -- unit_price is net (excludes tax)
    
    -- 1. Calculate Subtotal (Net)
    NEW.subtotal := NEW.quantity * NEW.unit_price;
    
    -- 2. Calculate Discount
    NEW.discount_amount := NEW.subtotal * (COALESCE(NEW.discount_percent, 0) / 100);
    NEW.subtotal := NEW.subtotal - NEW.discount_amount;
    
    -- 3. Calculate Tax
    NEW.tax_amount := NEW.subtotal * (NEW.tax_rate / 100);
    
    -- 4. Calculate Total
    NEW.total := NEW.subtotal + NEW.tax_amount;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

commit;
