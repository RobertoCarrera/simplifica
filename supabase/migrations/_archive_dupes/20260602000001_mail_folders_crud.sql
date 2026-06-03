-- Migration: Mail folders CRUD with RLS
-- Creates mail_folders table and enables user-managed folders
-- Users can create/rename/delete their own folders for accounts they own
-- System folders (inbox, sent, drafts, trash, spam) are protected
BEGIN;

-- =============================================================================
-- 1. mail_folders table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.mail_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.mail_accounts(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.mail_folders(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (type IN ('system', 'user')),
  system_role VARCHAR(20) CHECK (system_role IN ('inbox', 'sent', 'drafts', 'trash', 'spam')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, path)
);

CREATE INDEX IF NOT EXISTS idx_mail_folders_account ON public.mail_folders(account_id);
CREATE INDEX IF NOT EXISTS idx_mail_folders_parent ON public.mail_folders(parent_id);

-- =============================================================================
-- 2. RLS
-- =============================================================================
ALTER TABLE public.mail_folders ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see folders for accounts they own or have access to
CREATE POLICY "mail_folders_select" ON public.mail_folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.mail_accounts ma
      WHERE ma.id = mail_folders.account_id
        AND ma.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND ma.is_active = true
    )
  );

-- INSERT: user can create user-type folders for accounts they own
-- Only 'user' type allowed; system_role must be NULL
CREATE POLICY "mail_folders_insert" ON public.mail_folders
  FOR INSERT WITH CHECK (
    type = 'user'
    AND system_role IS NULL
    AND EXISTS (
      SELECT 1 FROM public.mail_accounts ma
      WHERE ma.id = mail_folders.account_id
        AND ma.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND ma.is_active = true
    )
  );

-- UPDATE: user can rename their own user-type folders (not system folders)
CREATE POLICY "mail_folders_update" ON public.mail_folders
  FOR UPDATE USING (
    type = 'user'
    AND EXISTS (
      SELECT 1 FROM public.mail_accounts ma
      WHERE ma.id = mail_folders.account_id
        AND ma.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND ma.is_active = true
    )
  ) WITH CHECK (
    type = 'user'
    AND system_role IS NULL
    AND EXISTS (
      SELECT 1 FROM public.mail_accounts ma
      WHERE ma.id = mail_folders.account_id
        AND ma.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND ma.is_active = true
    )
  );

-- DELETE: user can delete their own user-type folders (not system folders)
CREATE POLICY "mail_folders_delete" ON public.mail_folders
  FOR DELETE USING (
    type = 'user'
    AND EXISTS (
      SELECT 1 FROM public.mail_accounts ma
      WHERE ma.id = mail_folders.account_id
        AND ma.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND ma.is_active = true
    )
  );

-- =============================================================================
-- 3. Smart organization setting on mail_accounts
-- =============================================================================
ALTER TABLE public.mail_accounts
  ADD COLUMN IF NOT EXISTS smart_folder_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.mail_accounts.smart_folder_enabled IS 'When true, starring an email auto-creates a folder for the sender and moves the email there';

COMMIT;
