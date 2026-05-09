-- Migration: Add Google OAuth2 columns to company_email_accounts
-- Provider: google_workspace now supports OAuth2 (gmail.send scope) in addition to SMTP

BEGIN;

-- Drop the overly restrictive provider check (was only 'ses')
DROP POLICY IF EXISTS "company_email_accounts_provider_check" ON company_email_accounts;
ALTER TABLE company_email_accounts DROP CONSTRAINT IF EXISTS company_email_accounts_provider_check;
-- Re-add with support for google_workspace
ALTER TABLE company_email_accounts ADD CONSTRAINT company_email_accounts_provider_check CHECK (provider IN ('ses', 'google_workspace'));

-- Add OAuth2 columns to company_email_accounts (all nullable for backward compatibility)
ALTER TABLE company_email_accounts
  ADD COLUMN IF NOT EXISTS oauth_client_id        text,
  ADD COLUMN IF NOT EXISTS oauth_client_secret    text,
  ADD COLUMN IF NOT EXISTS oauth_refresh_token     text,
  ADD COLUMN IF NOT EXISTS oauth_token_expiry      timestamptz,
  ADD COLUMN IF NOT EXISTS auth_method             text DEFAULT 'password';

-- Add gmail_api_fallback_triggered to company_email_logs
ALTER TABLE company_email_logs
  ADD COLUMN IF NOT EXISTS gmail_api_fallback_triggered boolean DEFAULT false;

-- Mark existing google_workspace accounts as password auth (backward compat)
UPDATE company_email_accounts
  SET auth_method = 'password'
  WHERE provider_type = 'google_workspace'
    AND (auth_method IS NULL OR auth_method = '');

-- RLS: Allow owners/admins to read their company's OAuth columns
-- (columns are encrypted, so exposing column names is safe)
-- Note: company_members.user_id is the app user id, not auth.uid directly. Map via users table.
DROP POLICY IF EXISTS "company_email_accounts_oauth_read" ON company_email_accounts;
CREATE POLICY "company_email_accounts_oauth_read"
  ON company_email_accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = company_email_accounts.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'admin')
    )
  );

-- RLS: Allow owners/admins to update their company's OAuth columns
DROP POLICY IF EXISTS "company_email_accounts_oauth_update" ON company_email_accounts;
CREATE POLICY "company_email_accounts_oauth_update"
  ON company_email_accounts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = company_email_accounts.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'admin')
    )
  );

COMMENT ON COLUMN company_email_accounts.oauth_client_id IS 'Encrypted OAuth2 client ID';
COMMENT ON COLUMN company_email_accounts.oauth_client_secret IS 'Encrypted OAuth2 client secret';
COMMENT ON COLUMN company_email_accounts.oauth_refresh_token IS 'Encrypted OAuth2 refresh token (offline access)';
COMMENT ON COLUMN company_email_accounts.oauth_token_expiry IS 'Expiry timestamp of current access token';
COMMENT ON COLUMN company_email_accounts.auth_method IS 'Authentication method: ''password'' (SMTP) or ''oauth2'' (Gmail API)';

COMMIT;