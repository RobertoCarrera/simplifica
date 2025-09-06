-- ==== SETUP MULTI-TENANT DATABASE ====
-- Versión simplificada y funcional sin dependencias complejas
-- Ejecutar en SQL Editor de Supabase

-- 1) Extensiones básicas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2) Función helper para obtener company_id del usuario actual
-- Versión simple: devuelve NULL por ahora (más tarde se conectará con auth)
CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid AS $$
BEGIN
  -- Por ahora devuelve NULL - se actualizará cuando conectemos auth
  -- En producción esto buscará en profiles usando auth.uid()
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3) Función para audit timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4) Esquema principal con UUIDs y soft delete
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE, -- para URLs amigables
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  deleted_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) NOT NULL,
  email text UNIQUE NOT NULL,
  name text,
  role text DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  deleted_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  address jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  deleted_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) NOT NULL,
  name text NOT NULL,
  description text,
  price_cents integer, -- precio en centavos para evitar decimales
  duration_minutes integer,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  deleted_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) NOT NULL,
  client_id uuid REFERENCES public.clients(id) NOT NULL,
  service_id uuid REFERENCES public.services(id),
  type text NOT NULL CHECK (type IN ('service', 'repair')),
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  assigned_to uuid REFERENCES public.users(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  deleted_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.job_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id),
  note text NOT NULL,
  created_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) NOT NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL, -- ruta en storage
  file_size integer,
  mime_type text,
  created_at timestamptz DEFAULT NOW(),
  deleted_at timestamptz NULL
);

-- 5) Índices importantes
CREATE INDEX IF NOT EXISTS idx_clients_company ON public.clients(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_company ON public.jobs(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_services_company ON public.services(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_company ON public.attachments(company_id) WHERE deleted_at IS NULL;

-- 6) Triggers para updated_at
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 7) RLS SIMPLE (por ahora permite todo - se refinará después)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- Políticas temporales que permiten todo (para setup inicial)
CREATE POLICY "temp_allow_all" ON public.companies FOR ALL USING (true);
CREATE POLICY "temp_allow_all" ON public.users FOR ALL USING (true);
CREATE POLICY "temp_allow_all" ON public.clients FOR ALL USING (true);
CREATE POLICY "temp_allow_all" ON public.services FOR ALL USING (true);
CREATE POLICY "temp_allow_all" ON public.jobs FOR ALL USING (true);
CREATE POLICY "temp_allow_all" ON public.job_notes FOR ALL USING (true);
CREATE POLICY "temp_allow_all" ON public.attachments FOR ALL USING (true);

-- 8) Datos de ejemplo para testing (solo si no existen)
INSERT INTO public.companies (id, name, slug) VALUES 
  ('00000000-0000-4000-8000-000000000001', 'Empresa Demo 1', 'demo1'),
  ('00000000-0000-4000-8000-000000000002', 'Empresa Demo 2', 'demo2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (company_id, email, name, role) VALUES 
  ('00000000-0000-4000-8000-000000000001', 'admin@demo1.com', 'Admin Demo 1', 'owner'),
  ('00000000-0000-4000-8000-000000000002', 'admin@demo2.com', 'Admin Demo 2', 'owner')
ON CONFLICT (email) DO NOTHING;

-- Agregar un cliente inicial por empresa para testing
INSERT INTO public.clients (company_id, name, email) 
SELECT '00000000-0000-4000-8000-000000000001', 'Cliente Inicial Demo 1', 'inicial1@demo1.com'
WHERE NOT EXISTS (SELECT 1 FROM public.clients WHERE company_id = '00000000-0000-4000-8000-000000000001');

INSERT INTO public.clients (company_id, name, email) 
SELECT '00000000-0000-4000-8000-000000000002', 'Cliente Inicial Demo 2', 'inicial2@demo2.com'
WHERE NOT EXISTS (SELECT 1 FROM public.clients WHERE company_id = '00000000-0000-4000-8000-000000000002');

-- 9) Verificación
SELECT 'Setup completado. Tablas creadas:' as status;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('companies', 'users', 'clients', 'services', 'jobs', 'job_notes', 'attachments')
ORDER BY table_name;
