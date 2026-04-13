-- Migration: Company Email Accounts System (corrected RLS)
BEGIN;

-- =============================================================================
-- 1. company_email_accounts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.company_email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  provider VARCHAR(20) NOT NULL DEFAULT 'ses' CHECK (provider IN ('ses')),
  ses_from_email VARCHAR(255),
  ses_iam_role_arn VARCHAR(500),
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, email)
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_company ON public.company_email_accounts(company_id);

-- =============================================================================
-- 2. company_email_settings
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.company_email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_type VARCHAR(50) NOT NULL CHECK (email_type IN (
    'booking_confirmation','invoice','quote','consent',
    'invite','waitlist','inactive_notice','generic'
  )),
  email_account_id UUID REFERENCES public.company_email_accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  fallback_account_id UUID REFERENCES public.company_email_accounts(id) ON DELETE SET NULL,
  custom_subject_template TEXT,
  custom_body_template TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, email_type)
);

CREATE INDEX IF NOT EXISTS idx_email_settings_company ON public.company_email_settings(company_id);

-- =============================================================================
-- 3. company_email_verification
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.company_email_verification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_account_id UUID NOT NULL REFERENCES public.company_email_accounts(id) ON DELETE CASCADE,
  verification_type VARCHAR(20) NOT NULL CHECK (verification_type IN ('spf','dkim','dmarc')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','failed')),
  dns_record_name VARCHAR(255),
  dns_record_value TEXT,
  verified_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email_account_id, verification_type)
);

-- =============================================================================
-- 4. company_email_logs
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.company_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  email_account_id UUID REFERENCES public.company_email_accounts(id) ON DELETE SET NULL,
  email_type VARCHAR(50),
  to_address TEXT NOT NULL,
  subject TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','bounced','complained')),
  message_id VARCHAR(255),
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_company ON public.company_email_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON public.company_email_logs(sent_at DESC);

-- =============================================================================
-- RLS Policies
-- =============================================================================
ALTER TABLE public.company_email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_email_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_email_logs ENABLE ROW LEVEL SECURITY;

-- Helper function for getting user id from auth
CREATE OR REPLACE FUNCTION public.auth_user_id_from_token()
RETURNS UUID AS $$
  SELECT (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) AS uid
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- company_email_accounts RLS
DROP POLICY IF EXISTS "company_email_accounts_select" ON public.company_email_accounts;
DROP POLICY IF EXISTS "company_email_accounts_all" ON public.company_email_accounts;

CREATE POLICY "company_email_accounts_select" ON public.company_email_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = company_email_accounts.company_id
        AND cm.status = 'active'
    )
  );

CREATE POLICY "company_email_accounts_all" ON public.company_email_accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = company_email_accounts.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'admin')
    )
  );

-- company_email_settings RLS
DROP POLICY IF EXISTS "company_email_settings_select" ON public.company_email_settings;
DROP POLICY IF EXISTS "company_email_settings_all" ON public.company_email_settings;

CREATE POLICY "company_email_settings_select" ON public.company_email_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = company_email_settings.company_id
        AND cm.status = 'active'
    )
  );

CREATE POLICY "company_email_settings_all" ON public.company_email_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = company_email_settings.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'admin')
    )
  );

-- company_email_verification RLS
DROP POLICY IF EXISTS "company_email_verification_select" ON public.company_email_verification;
DROP POLICY IF EXISTS "company_email_verification_all" ON public.company_email_verification;

CREATE POLICY "company_email_verification_select" ON public.company_email_verification
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = company_email_verification.company_id
        AND cm.status = 'active'
    )
  );

CREATE POLICY "company_email_verification_all" ON public.company_email_verification
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = company_email_verification.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'admin')
    )
  );

-- company_email_logs RLS
DROP POLICY IF EXISTS "company_email_logs_select" ON public.company_email_logs;
DROP POLICY IF EXISTS "company_email_logs_insert" ON public.company_email_logs;

CREATE POLICY "company_email_logs_select" ON public.company_email_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = company_email_logs.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'admin')
    )
  );

CREATE POLICY "company_email_logs_insert" ON public.company_email_logs
  FOR INSERT WITH CHECK (true);

-- =============================================================================
-- Seed default settings
-- =============================================================================
INSERT INTO public.company_email_settings (company_id, email_type, is_active)
SELECT DISTINCT c.id, et.email_type, true
FROM public.companies c
CROSS JOIN (
  VALUES
    ('booking_confirmation'),
    ('invoice'),
    ('quote'),
    ('consent'),
    ('invite'),
    ('waitlist'),
    ('inactive_notice'),
    ('generic')
) AS et(email_type)
ON CONFLICT (company_id, email_type) DO NOTHING;

COMMIT;
