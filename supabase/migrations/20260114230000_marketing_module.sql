-- Marketing Module Schema

-- Enums
DO $$ BEGIN
    CREATE TYPE campaign_type AS ENUM ('email', 'whatsapp', 'sms');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'sent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Campaigns Table
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id),
    name TEXT NOT NULL,
    type campaign_type NOT NULL DEFAULT 'email',
    subject TEXT, -- Only for email
    content TEXT NOT NULL,
    target_audience JSONB DEFAULT '{}'::jsonb, -- e.g. {"inactive_days": 60}
    status campaign_status DEFAULT 'draft',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- Logs Table
CREATE TABLE IF NOT EXISTS public.marketing_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    channel campaign_type NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    status TEXT DEFAULT 'sent' -- 'delivered', 'failed', 'opened'
);

-- RLS
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for company members" ON public.marketing_campaigns;
CREATE POLICY "Enable all for company members" ON public.marketing_campaigns
    FOR ALL
    USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Enable all for company members" ON public.marketing_logs;
CREATE POLICY "Enable all for company members" ON public.marketing_logs
    FOR ALL
    USING (campaign_id IN (SELECT id FROM public.marketing_campaigns WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())));


-- RPC: Get Audience (Filtering customers)
CREATE OR REPLACE FUNCTION public.f_marketing_get_audience(
    p_company_id UUID,
    p_criteria JSONB
)
RETURNS TABLE (
    client_id UUID,
    name TEXT,
    email TEXT,
    phone TEXT,
    last_booking_date TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inactive_days INT;
    v_birthday_month INT;
BEGIN
    v_inactive_days := (p_criteria->>'inactive_days')::INT;
    v_birthday_month := (p_criteria->>'birthday_month')::INT;

    RETURN QUERY
    SELECT 
        c.id as client_id,
        c.name,
        c.email,
        c.phone,
        MAX(b.start_time) as last_booking_date
    FROM public.clients c
    LEFT JOIN public.bookings b ON c.id = b.client_id
    WHERE c.company_id = p_company_id
    GROUP BY c.id
    HAVING 
        (v_inactive_days IS NULL OR 
         (MAX(b.start_time) < (now() - (v_inactive_days || ' days')::INTERVAL) OR MAX(b.start_time) IS NULL))
        AND
        (v_birthday_month IS NULL OR 
         EXTRACT(MONTH FROM c.birth_date) = v_birthday_month);
END;
$$;
