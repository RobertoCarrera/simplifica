-- ============================================
-- BASE AUTH STRUCTURE (MINIMAL & ROBUST)
-- ============================================

-- Companies table (simplified)
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  is_active boolean DEFAULT true,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Users application table (linking to auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  name text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  active boolean DEFAULT true,
  company_id uuid REFERENCES public.companies(id),
  permissions jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_company_id ON public.users(company_id);

-- RLS enable
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Policies (minimal)
DO $$ BEGIN
  -- Users: a user sees / updates only themselves
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'users_select_self' AND tablename = 'users'
  ) THEN
    CREATE POLICY users_select_self ON public.users FOR SELECT USING (auth.uid() = auth_user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'users_update_self' AND tablename = 'users'
  ) THEN
    CREATE POLICY users_update_self ON public.users FOR UPDATE USING (auth.uid() = auth_user_id);
  END IF;
END $$;

-- Companies basic visibility: user can see its company
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'companies_select_own' AND tablename = 'companies'
  ) THEN
    CREATE POLICY companies_select_own ON public.companies FOR SELECT USING (
      id IN (SELECT company_id FROM public.users WHERE auth_user_id = auth.uid())
    );
  END IF;
END $$;

-- Owner/Admin extended policy (phase 2) - placeholder
-- (Add later if needed for managing other users)

-- Helper view (optional) could be added later

-- ============================================
-- END
-- ============================================
