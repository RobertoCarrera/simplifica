-- Add Campaign Trigger Type Enum
DO $$ BEGIN
    CREATE TYPE campaign_trigger_type AS ENUM ('manual', 'birthday', 'inactivity');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Alter marketing_campaigns table
ALTER TABLE public.marketing_campaigns
ADD COLUMN IF NOT EXISTS trigger_type campaign_trigger_type DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

-- Update RLS if needed (existing policies should cover new columns for owners/admins)
-- But ensuring employees/admins can see these new columns is implicit in 'select *' usually.

-- We might want an index on trigger_type and is_active for faster cron lookups
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_automation 
ON public.marketing_campaigns(company_id, trigger_type, is_active);

-- RPC: Get Audience for Automations
CREATE OR REPLACE FUNCTION public.f_marketing_get_automation_audience(
    p_company_id UUID,
    p_trigger_type campaign_trigger_type,
    p_config JSONB
)
RETURNS TABLE (
    client_id UUID,
    name TEXT,
    email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days_inactive INT;
BEGIN
    -- Birthday Trigger
    IF p_trigger_type = 'birthday' THEN
        RETURN QUERY
        SELECT 
            c.id, c.name, c.email
        FROM public.clients c
        WHERE c.company_id = p_company_id
        AND EXTRACT(MONTH FROM c.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(DAY FROM c.birth_date) = EXTRACT(DAY FROM CURRENT_DATE);
    
    -- Inactivity Trigger
    ELSIF p_trigger_type = 'inactivity' THEN
        v_days_inactive := (p_config->>'days')::INT;
        
        RETURN QUERY
        SELECT 
            c.id, c.name, c.email
        FROM public.clients c
        LEFT JOIN public.bookings b ON c.id = b.client_id
        WHERE c.company_id = p_company_id
        GROUP BY c.id
        HAVING 
            MAX(b.start_time) < (now() - (v_days_inactive || ' days')::INTERVAL);
    END IF;
END;
$$;
