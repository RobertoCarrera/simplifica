-- =============================================================
-- AUTH POLICY CLEANUP & MINIMAL BASE (2025-09-09)
-- Objetivo:
--  * Eliminar políticas legacy duplicadas o complejas
--  * Retirar dependencias de user_profiles / get_user_company_id
--  * Instalar sólo las políticas mínimas para `users` y `companies`
--  * Evitar errores 42710 (policy already exists)
--  * Dejar terreno listo para invitaciones simples (fila pre-creada en users)
-- =============================================================

-- 0. SEGURIDAD: Ejecutar con rol con permisos (ej: acceso desde SQL Editor con service role deshabilitado)

-- 1. (OPCIONAL) Deshabilitar temporalmente RLS para cambios masivos
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;

-- 2. ELIMINAR POLÍTICAS LEGACY (si existen)
DO $$ DECLARE rec RECORD; BEGIN
  -- Tabla companies
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Company admins can update their company' AND tablename='companies') THEN
    EXECUTE 'DROP POLICY "Company admins can update their company" ON public.companies';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own company' AND tablename='companies') THEN
    EXECUTE 'DROP POLICY "Users can view their own company" ON public.companies';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_company_data' AND tablename='companies') THEN
    EXECUTE 'DROP POLICY "allow_company_data" ON public.companies';
  END IF;

  -- Tabla users
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role can manage all users' AND tablename='users') THEN
    EXECUTE 'DROP POLICY "Service role can manage all users" ON public.users';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can only see users from their company' AND tablename='users') THEN
    EXECUTE 'DROP POLICY "Users can only see users from their company" ON public.users';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile' AND tablename='users') THEN
    EXECUTE 'DROP POLICY "Users can update own profile" ON public.users';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own profile' AND tablename='users') THEN
    EXECUTE 'DROP POLICY "Users can view own profile" ON public.users';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_company_data' AND tablename='users') THEN
    EXECUTE 'DROP POLICY "allow_company_data" ON public.users';
  END IF;

  -- Tabla user_profiles (legacy) - opcional: limpiar políticas si aún existe
  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    FOR rec IN SELECT policyname FROM pg_policies WHERE tablename='user_profiles'
    LOOP
      -- format('%I', policyname) ya añade comillas si hace falta; no añadir comillas extra
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_profiles', rec.policyname);
    END LOOP;
  END IF;
END $$;

-- 3. RE-ENABLE RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 4. CREAR POLÍTICAS MÍNIMAS (idempotentes)
DO $$ BEGIN
  -- users: SELECT self
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='users_select_self' AND tablename='users') THEN
    EXECUTE 'CREATE POLICY users_select_self ON public.users FOR SELECT USING (auth.uid() = auth_user_id)';
  END IF;
  -- users: UPDATE self
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='users_update_self' AND tablename='users') THEN
    EXECUTE 'CREATE POLICY users_update_self ON public.users FOR UPDATE USING (auth.uid() = auth_user_id)';
  END IF;
  -- companies: SELECT own via users.company_id
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='companies_select_own' AND tablename='companies') THEN
    EXECUTE 'CREATE POLICY companies_select_own ON public.companies FOR SELECT USING (id IN (SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()))';
  END IF;
END $$;

-- 5. (OPCIONAL) DROP FUNCTIONS LEGACY que dependen de user_profiles
DO $$ BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_user_company_id') THEN
      EXECUTE 'DROP FUNCTION public.get_user_company_id();';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_user_role') THEN
      EXECUTE 'DROP FUNCTION public.get_user_role();';
    END IF;
  END IF;
  -- Otras funciones helper (get_current_company_id) si existiera
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_current_company_id') THEN
    EXECUTE 'DROP FUNCTION public.get_current_company_id();';
  END IF;
END $$;

-- 6. (Opcional) Añadir índice único a users.auth_user_id si no existe
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename='users' AND indexname='users_auth_user_id_key'
  ) THEN
    -- Intentar crear UNIQUE si la columna existe
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema='public' AND table_name='users' AND column_name='auth_user_id'
    ) THEN
      EXECUTE 'ALTER TABLE public.users ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id)';
    END IF;
  END IF;
END $$;

-- 7. VERIFY (salida rápida en JSON)
WITH pol AS (
  SELECT tablename, policyname FROM pg_policies 
  WHERE tablename IN ('users','companies')
)
SELECT json_build_object(
  'users_policies', (SELECT json_agg(policyname) FROM pol WHERE tablename='users'),
  'companies_policies', (SELECT json_agg(policyname) FROM pol WHERE tablename='companies')
) AS policy_state;

-- 8. NOTA: Si aún existe `user_profiles`, migrar datos y luego:
--    DROP TABLE public.user_profiles CASCADE;
--    Re-ejecutar este script para limpiar funciones/políticas residuales.

-- FIN