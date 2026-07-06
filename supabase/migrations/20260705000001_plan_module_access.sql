-- Plan-based module access: unified resolution for the sidebar.
-- replaces the implicit "every company sees every module" approach with
-- an explicit, FK-driven chain: plan_includes ∪ addons ∪ manual_grants.

-- ─── 1. plan_module_access: which modules are included per plan ─────────────
CREATE TABLE IF NOT EXISTS public.plan_module_access (
  plan_id    text NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES public.modules_catalog(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, module_key)
);

-- Seed: every plan starts with the current included_modules routes, mapped
-- to their modules_catalog equivalents. We use the route strings already
-- stored on plans.included_modules as a one-time backfill.
INSERT INTO public.plan_module_access (plan_id, module_key)
SELECT p.id, m.key
FROM public.plans p
JOIN public.modules_catalog m ON m.key = ANY(p.included_modules)
ON CONFLICT DO NOTHING;

-- ─── 2. company_module_grants: manual per-company module grants ────────────
-- Replaces the implicit company_modules table. Every row is an EXPLICIT
-- decision by the superadmin: either 'active' (granted) or 'revoked' (taken
-- away even if the plan would normally include it).
CREATE TABLE IF NOT EXISTS public.company_module_grants (
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_key  text NOT NULL REFERENCES public.modules_catalog(key) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'revoked')),
  reason      text,                  -- why the superadmin did this
  granted_by  uuid REFERENCES public.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, module_key)
);

-- Backfill: copy existing company_modules rows as 'active' grants.
-- We intentionally use 'active' so the user keeps whatever they had.
INSERT INTO public.company_module_grants (company_id, module_key, status)
SELECT company_id, module_key,
       CASE WHEN status = 'active' THEN 'active' ELSE 'revoked' END
FROM public.company_modules
ON CONFLICT (company_id, module_key) DO NOTHING;

-- ─── 3. company_addon_grants: manual per-company add-on grants ──────────────
-- Same shape as company_module_grants but for addons. A superadmin can gift
-- any add-on to any company at any price (including 0).
CREATE TABLE IF NOT EXISTS public.company_addon_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  addon_id    text NOT NULL REFERENCES public.plan_addons(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'revoked')),
  -- Price override in cents. NULL = use the addon's normal price. 0 = free.
  price_eur_cents_override integer CHECK (price_eur_cents_override IS NULL OR price_eur_cents_override >= 0),
  reason      text,
  granted_by  uuid REFERENCES public.users(id),
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz,           -- nullable: NULL = no expiry
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, addon_id)
);

-- Backfill: existing plan_addons.applies_to_plans (the plan-side list)
-- stays as-is. The company_addon_grants table is a NEW explicit-grant
-- mechanism that the superadmin uses. No automatic backfill needed.

-- ─── 4. companies.subscription_tier: turn the free-text into a real FK ──────
-- First, normalize existing data: any company with NULL or unknown tier
-- gets assigned 'free'. (We refuse to leave any company without a plan.)
UPDATE public.companies
SET subscription_tier = 'free'
WHERE subscription_tier IS NULL
   OR subscription_tier NOT IN (SELECT id FROM public.plans);

-- Now drop and recreate the column as a proper FK with NOT NULL.
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_subscription_tier_fkey;
ALTER TABLE public.companies
  ALTER COLUMN subscription_tier DROP DEFAULT;
ALTER TABLE public.companies
  ALTER COLUMN subscription_tier TYPE text USING subscription_tier;
-- (Type stays text; the FK is what enforces the relationship.)
ALTER TABLE public.companies
  ALTER COLUMN subscription_tier SET NOT NULL;

-- A company without a plan = nothing works. Enforce at the DB level.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'companies_subscription_tier_fkey'
      AND table_name = 'companies'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_subscription_tier_fkey
      FOREIGN KEY (subscription_tier) REFERENCES public.plans(id)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

-- ─── 5. RLS for the new tables ──────────────────────────────────────────────
-- Both new grant tables are superadmin-only (only superadmins can gift or
-- revoke). The sidebar reads through the SECURITY DEFINER RPC, so the
-- underlying tables don't need to be exposed to the authenticated role for
-- SELECT — only for the superadmin to manage them via the admin UI.

ALTER TABLE public.plan_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_module_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_addon_grants ENABLE ROW LEVEL SECURITY;

-- plan_module_access: superadmin can read & write; everyone can read
-- (the sidebar may want to inspect plan contents from the client).
DROP POLICY IF EXISTS plan_module_access_superadmin_all ON public.plan_module_access;
CREATE POLICY plan_module_access_superadmin_all ON public.plan_module_access
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u
             JOIN public.app_roles r ON u.app_role_id = r.id
             WHERE u.auth_user_id = auth.uid() AND r.name = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u
             JOIN public.app_roles r ON u.app_role_id = r.id
             WHERE u.auth_user_id = auth.uid() AND r.name = 'super_admin')
  );

DROP POLICY IF EXISTS plan_module_access_authenticated_read ON public.plan_module_access;
CREATE POLICY plan_module_access_authenticated_read ON public.plan_module_access
  FOR SELECT TO authenticated
  USING (true);

-- company_module_grants: superadmin only.
DROP POLICY IF EXISTS company_module_grants_superadmin_all ON public.company_module_grants;
CREATE POLICY company_module_grants_superadmin_all ON public.company_module_grants
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u
             JOIN public.app_roles r ON u.app_role_id = r.id
             WHERE u.auth_user_id = auth.uid() AND r.name = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u
             JOIN public.app_roles r ON u.app_role_id = r.id
             WHERE u.auth_user_id = auth.uid() AND r.name = 'super_admin')
  );

-- company_addon_grants: superadmin only.
DROP POLICY IF EXISTS company_addon_grants_superadmin_all ON public.company_addon_grants;
CREATE POLICY company_addon_grants_superadmin_all ON public.company_addon_grants
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u
             JOIN public.app_roles r ON u.app_role_id = r.id
             WHERE u.auth_user_id = auth.uid() AND r.name = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u
             JOIN public.app_roles r ON u.app_role_id = r.id
             WHERE u.auth_user_id = auth.uid() AND r.name = 'super_admin')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_module_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_module_grants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_addon_grants TO authenticated;

-- ─── 6. Indexes for the access-check RPCs that will read these ───────────
CREATE INDEX IF NOT EXISTS idx_plan_module_access_plan
  ON public.plan_module_access (plan_id);
CREATE INDEX IF NOT EXISTS idx_company_module_grants_company
  ON public.company_module_grants (company_id, status);
CREATE INDEX IF NOT EXISTS idx_company_addon_grants_company
  ON public.company_addon_grants (company_id, status)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_companies_subscription_tier
  ON public.companies (subscription_tier);

-- ─── 7. Drop the now-redundant included_modules column on plans ─────────────
-- We keep it for one migration as a fallback, then drop in a follow-up.
-- (Doing it now in the same migration would break any in-flight plans read.)
ALTER TABLE public.plans
  ADD CONSTRAINT plans_included_modules_drop_pending
  CHECK (true);  -- placeholder so we can mark the column deprecated
COMMENT ON COLUMN public.plans.included_modules
  IS 'DEPRECATED 2026-07-05: superseded by plan_module_access. Will be dropped in a follow-up migration after we confirm nothing reads it.';

NOTIFY pgrst, 'reload schema';
