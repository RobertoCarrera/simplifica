-- Migration: System folder auto-provisioning + mail_messages RLS
-- Fixes: sent emails not appearing in Sent folder
-- 1. Trigger: auto-creates system folders (inbox, sent, drafts, trash, spam) when mail_account is created
-- 2. RPC: ensure_mail_system_folders(account_id) — retroactive fix for existing accounts
-- 3. RLS policies for mail_messages (INSERT, SELECT, UPDATE, DELETE)
BEGIN;

-- =============================================================================
-- 1. RLS for mail_messages
-- =============================================================================
ALTER TABLE public.mail_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see messages for accounts they own
DROP POLICY IF EXISTS "mail_messages_select" ON public.mail_messages;
CREATE POLICY "mail_messages_select" ON public.mail_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.mail_accounts ma
      WHERE ma.id = mail_messages.account_id
        AND ma.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND ma.is_active = true
    )
  );

-- INSERT: user can insert messages into any folder of accounts they own
DROP POLICY IF EXISTS "mail_messages_insert" ON public.mail_messages;
CREATE POLICY "mail_messages_insert" ON public.mail_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mail_accounts ma
      WHERE ma.id = mail_messages.account_id
        AND ma.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND ma.is_active = true
    )
  );

-- UPDATE: user can update messages in accounts they own
DROP POLICY IF EXISTS "mail_messages_update" ON public.mail_messages;
CREATE POLICY "mail_messages_update" ON public.mail_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.mail_accounts ma
      WHERE ma.id = mail_messages.account_id
        AND ma.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND ma.is_active = true
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mail_accounts ma
      WHERE ma.id = mail_messages.account_id
        AND ma.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND ma.is_active = true
    )
  );

-- DELETE: user can delete messages in accounts they own
DROP POLICY IF EXISTS "mail_messages_delete" ON public.mail_messages;
CREATE POLICY "mail_messages_delete" ON public.mail_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.mail_accounts ma
      WHERE ma.id = mail_messages.account_id
        AND ma.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND ma.is_active = true
    )
  );

-- =============================================================================
-- 2. Function: create system folders for a mail_account
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_mail_system_folders(p_account_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_system_folders JSONB[] := ARRAY[
    '{"name": "Inbox",   "path": "/Inbox",   "system_role": "inbox"}'::JSONB,
    '{"name": "Sent",    "path": "/Sent",    "system_role": "sent"}'::JSONB,
    '{"name": "Drafts",  "path": "/Drafts",  "system_role": "drafts"}'::JSONB,
    '{"name": "Trash",   "path": "/Trash",   "system_role": "trash"}'::JSONB,
    '{"name": "Spam",    "path": "/Spam",    "system_role": "spam"}'::JSONB
  ];
  v_folder JSONB;
BEGIN
  FOREACH v_folder IN ARRAY v_system_folders LOOP
    INSERT INTO public.mail_folders (account_id, name, path, type, system_role)
    VALUES (
      p_account_id,
      v_folder->>'name',
      v_folder->>'path',
      'system',
      v_folder->>'system_role'
    )
    ON CONFLICT (account_id, path) DO NOTHING;
  END LOOP;
END;
$$;

-- =============================================================================
-- 3. Trigger: auto-create system folders when mail_account is inserted
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_mail_account_create_folders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.create_mail_system_folders(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mail_account_create_folders ON public.mail_accounts;
CREATE TRIGGER trg_mail_account_create_folders
  AFTER INSERT ON public.mail_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_mail_account_create_folders();

-- =============================================================================
-- 4. RPC: ensure system folders exist (for retroactive fix and runtime safety)
--    Call this from the frontend to guarantee folders exist before saving.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ensure_mail_system_folders(p_account_id UUID)
RETURNS TABLE(folder_id UUID, system_role TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.create_mail_system_folders(p_account_id);

  RETURN QUERY
    SELECT mf.id, mf.system_role
    FROM public.mail_folders mf
    WHERE mf.account_id = p_account_id
      AND mf.type = 'system'
      AND mf.system_role IS NOT NULL;
END;
$$;

-- =============================================================================
-- 5. Retroactive: create system folders for all existing mail_accounts
-- =============================================================================
DO $$
DECLARE
  v_account RECORD;
BEGIN
  FOR v_account IN SELECT id FROM public.mail_accounts LOOP
    PERFORM public.create_mail_system_folders(v_account.id);
  END LOOP;
END;
$$;

COMMIT;
