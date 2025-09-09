-- ============================================
-- CREAR TABLA COMPANIES (FALTANTE)
-- ============================================

-- Esta tabla es requerida por el sistema de invitaciones
-- pero no existe en la base de datos actual

CREATE TABLE IF NOT EXISTS public.companies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Habilitar RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Política básica para companies (los usuarios pueden ver su empresa)
CREATE POLICY "Users can view their company" ON public.companies
    FOR SELECT USING (
        id IN (
            SELECT company_id 
            FROM public.users 
            WHERE auth_user_id = auth.uid()
        )
    );

-- Política para que los owners puedan gestionar empresas
CREATE POLICY "Owners can manage companies" ON public.companies
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE auth_user_id = auth.uid() 
            AND role = 'owner'
            AND company_id = public.companies.id
        )
    );

-- Insertar empresa por defecto para desarrollo
INSERT INTO public.companies (name, slug, is_active) 
VALUES ('Empresa Demo', 'demo', true)
ON CONFLICT (slug) DO NOTHING;

-- Mostrar empresas creadas
SELECT id, name, slug, is_active FROM public.companies;
