-- Migration: Create Webmail Schema
-- Date: 2026-01-04
-- Author: Simplifica Assistant

-- 1. Mail Accounts
CREATE TABLE IF NOT EXISTS public.mail_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('ses', 'smtp', 'gmail_import')),
    sender_name TEXT, 
    settings JSONB DEFAULT '{}'::jsonb, -- Store specific config like signatures, aliases, color
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Ensure unique email per user/company context if needed, strictly per user for now
    UNIQUE(user_id, email)
);

ALTER TABLE public.mail_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own mail accounts" 
ON public.mail_accounts
FOR ALL 
USING (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE id = mail_accounts.user_id));

-- 2. Mail Folders
CREATE TABLE IF NOT EXISTS public.mail_folders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.mail_accounts(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.mail_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path TEXT NOT NULL, -- Materialized path "Inbox/Clients" for easier UI
    type TEXT NOT NULL CHECK (type IN ('system', 'user')), -- system: inbox, sent, trash, drafts, spam
    system_role TEXT, -- e.g. 'inbox', 'sent' (to identify standard folders regardless of name)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(account_id, path)
);

ALTER TABLE public.mail_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own mail folders" 
ON public.mail_folders
FOR ALL
USING (
    account_id IN (
        SELECT id FROM public.mail_accounts 
        WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    )
);

-- 3. Mail Threads
CREATE TABLE IF NOT EXISTS public.mail_threads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.mail_accounts(id) ON DELETE CASCADE,
    subject TEXT,
    snippet TEXT,
    last_message_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.mail_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own mail threads" 
ON public.mail_threads
FOR ALL
USING (
    account_id IN (
        SELECT id FROM public.mail_accounts 
        WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    )
);

-- 4. Mail Messages
CREATE TABLE IF NOT EXISTS public.mail_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.mail_accounts(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES public.mail_threads(id) ON DELETE SET NULL,
    folder_id UUID REFERENCES public.mail_folders(id) ON DELETE SET NULL,
    
    -- Addressing
    "from" JSONB, -- {name, email}
    "to" JSONB[], -- Array of {name, email}
    "cc" JSONB[],
    "bcc" JSONB[],
    
    subject TEXT,
    body_html TEXT,
    body_text TEXT,
    snippet TEXT,
    
    -- Flags
    is_read BOOLEAN DEFAULT false,
    is_starred BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false, -- Optional, if we treat archive as a folder this might be redundant, but useful for filtering
    
    received_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    metadata JSONB DEFAULT '{}'::jsonb -- Message-ID, Reply-To, References, etc.
);

ALTER TABLE public.mail_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own mail messages" 
ON public.mail_messages
FOR ALL
USING (
    account_id IN (
        SELECT id FROM public.mail_accounts 
        WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    )
);

-- 5. Mail Attachments
CREATE TABLE IF NOT EXISTS public.mail_attachments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID NOT NULL REFERENCES public.mail_messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    size INTEGER,
    content_type TEXT,
    storage_path TEXT, -- S3/Bucket path
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.mail_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attachments of their messages" 
ON public.mail_attachments
FOR SELECT
USING (
    message_id IN (
        SELECT id FROM public.mail_messages 
        WHERE account_id IN (
            SELECT id FROM public.mail_accounts 
            WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
    )
);

-- Indexes for Performance
CREATE INDEX idx_mail_folders_account ON public.mail_folders(account_id);
CREATE INDEX idx_mail_folders_parent ON public.mail_folders(parent_id);
CREATE INDEX idx_mail_messages_account ON public.mail_messages(account_id);
CREATE INDEX idx_mail_messages_folder ON public.mail_messages(folder_id);
CREATE INDEX idx_mail_messages_thread ON public.mail_messages(thread_id);
CREATE INDEX idx_mail_messages_received ON public.mail_messages(received_at DESC);
CREATE INDEX idx_mail_threads_account_updated ON public.mail_threads(account_id, last_message_at DESC);

-- Trigger to update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_mail_accounts_modtime BEFORE UPDATE ON public.mail_accounts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_mail_folders_modtime BEFORE UPDATE ON public.mail_folders FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_mail_threads_modtime BEFORE UPDATE ON public.mail_threads FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_mail_messages_modtime BEFORE UPDATE ON public.mail_messages FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Function to initialize system folders for a new account
CREATE OR REPLACE FUNCTION initialize_mail_account_folders(p_account_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Inbox
    INSERT INTO public.mail_folders (account_id, name, path, type, system_role)
    VALUES (p_account_id, 'Inbox', 'Inbox', 'system', 'inbox')
    ON CONFLICT DO NOTHING;
    
    -- Sent
    INSERT INTO public.mail_folders (account_id, name, path, type, system_role)
    VALUES (p_account_id, 'Sent', 'Sent', 'system', 'sent')
    ON CONFLICT DO NOTHING;
    
    -- Drafts
    INSERT INTO public.mail_folders (account_id, name, path, type, system_role)
    VALUES (p_account_id, 'Drafts', 'Drafts', 'system', 'drafts')
    ON CONFLICT DO NOTHING;
    
    -- Trash
    INSERT INTO public.mail_folders (account_id, name, path, type, system_role)
    VALUES (p_account_id, 'Trash', 'Trash', 'system', 'trash')
    ON CONFLICT DO NOTHING;
    
    -- Spam
    INSERT INTO public.mail_folders (account_id, name, path, type, system_role)
    VALUES (p_account_id, 'Spam', 'Spam', 'system', 'spam')
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create folders on account creation
CREATE OR REPLACE FUNCTION trigger_init_mail_folders()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM initialize_mail_account_folders(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_mail_account_created
AFTER INSERT ON public.mail_accounts
FOR EACH ROW
EXECUTE PROCEDURE trigger_init_mail_folders();
