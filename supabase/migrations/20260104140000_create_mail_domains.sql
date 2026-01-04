-- Migration: Create Mail Domains Table
-- Date: 2026-01-04
-- Author: Simplifica Assistant

CREATE TABLE IF NOT EXISTS public.mail_domains (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    domain TEXT NOT NULL UNIQUE,
    is_verified BOOLEAN DEFAULT false,
    verification_record TEXT, -- DNS TXT record value for verification
    dkim_record TEXT,         -- DNS TXT record for DKIM
    spf_record TEXT,          -- DNS TXT record for SPF
    
    assigned_to_user UUID REFERENCES auth.users(id), -- Owner/User assigned to this domain
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mail_domains ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- 1. Users can view domains assigned to them
CREATE POLICY "Users can view assigned mail domains"
ON public.mail_domains FOR SELECT
USING (
    auth.uid() = assigned_to_user
);

-- 2. Admins (mapped via app logic or role) - For now, we assume admin has db access or we add a role check
-- If using a specific admin role in public.users:
-- CREATE POLICY "Admins can manage all mail domains" ... 
-- (For simplicity, we start with user assignment policy. Admins often bypass RLS via service role in dashboards)

-- Indexes
CREATE INDEX idx_mail_domains_assigned ON public.mail_domains(assigned_to_user);
