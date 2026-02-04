-- Insert a default invoice series for the current user's company if none exists
-- Can be run in Supabase SQL Editor

DO $$
DECLARE
  v_company_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  -- Get the company_id for the current user (assuming they are a member)
  SELECT company_id INTO v_company_id
  FROM company_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    -- Check if a default series already exists
    IF NOT EXISTS (
        SELECT 1 FROM invoice_series 
        WHERE company_id = v_company_id AND is_default = true
    ) THEN
        -- Insert default series
        INSERT INTO invoice_series (
            company_id, 
            series_code, 
            series_name, 
            year, 
            prefix, 
            next_number, 
            is_active, 
            is_default, 
            verifactu_enabled,
            created_by
        ) VALUES (
            v_company_id,
            'GEN',
            'Serie General',
            extract(year from current_date)::integer,
            'F',
            1,
            true,
            true,
            false, -- verifactu disabled by default until configured
            v_user_id
        );
        RAISE NOTICE 'Default invoice series created for company %', v_company_id;
    ELSE
        RAISE NOTICE 'Default invoice series already exists for company %', v_company_id;
    END IF;
  ELSE
    RAISE NOTICE 'No company found for current user';
  END IF;
END $$;
