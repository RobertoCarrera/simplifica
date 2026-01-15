-- Create Enums
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'no_answer', 'meeting_scheduled', 'won', 'lost');
CREATE TYPE lead_source AS ENUM ('web_form', 'doctoralia', 'top_doctors', 'whatsapp', 'phone', 'referral', 'other');

-- Create Leads Table
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES mail_accounts(id) ON DELETE SET NULL, -- Optional link to email account if relevant
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL, -- Multi-tenancy
    
    source lead_source NOT NULL DEFAULT 'other',
    status lead_status NOT NULL DEFAULT 'new',
    
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    
    interest TEXT, -- Service they are interested in
    notes TEXT,
    
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    metadata JSONB DEFAULT '{}'::jsonb, -- Store raw dat from Webhooks
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Leads are viewable by company members" ON leads
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM company_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Leads are inserted by company members or service role" ON leads
    FOR INSERT WITH CHECK (
        company_id IN (
            SELECT company_id FROM company_members WHERE user_id = auth.uid()
        ) 
        OR 
        (auth.role() = 'service_role') -- Allow webhooks
    );

CREATE POLICY "Leads are editable by company members" ON leads
    FOR UPDATE USING (
        company_id IN (
            SELECT company_id FROM company_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Leads are deletable by company owner only" ON leads
    FOR DELETE USING (
        company_id IN (
            SELECT company_id FROM company_members WHERE user_id = auth.uid() AND role = 'owner'
        )
    );


-- Interactions Table (Log calls, emails, messages linked to a lead)
CREATE TABLE lead_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Who performed the interaction
    
    type TEXT NOT NULL, -- 'call', 'email', 'whatsapp', 'note'
    summary TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lead_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Interactions viewable by company members" ON lead_interactions
    FOR SELECT USING (
        lead_id IN (
            SELECT id FROM leads WHERE company_id IN (
                SELECT company_id FROM company_members WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Interactions insertable by company members" ON lead_interactions
    FOR INSERT WITH CHECK (
        lead_id IN (
            SELECT id FROM leads WHERE company_id IN (
                SELECT company_id FROM company_members WHERE user_id = auth.uid()
            )
        )
    );
