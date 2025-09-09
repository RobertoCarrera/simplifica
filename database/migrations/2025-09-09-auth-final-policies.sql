-- =============================================================
-- FINAL AUTH POLICIES (MINIMAL CORE) - 2025-09-09
-- Ejecutar después de cleanup v1/v2 y (opcional) migración user_profiles.
-- Objetivo: dejar SOLO las políticas mínimas y consistentes.
-- =============================================================

-- 1. Deshabilitar RLS temporalmente
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;

-- 2. Eliminar TODAS las políticas previas en users & companies (dinámico)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('users','companies')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 3. Rehabilitar RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 4. Crear políticas mínimas idempotentes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='users_select_self' AND tablename='users') THEN
    EXECUTE 'CREATE POLICY users_select_self ON public.users FOR SELECT USING (auth.uid() = auth_user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='users_update_self' AND tablename='users') THEN
    EXECUTE 'CREATE POLICY users_update_self ON public.users FOR UPDATE USING (auth.uid() = auth_user_id)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='companies_select_own' AND tablename='companies') THEN
    EXECUTE 'CREATE POLICY companies_select_own ON public.companies FOR SELECT USING (id IN (SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()))';
  END IF;
END $$;

-- 5. (Opcional futuro) Política extendida para owners/admins listar usuarios de su empresa
-- DO $$ BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='users_select_company' AND tablename='users') THEN
--     EXECUTE 'CREATE POLICY users_select_company ON public.users FOR SELECT USING ( (auth.uid() = auth_user_id) OR (company_id IN (SELECT company_id FROM public.users WHERE auth_user_id = auth.uid() AND role IN (''owner'',''admin''))) )';
--   END IF;
-- END $$;

-- 6. Verificación
WITH p AS (
  SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('users','companies')
)
SELECT json_build_object(
  'users', (SELECT json_agg(policyname) FROM p WHERE tablename='users'),
  'companies', (SELECT json_agg(policyname) FROM p WHERE tablename='companies')
) AS minimal_policy_state;

-- =============================================================
-- FIN
-- =============================================================
