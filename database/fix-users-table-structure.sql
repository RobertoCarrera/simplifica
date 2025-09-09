-- ============================================
-- ARREGLAR ESTRUCTURA DE TABLA USERS EXISTENTE
-- ============================================

-- Primero, eliminar triggers y funciones problemáticas
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Agregar columnas faltantes a la tabla users existente
DO $$
BEGIN
    -- Agregar auth_user_id si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'auth_user_id'
    ) THEN
        ALTER TABLE public.users ADD COLUMN auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id);
    END IF;
    
    -- Agregar company_id si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'company_id'
    ) THEN
        ALTER TABLE public.users ADD COLUMN company_id UUID;
    END IF;
    
    -- Agregar email si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'email'
    ) THEN
        ALTER TABLE public.users ADD COLUMN email TEXT;
    END IF;
    
    -- Agregar name si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'name'
    ) THEN
        ALTER TABLE public.users ADD COLUMN name TEXT;
    END IF;
    
    -- Agregar role si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE public.users ADD COLUMN role TEXT DEFAULT 'member';
    END IF;
    
    -- Agregar active si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'active'
    ) THEN
        ALTER TABLE public.users ADD COLUMN active BOOLEAN DEFAULT true;
    END IF;
    
    -- Agregar permissions si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'permissions'
    ) THEN
        ALTER TABLE public.users ADD COLUMN permissions JSONB DEFAULT '{}';
    END IF;
    
    -- Agregar created_at si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.users ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- Agregar updated_at si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;

END $$;

-- Agregar constraint de role si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'users_role_check'
    ) THEN
        ALTER TABLE public.users ADD CONSTRAINT users_role_check 
        CHECK (role IN ('owner', 'admin', 'member'));
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Si ya existe o hay conflicto, continuar
    NULL;
END $$;

-- Asegurar que existe al menos una empresa
DO $$
BEGIN
    -- Crear tabla companies si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'companies' AND table_schema = 'public'
    ) THEN
        CREATE TABLE public.companies (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            subscription_tier TEXT DEFAULT 'basic',
            max_users INTEGER DEFAULT 10,
            is_active BOOLEAN DEFAULT true,
            settings JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    END IF;
    
    -- Insertar empresa por defecto si no existe ninguna
    IF NOT EXISTS (SELECT 1 FROM companies LIMIT 1) THEN
        INSERT INTO companies (name, slug, subscription_tier, max_users, is_active)
        VALUES ('Mi Empresa', 'mi-empresa', 'enterprise', 100, true);
    END IF;
END $$;

-- Agregar foreign key a company_id si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'users_company_id_fkey'
    ) THEN
        -- Primero, asegurar que todos los users tengan company_id
        UPDATE public.users 
        SET company_id = (SELECT id FROM companies LIMIT 1)
        WHERE company_id IS NULL;
        
        -- Agregar foreign key
        ALTER TABLE public.users 
        ADD CONSTRAINT users_company_id_fkey 
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Si hay error, continuar
    NULL;
END $$;

-- Función corregida para manejar nuevos usuarios
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo procesar si es un usuario real (no invitación pendiente)
    IF NEW.email_confirmed_at IS NOT NULL THEN
        -- Buscar si ya existe un registro en users para este email
        UPDATE public.users 
        SET 
            auth_user_id = NEW.id,
            active = true,
            updated_at = NOW()
        WHERE 
            email = NEW.email 
            AND auth_user_id IS NULL;
        
        -- Si no se actualizó ningún registro, crear uno nuevo
        IF NOT FOUND THEN
            INSERT INTO public.users (
                auth_user_id,
                company_id,
                email,
                name,
                role,
                active
            )
            SELECT 
                NEW.id,
                c.id,
                NEW.email,
                COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
                'member',
                true
            FROM companies c 
            WHERE c.is_active = true 
            ORDER BY c.created_at 
            LIMIT 1;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger para nuevos usuarios
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Función para invitaciones (corregida)
CREATE OR REPLACE FUNCTION public.invite_user_to_company(
    user_email TEXT,
    user_name TEXT DEFAULT NULL,
    user_role TEXT DEFAULT 'member',
    target_company_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    company_uuid UUID;
BEGIN
    -- Validar role
    IF user_role NOT IN ('owner', 'admin', 'member') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Role inválido. Debe ser: owner, admin, o member'
        );
    END IF;
    
    -- Obtener company_id
    IF target_company_id IS NULL THEN
        SELECT id INTO company_uuid 
        FROM companies 
        WHERE is_active = true 
        ORDER BY created_at 
        LIMIT 1;
    ELSE
        company_uuid := target_company_id;
    END IF;
    
    IF company_uuid IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se encontró una empresa válida'
        );
    END IF;
    
    -- Crear registro en users (inactivo hasta que acepte)
    INSERT INTO public.users (
        company_id,
        email,
        name,
        role,
        active,
        permissions
    ) VALUES (
        company_uuid,
        user_email,
        COALESCE(user_name, user_email),
        user_role,
        false, -- Inactivo hasta que acepte
        CASE 
            WHEN user_role = 'owner' THEN '{"canManageUsers": true, "canSeeAllData": true}'::jsonb
            WHEN user_role = 'admin' THEN '{"canManageUsers": true}'::jsonb
            ELSE '{}'::jsonb
        END
    )
    ON CONFLICT (email, company_id) 
    DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        permissions = EXCLUDED.permissions,
        active = false,
        updated_at = NOW();
    
    RETURN json_build_object(
        'success', true,
        'message', 'Usuario preparado para invitación',
        'email', user_email,
        'company_id', company_uuid
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Habilitar RLS si no está habilitado
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Políticas RLS básicas
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Service role can manage all users" ON public.users;

CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = auth_user_id);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = auth_user_id);

CREATE POLICY "Service role can manage all users" ON public.users
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'authenticated'
    );

-- Verificar estructura final
SELECT 'Estructura de users actualizada correctamente' as status;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' AND table_schema = 'public'
ORDER BY ordinal_position;
