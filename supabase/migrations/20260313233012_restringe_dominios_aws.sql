-- 1. Asegurar que la tabla domains tenga la columna company_id
ALTER TABLE IF EXISTS public.domains 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2. Habilitar RLS en la tabla domains
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

-- 3. Borrar políticas anteriores si existen para evitar conflictos
DROP POLICY IF EXISTS "Companies can view their own domains" ON public.domains;
DROP POLICY IF EXISTS "SuperAdmins can do everything on domains" ON public.domains;

-- 4. Crear política de selección basada en company_id
CREATE POLICY "Companies can view their own domains"
ON public.domains
FOR SELECT
USING (
  (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())) OR
  (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin'))
);

-- 5. Crear política de inserción/actualización para SuperAdmins
CREATE POLICY "SuperAdmins can do everything on domains"
ON public.domains
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
);

-- 6. Grant access
GRANT ALL ON public.domains TO authenticated;
