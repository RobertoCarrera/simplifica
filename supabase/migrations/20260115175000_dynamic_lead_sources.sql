-- Create lead_sources table
CREATE TABLE IF NOT EXISTS public.lead_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable read access for company members" ON public.lead_sources
    FOR SELECT
    USING (company_id IN (
        SELECT company_id FROM public.company_members 
        WHERE user_id = auth.uid()
    ));

CREATE POLICY "Enable write access for company owners and admins" ON public.lead_sources
    FOR ALL
    USING (company_id IN (
        SELECT company_id FROM public.company_members 
        WHERE user_id = auth.uid() 
        AND role IN ('owner', 'admin')
    ));

-- Seed default sources for ALL existing companies
DO $$
DECLARE
    comp RECORD;
BEGIN
    FOR comp IN SELECT id FROM public.companies LOOP
        -- Web Form
        INSERT INTO public.lead_sources (company_id, name)
        SELECT comp.id, 'Web Form'
        WHERE NOT EXISTS (SELECT 1 FROM public.lead_sources WHERE company_id = comp.id AND name = 'Web Form');

        -- Doctoralia
        INSERT INTO public.lead_sources (company_id, name)
        SELECT comp.id, 'Doctoralia'
        WHERE NOT EXISTS (SELECT 1 FROM public.lead_sources WHERE company_id = comp.id AND name = 'Doctoralia');

        -- Top Doctors
        INSERT INTO public.lead_sources (company_id, name)
        SELECT comp.id, 'Top Doctors'
        WHERE NOT EXISTS (SELECT 1 FROM public.lead_sources WHERE company_id = comp.id AND name = 'Top Doctors');

        -- WhatsApp
        INSERT INTO public.lead_sources (company_id, name)
        SELECT comp.id, 'WhatsApp'
        WHERE NOT EXISTS (SELECT 1 FROM public.lead_sources WHERE company_id = comp.id AND name = 'WhatsApp');

        -- Phone
        INSERT INTO public.lead_sources (company_id, name)
        SELECT comp.id, 'Teléfono'
        WHERE NOT EXISTS (SELECT 1 FROM public.lead_sources WHERE company_id = comp.id AND name = 'Teléfono');
        
        -- Referral
        INSERT INTO public.lead_sources (company_id, name)
        SELECT comp.id, 'Referido'
        WHERE NOT EXISTS (SELECT 1 FROM public.lead_sources WHERE company_id = comp.id AND name = 'Referido');
        
        -- Other
        INSERT INTO public.lead_sources (company_id, name)
        SELECT comp.id, 'Otro'
        WHERE NOT EXISTS (SELECT 1 FROM public.lead_sources WHERE company_id = comp.id AND name = 'Otro');
    END LOOP;
END $$;

-- Add column to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_source_id UUID REFERENCES public.lead_sources(id);

-- Migrate existing data
-- This assumes standard names match. If enum values differ ('web_form' vs 'Web Form'), we map them.
DO $$
BEGIN
    -- web_form -> Web Form
    UPDATE public.leads l
    SET lead_source_id = ls.id
    FROM public.lead_sources ls
    WHERE l.company_id = ls.company_id 
    AND ls.name = 'Web Form'
    AND l.source::text = 'web_form';

    -- doctoralia -> Doctoralia
    UPDATE public.leads l
    SET lead_source_id = ls.id
    FROM public.lead_sources ls
    WHERE l.company_id = ls.company_id 
    AND ls.name = 'Doctoralia'
    AND l.source::text = 'doctoralia';

    -- top_doctors -> Top Doctors
    UPDATE public.leads l
    SET lead_source_id = ls.id
    FROM public.lead_sources ls
    WHERE l.company_id = ls.company_id 
    AND ls.name = 'Top Doctors'
    AND l.source::text = 'top_doctors';

    -- whatsapp -> WhatsApp
    UPDATE public.leads l
    SET lead_source_id = ls.id
    FROM public.lead_sources ls
    WHERE l.company_id = ls.company_id 
    AND ls.name = 'WhatsApp'
    AND l.source::text = 'whatsapp';

    -- phone -> Teléfono
    UPDATE public.leads l
    SET lead_source_id = ls.id
    FROM public.lead_sources ls
    WHERE l.company_id = ls.company_id 
    AND ls.name = 'Teléfono'
    AND l.source::text = 'phone';
    
    -- referral -> Referido
    UPDATE public.leads l
    SET lead_source_id = ls.id
    FROM public.lead_sources ls
    WHERE l.company_id = ls.company_id 
    AND ls.name = 'Referido'
    AND l.source::text = 'referral';
    
    -- other -> Otro
    UPDATE public.leads l
    SET lead_source_id = ls.id
    FROM public.lead_sources ls
    WHERE l.company_id = ls.company_id 
    AND ls.name = 'Otro'
    AND l.source::text = 'other';
END $$;

-- Make column nullable for now as we might have unmapped sources, but eventually we might want it NOT NULL. 
-- For MVP, keep nullable but prefer usage.
