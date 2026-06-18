-- Migration: Inbound mail automation
-- Adds:
--   1. inbound_mail_config: per-company inbound mail config (owner-editable)
--   2. aws_jobs: queue for async AWS operations (fallback when sync API fails)
--   3. app_settings entry: inbound_mail_global (superadmin-only)
--   4. RLS policies: tenant-scoped for owner/admin; superadmin bypass
--   5. helper RPCs: ensure_inbound_config, enqueue_aws_job
--
-- Note: this project does NOT have users.is_super_admin. super_admin is
-- determined by users.app_role_id pointing to app_roles.name = 'super_admin'.

-- ════════════════════════════════════════════════════════════════════════════════
-- TABLE: inbound_mail_config
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.inbound_mail_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain text NOT NULL,

  -- Provisioning state
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verifying', 'active', 'failed', 'inactive')),
  ses_rule_name text,
  ses_rule_set_name text,
  mx_record_value text,
  mx_verified boolean NOT NULL DEFAULT false,
  last_provisioned_at timestamptz,
  last_error text,

  -- Owner-editable behavior
  forward_unknown_to text,
  reject_unknown boolean NOT NULL DEFAULT false,
  spam_action text NOT NULL DEFAULT 'mark'
    CHECK (spam_action IN ('mark', 'quarantine', 'reject')),

  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_inbound_mail_config_company
  ON public.inbound_mail_config (company_id);
CREATE INDEX IF NOT EXISTS idx_inbound_mail_config_status
  ON public.inbound_mail_config (status);
CREATE INDEX IF NOT EXISTS idx_inbound_mail_config_domain
  ON public.inbound_mail_config (domain);

COMMENT ON TABLE public.inbound_mail_config IS
  'Per-company configuration for SES inbound mail. Owner can edit behavior; system writes provisioning state.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_inbound_mail_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_inbound_mail_config ON public.inbound_mail_config;
CREATE TRIGGER trg_touch_inbound_mail_config
  BEFORE UPDATE ON public.inbound_mail_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_inbound_mail_config_updated_at();

-- ════════════════════════════════════════════════════════════════════════════════
-- TABLE: aws_jobs
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.aws_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL
    CHECK (job_type IN (
      'ses_receipt_rule_upsert',
      'ses_receipt_rule_delete',
      'route53_mx_upsert',
      'route53_mx_delete',
      'healthcheck_ses_rules'
    )),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  domain text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'dead')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  last_error text,
  run_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aws_jobs_status_run_at
  ON public.aws_jobs (status, run_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_aws_jobs_company
  ON public.aws_jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_aws_jobs_type
  ON public.aws_jobs (job_type);

COMMENT ON TABLE public.aws_jobs IS
  'Queue for AWS operations that may fail or need retries. Processed by aws-jobs-processor cron.';

-- ════════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.inbound_mail_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aws_jobs ENABLE ROW LEVEL SECURITY;

-- Helper predicate: a user is super_admin if their app_role.name = 'super_admin'
-- (this project does not have a users.is_super_admin flag).

-- super_admin: full access to inbound_mail_config
DROP POLICY IF EXISTS inbound_mail_config_super_admin_all ON public.inbound_mail_config;
CREATE POLICY inbound_mail_config_super_admin_all
  ON public.inbound_mail_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.app_roles ar ON ar.id = u.app_role_id
      WHERE u.auth_user_id = auth.uid()
        AND ar.name = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.app_roles ar ON ar.id = u.app_role_id
      WHERE u.auth_user_id = auth.uid()
        AND ar.name = 'super_admin'
    )
  );

-- Company members: read their own company's config
DROP POLICY IF EXISTS inbound_mail_config_company_read ON public.inbound_mail_config;
CREATE POLICY inbound_mail_config_company_read
  ON public.inbound_mail_config FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT u.company_id FROM public.users u
      WHERE u.auth_user_id = auth.uid()
    )
  );

-- Owner/admin/supervisor: update behavior fields of their own company's config
DROP POLICY IF EXISTS inbound_mail_config_company_update_behavior ON public.inbound_mail_config;
CREATE POLICY inbound_mail_config_company_update_behavior
  ON public.inbound_mail_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.app_roles ar ON ar.id = u.app_role_id
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = inbound_mail_config.company_id
        AND ar.name IN ('owner', 'admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.app_roles ar ON ar.id = u.app_role_id
      WHERE u.auth_user_id = auth.uid()
        AND u.company_id = inbound_mail_config.company_id
        AND ar.name IN ('owner', 'admin', 'supervisor')
    )
  );

-- aws_jobs: only super_admin can read
DROP POLICY IF EXISTS aws_jobs_super_admin_read ON public.aws_jobs;
CREATE POLICY aws_jobs_super_admin_read
  ON public.aws_jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.app_roles ar ON ar.id = u.app_role_id
      WHERE u.auth_user_id = auth.uid()
        AND ar.name = 'super_admin'
    )
  );

-- ════════════════════════════════════════════════════════════════════════════════
-- APP SETTINGS: inbound_mail_global
-- ════════════════════════════════════════════════════════════════════════════════

INSERT INTO public.app_settings (key, value, description)
VALUES (
  'inbound_mail_global',
  jsonb_build_object(
    'enabled', true,
    'sandbox_mode', false,
    'rule_set_name', 'default-rule-set',
    'lambda_function_name', 'simplifica-inbound',
    's3_bucket', 'simplifica-inbound-emails',
    'ses_region', 'eu-west-3',
    'default_mx_priority', 10,
    'max_domains_per_company', 5,
    'force_global_rule', true,
    'auto_provision_on_domain_verify', true
  ),
  'Global inbound mail configuration. Only super_admin can edit.'
)
ON CONFLICT (key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════════
-- HELPER RPC: ensure_inbound_config
-- Idempotent: creates inbound_mail_config row for a (company_id, domain) if
-- it doesn't exist. Called by ses-domain-verification and by the wizard.
-- ════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ensure_inbound_config(
  p_company_id uuid,
  p_domain text
)
RETURNS public.inbound_mail_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.inbound_mail_config;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON ar.id = u.app_role_id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden: super_admin required';
  END IF;

  INSERT INTO public.inbound_mail_config (company_id, domain, status)
  VALUES (p_company_id, lower(p_domain), 'pending')
  ON CONFLICT (company_id, domain) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM public.inbound_mail_config
    WHERE company_id = p_company_id AND domain = lower(p_domain);
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_inbound_config(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_inbound_config(uuid, text) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════════
-- HELPER RPC: enqueue_aws_job
-- ════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enqueue_aws_job(
  p_job_type text,
  p_company_id uuid,
  p_domain text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_run_at timestamptz DEFAULT now(),
  p_max_attempts int DEFAULT 5
)
RETURNS public.aws_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.aws_jobs;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON ar.id = u.app_role_id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden: super_admin required';
  END IF;

  INSERT INTO public.aws_jobs (job_type, company_id, domain, payload, run_at, max_attempts)
  VALUES (p_job_type, p_company_id, lower(p_domain), p_payload, p_run_at, p_max_attempts)
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_aws_job(text, uuid, text, jsonb, timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_aws_job(text, uuid, text, jsonb, timestamptz, int) TO service_role;
