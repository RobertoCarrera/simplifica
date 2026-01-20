-- Migration: Create Mail Contacts Table
-- Date: 2026-01-15

CREATE TABLE IF NOT EXISTS public.mail_contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, email)
);

ALTER TABLE public.mail_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own mail contacts"
ON public.mail_contacts
FOR ALL
USING (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE id = mail_contacts.user_id));

CREATE INDEX idx_mail_contacts_user_email ON public.mail_contacts(user_id, email);
