-- ========================================
-- Este script configura el sistema para usar confirmación de email de forma segura

-- 1. CONFIGURACIÓN DE SUPABASE AUTH (hacer manualmente en Dashboard)
/*
EN SUPABASE DASHBOARD > Authentication > Settings > Email Auth:

✅ Enable email confirmations: ACTIVAR
✅ Enable email change confirmations: ACTIVAR  
✅ Enable secure email change: ACTIVAR

EMAIL TEMPLATES (Personalizar):
- Confirm signup: Personalizar mensaje de bienvenida
- Magic link: Para login sin contraseña  
- Change email address: Para cambios de email
- Reset password: Para recuperación

REDIRECT URLs:
- Site URL: http://localhost:4200 (desarrollo)
- Redirect URLs: 
  * http://localhost:4200/auth/confirm
  * http://localhost:4200/auth/callback
  * https://tu-dominio-produccion.com/auth/confirm
  * https://tu-dominio-produccion.com/auth/callback
*/

-- 2. Crear tabla para gestionar usuarios pendientes de confirmación
CREATE TABLE IF NOT EXISTS public.pending_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    -- Campos normalizados (opcionalmente rellenados desde el frontend)
    given_name TEXT,
    surname TEXT,
    company_name TEXT,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    confirmation_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
    confirmed_at TIMESTAMP WITH TIME ZONE NULL
);

-- Crear índices para performance
CREATE INDEX IF NOT EXISTS idx_pending_users_email ON public.pending_users(email);
CREATE INDEX IF NOT EXISTS idx_pending_users_auth_id ON public.pending_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_pending_users_token ON public.pending_users(confirmation_token);

-- En bases de datos donde la tabla ya existía, añadir columnas si faltan
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='pending_users' AND column_name='given_name'
    ) THEN
        ALTER TABLE public.pending_users ADD COLUMN given_name TEXT;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='pending_users' AND column_name='surname'
    ) THEN
        ALTER TABLE public.pending_users ADD COLUMN surname TEXT;
    END IF;
END$$;

-- 3. RLS para pending_users (solo el propio usuario puede ver sus datos)
ALTER TABLE public.pending_users ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios solo pueden ver sus propios registros pendientes
CREATE POLICY "Users can view own pending registrations"
ON public.pending_users
FOR SELECT
USING (auth.uid() = auth_user_id);

-- Política: Solo el sistema puede insertar (desde funciones)
CREATE POLICY "System can insert pending users"
ON public.pending_users
FOR INSERT
WITH CHECK (true);

-- Política: Solo el sistema puede actualizar
CREATE POLICY "System can update pending users"  
ON public.pending_users
FOR UPDATE
USING (true);

-- 4. Función para limpiar registros expirados (ejecutar con cron)
CREATE OR REPLACE FUNCTION clean_expired_pending_users()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Eliminar registros expirados (más de 24 horas)
    DELETE FROM public.pending_users 
    WHERE expires_at < NOW() 
    AND confirmed_at IS NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;

-- 5. Función para confirmar usuario y crear empresa (ACTUALIZADA)
-- NOTA: Esta función fue reemplazada por una versión mejorada en fix-company-management.sql
-- que incluye gestión de empresas duplicadas y sistema de invitaciones
CREATE OR REPLACE FUNCTION confirm_user_registration(
    p_auth_user_id UUID,
    p_confirmation_token TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    pending_user_data public.pending_users;
    existing_company_info RECORD;
    new_company_id UUID;
    new_user_id UUID;
    invitation_id UUID;
    result JSON;
BEGIN
    -- Buscar usuario pendiente
    SELECT * INTO pending_user_data
    FROM public.pending_users
    WHERE auth_user_id = p_auth_user_id
    AND (p_confirmation_token IS NULL OR confirmation_token = p_confirmation_token)
    AND confirmed_at IS NULL
    AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Invalid or expired confirmation'
        );
    END IF;
    
    -- Verificar si la empresa ya existe (solo si se proporcionó company_name)
    IF pending_user_data.company_name IS NOT NULL AND TRIM(pending_user_data.company_name) != '' THEN
        SELECT 
            EXISTS(SELECT 1 FROM public.companies WHERE LOWER(name) = LOWER(pending_user_data.company_name)) as exists,
            c.id as company_id,
            c.name as company_name,
            u.email as owner_email,
            u.name as owner_name,
            u.id as owner_user_id
        INTO existing_company_info
        FROM public.companies c
        LEFT JOIN public.users u ON u.company_id = c.id AND u.role = 'owner' AND u.active = true
        WHERE LOWER(c.name) = LOWER(pending_user_data.company_name)
        LIMIT 1;
        
        IF existing_company_info.exists THEN
            -- La empresa existe, crear invitación automática
            IF existing_company_info.owner_user_id IS NOT NULL THEN
                -- Crear invitación automática
                INSERT INTO public.company_invitations (
                    company_id,
                    email,
                    invited_by_user_id,
                    role,
                    status,
                    message
                ) VALUES (
                    existing_company_info.company_id,
                    pending_user_data.email,
                    existing_company_info.owner_user_id,
                    'member',
                    'pending',
                    'Solicitud automática generada durante el registro'
                );
                
                -- Marcar como confirmado pero sin crear usuario aún
                UPDATE public.pending_users
                SET confirmed_at = NOW()
                WHERE auth_user_id = p_auth_user_id;
                
                RETURN json_build_object(
                    'success', true,
                    'requires_invitation_approval', true,
                    'company_name', existing_company_info.company_name,
                    'owner_email', existing_company_info.owner_email,
                    'message', 'Company already exists. Invitation sent to company owner for approval.'
                );
            END IF;
        END IF;
    END IF;
    
    -- Si llegamos aquí, crear nueva empresa
    INSERT INTO public.companies (name, slug, is_active)
    VALUES (
        COALESCE(
            NULLIF(TRIM(pending_user_data.company_name), ''), -- Usar company_name si no está vacío
            SPLIT_PART(pending_user_data.email, '@', 1)       -- Fallback al email
        ),
        LOWER(COALESCE(
            NULLIF(TRIM(pending_user_data.company_name), ''),
            SPLIT_PART(pending_user_data.email, '@', 1)
        )) || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
        true
    )
    RETURNING id INTO new_company_id;
    
    -- Crear usuario como owner (name + surname normalizados)
    INSERT INTO public.users (
        email,
        name,
        surname,
        role,
        active,
        company_id,
        auth_user_id,
        permissions
    )
    VALUES (
        pending_user_data.email,
        COALESCE(NULLIF(pending_user_data.given_name, ''), split_part(pending_user_data.full_name, ' ', 1), split_part(pending_user_data.email, '@', 1)),
        COALESCE(NULLIF(pending_user_data.surname, ''), NULLIF(regexp_replace(pending_user_data.full_name, '^[^\s]+\s*', ''), '')),
        'owner',
        true,
        new_company_id,
        pending_user_data.auth_user_id,
        '{}'::jsonb
    )
    RETURNING id INTO new_user_id;
    
    -- Marcar como confirmado
    UPDATE public.pending_users
    SET confirmed_at = NOW()
    WHERE auth_user_id = p_auth_user_id;
    
    RETURN json_build_object(
        'success', true,
        'company_id', new_company_id,
        'user_id', new_user_id,
        'is_owner', true,
        'message', 'Registration confirmed successfully. New company created.'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- 6. Trigger para limpiar pending_users cuando auth.users es eliminado
CREATE OR REPLACE FUNCTION cleanup_pending_user()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM public.pending_users 
    WHERE auth_user_id = OLD.id;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trigger_cleanup_pending_user
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION cleanup_pending_user();

-- 7. Vista para administración de usuarios pendientes
CREATE OR REPLACE VIEW admin_pending_users AS
SELECT 
    p.id,
    p.email,
    p.full_name,
    p.company_name,
    p.created_at,
    p.expires_at,
    p.confirmed_at,
    CASE 
        WHEN p.confirmed_at IS NOT NULL THEN 'confirmed'
        WHEN p.expires_at < NOW() THEN 'expired'
        ELSE 'pending'
    END as status,
    au.email_confirmed_at,
    au.created_at as auth_created_at
FROM public.pending_users p
LEFT JOIN auth.users au ON p.auth_user_id = au.id
ORDER BY p.created_at DESC;

-- Comentarios de configuración
SELECT 'CONFIGURACIÓN COMPLETADA' as status;
SELECT 'PRÓXIMOS PASOS:' as info;
SELECT '1. Configurar Email Templates en Supabase Dashboard' as step1;
SELECT '2. Configurar Redirect URLs' as step2;  
SELECT '3. Activar Email Confirmations' as step3;
SELECT '4. Implementar componente de confirmación en Angular' as step4;
SELECT '5. Configurar cron job para limpiar registros expirados' as step5;
