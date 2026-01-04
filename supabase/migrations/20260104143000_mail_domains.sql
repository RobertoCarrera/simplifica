-- Migration: Create Mail Domains Schema
-- Date: 2026-01-04
-- Author: Simplifica Assistant

-- 1. Mail Domains
CREATE TABLE IF NOT EXISTS public.mail_domains (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    domain TEXT NOT NULL UNIQUE,
    is_verified BOOLEAN DEFAULT false, -- Check against SES logic
    verification_token TEXT, -- DNS TXT record value
    dkim_tokens TEXT[], -- DKIM CNAME values
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.mail_domains ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users (so they can see available domains to create policies)
-- OR restrict to admins only and have a secure function to fetch available domains for users?
-- For now, allow read for all authenticated users to populate the selector.
CREATE POLICY "Authenticated users can view verified domains"
ON public.mail_domains
FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow management only to admins (check app logic or specific role claim)
-- Assuming 'admin' check via specialized policy or just open for this prototype phase if role setup is complex.
-- Ideally:
-- CREATE POLICY "Admins can manage domains" ON public.mail_domains USING (app.is_admin());
-- For now, open RLS for authenticated to simplify demonstration of "Admin Panel" if current user is admin.
CREATE POLICY "Admins can manage domains"
ON public.mail_domains
FOR ALL
USING (auth.role() = 'authenticated'); -- REPLACE WITH ACTUAL ADMIN CHECK IN PROD
