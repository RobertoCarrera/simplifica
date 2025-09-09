-- ============================================
-- SETUP COMPLETO DE BASE DE DATOS
-- ============================================

-- PASO 1: Crear tabla companies si no existe
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- PASO 2: Crear tabla users si no existe o actualizar estructura
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID REFERENCES public.companies(id),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    permissions JSONB DEFAULT '{}',
    auth_user_id UUID REFERENCES auth.users(id)
);

-- PASO 3: Habilitar RLS en ambas tablas
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- PASO 4: Políticas RLS para companies
DROP POLICY IF EXISTS "Users can view their company" ON public.companies;
CREATE POLICY "Users can view their company" ON public.companies
    FOR SELECT USING (
        id IN (
            SELECT company_id 
            FROM public.users 
            WHERE auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Owners can manage companies" ON public.companies;
CREATE POLICY "Owners can manage companies" ON public.companies
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE auth_user_id = auth.uid() 
            AND role = 'owner'
            AND company_id = public.companies.id
        )
    );

-- PASO 5: Políticas RLS para users
DROP POLICY IF EXISTS "Users can view company users" ON public.users;
CREATE POLICY "Users can view company users" ON public.users
    FOR SELECT USING (
        company_id IN (
            SELECT company_id 
            FROM public.users 
            WHERE auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can manage own profile" ON public.users;
CREATE POLICY "Users can manage own profile" ON public.users
    FOR UPDATE USING (auth_user_id = auth.uid());

-- PASO 6: Función corregida de invitación
CREATE OR REPLACE FUNCTION public.invite_user_to_company(
    user_email TEXT,
    user_name TEXT,
    user_role TEXT DEFAULT 'member'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    company_record RECORD;
    new_user_id UUID;
    result JSON;
BEGIN
    -- Obtener la empresa del usuario que invita
    SELECT c.* INTO company_record
    FROM public.companies c
    JOIN public.users u ON u.company_id = c.id
    WHERE u.auth_user_id = auth.uid()
    AND c.is_active = true
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No tienes permisos para invitar usuarios'
        );
    END IF;
    
    -- Verificar si el usuario ya existe
    IF EXISTS (SELECT 1 FROM public.users WHERE email = user_email) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El usuario ya existe en el sistema'
        );
    END IF;
    
    -- Validar role
    IF user_role NOT IN ('owner', 'admin', 'member', 'viewer') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Rol no válido'
        );
    END IF;
    
    -- Crear el usuario en public.users
    INSERT INTO public.users (
        company_id, 
        email, 
        name, 
        role, 
        active
    ) VALUES (
        company_record.id,
        user_email,
        user_name,
        user_role,
        true
    ) RETURNING id INTO new_user_id;
    
    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'message', 'Usuario invitado correctamente'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- PASO 7: Insertar empresa demo si no existe
INSERT INTO public.companies (name, slug, is_active) 
VALUES ('Empresa Demo', 'demo', true)
ON CONFLICT (slug) DO NOTHING;

-- PASO 8: Crear usuario inicial si no existe
DO $$
DECLARE
    demo_company_id UUID;
BEGIN
    -- Obtener ID de empresa demo
    SELECT id INTO demo_company_id 
    FROM public.companies 
    WHERE slug = 'demo';
    
    -- Crear usuario inicial si no existe
    INSERT INTO public.users (
        company_id,
        email,
        name,
        role,
        active
    ) VALUES (
        demo_company_id,
        'puchu.carrera@gmail.com',
        'Puchu Carrera',
        'owner',
        true
    ) ON CONFLICT (email) DO NOTHING;
END $$;

-- MOSTRAR RESULTADOS
SELECT 'EMPRESAS CREADAS:' as info;
SELECT id, name, slug, is_active FROM public.companies;

SELECT 'USUARIOS CREADOS:' as info;
SELECT id, email, name, role, active, company_id FROM public.users;
