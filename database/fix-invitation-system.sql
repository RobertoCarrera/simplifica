-- ============================================
-- SOLUCIÓN COMPLETA PARA INVITACIONES SUPABASE
-- ============================================

-- PASO 1: Verificar y crear tabla users si no existe
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    active BOOLEAN DEFAULT true,
    permissions JSONB DEFAULT '{}',
    avatar_url TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint único para evitar duplicados
    UNIQUE(email, company_id)
);

-- PASO 2: Habilitar RLS en la tabla users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- PASO 3: Crear políticas RLS permisivas para auth
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Service role can manage all users" ON public.users;

-- Política para que los usuarios vean su propio perfil
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = auth_user_id);

-- Política para que los usuarios actualicen su propio perfil
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = auth_user_id);

-- Política para que el service role (invitaciones) pueda gestionar usuarios
CREATE POLICY "Service role can manage all users" ON public.users
    FOR ALL USING (
        auth.role() = 'service_role' OR 
        auth.role() = 'authenticated'
    );

-- PASO 4: Función para manejar nuevos usuarios de auth.users
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
            -- Buscar la primera empresa activa
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

-- PASO 5: Crear trigger para nuevos usuarios
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- PASO 6: Función específica para invitaciones
CREATE OR REPLACE FUNCTION public.create_invitation(
    user_email TEXT,
    user_name TEXT DEFAULT NULL,
    user_role TEXT DEFAULT 'member',
    target_company_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    company_uuid UUID;
    result JSON;
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

-- PASO 7: Asegurar que existe al menos una empresa
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM companies LIMIT 1) THEN
        INSERT INTO companies (
            id,
            name,
            slug,
            subscription_tier,
            max_users,
            is_active,
            settings
        ) VALUES (
            gen_random_uuid(),
            'Empresa Principal',
            'empresa-principal',
            'enterprise',
            100,
            true,
            '{"default": true}'::jsonb
        );
    END IF;
END $$;

-- PASO 8: Test de la función
-- SELECT public.create_invitation('test@example.com', 'Usuario Test', 'member');

COMMIT;
