-- Migration: Allow owner/admin to access all mail messages within their company
-- Legal basis: LOPDGDD Art.87 + RGPD Art.6(1)(f) — corporate email accounts are company
-- property; the owner has legitimate interest in accessing business communications.
-- Condition: The owner must have an internal policy informing professionals that
-- corporate email accounts may be monitored.
--
-- Technical context: mail_accounts already has owner/admin SELECT policy
-- (see 20260403000008_mail_accounts_rls_team_assign.sql). This migration extends
-- the same access to mail_folders, mail_threads, mail_messages, and mail_attachments
-- so that selecting a team member's account in the webmail UI actually works.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: can the current user admin-access a given mail_account?
-- Used in all policies below to avoid repetition.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mail_account_company_admin(p_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mail_accounts ma
    JOIN public.company_members cm_target
      ON cm_target.user_id = ma.user_id
     AND cm_target.status = 'active'
    JOIN public.company_members cm_admin
      ON cm_admin.company_id = cm_target.company_id
     AND cm_admin.status = 'active'
    JOIN public.app_roles ar ON ar.id = cm_admin.role_id
    WHERE ma.id = p_account_id
      AND cm_admin.user_id IN (
            SELECT id FROM public.users WHERE auth_user_id = auth.uid()
          )
      AND ar.name IN ('owner', 'admin', 'super_admin')
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- mail_folders
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage their own mail folders" ON public.mail_folders;

CREATE POLICY "mail_folders_own_or_company_admin"
ON public.mail_folders
FOR ALL
USING (
  -- Own accounts (original behaviour)
  account_id IN (
    SELECT id FROM public.mail_accounts
    WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  )
  OR
  -- Owner/admin: any account in their company
  public.mail_account_company_admin(account_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- mail_threads
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage their own mail threads" ON public.mail_threads;

CREATE POLICY "mail_threads_own_or_company_admin"
ON public.mail_threads
FOR ALL
USING (
  account_id IN (
    SELECT id FROM public.mail_accounts
    WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  )
  OR
  public.mail_account_company_admin(account_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- mail_messages: SELECT + UPDATE (mark-as-read) allowed; INSERT/DELETE
-- stay restricted to own account or system triggers.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage their own mail messages" ON public.mail_messages;

-- SELECT: own OR company admin
CREATE POLICY "mail_messages_select_own_or_company_admin"
ON public.mail_messages
FOR SELECT
USING (
  account_id IN (
    SELECT id FROM public.mail_accounts
    WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  )
  OR
  public.mail_account_company_admin(account_id)
);

-- UPDATE (e.g. mark as read): own OR company admin
CREATE POLICY "mail_messages_update_own_or_company_admin"
ON public.mail_messages
FOR UPDATE
USING (
  account_id IN (
    SELECT id FROM public.mail_accounts
    WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  )
  OR
  public.mail_account_company_admin(account_id)
);

-- INSERT/DELETE: own accounts only (Lambda inserts via service_role, which bypasses RLS)
CREATE POLICY "mail_messages_insert_own"
ON public.mail_messages
FOR INSERT
WITH CHECK (
  account_id IN (
    SELECT id FROM public.mail_accounts
    WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  )
);

CREATE POLICY "mail_messages_delete_own"
ON public.mail_messages
FOR DELETE
USING (
  account_id IN (
    SELECT id FROM public.mail_accounts
    WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- mail_attachments
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view attachments of their messages" ON public.mail_attachments;

CREATE POLICY "mail_attachments_own_or_company_admin"
ON public.mail_attachments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.mail_messages mm
    WHERE mm.id = mail_attachments.message_id
      AND (
        mm.account_id IN (
          SELECT id FROM public.mail_accounts
          WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
        OR public.mail_account_company_admin(mm.account_id)
      )
  )
);

COMMIT;
