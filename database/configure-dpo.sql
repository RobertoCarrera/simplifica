-- ========================================
-- CONFIGURACIÓN DEL DATA PROTECTION OFFICER (DPO)
-- ========================================
-- Ejecuta estas consultas en Supabase SQL Editor

-- 1. Ver todos los usuarios disponibles para designar como DPO
SELECT 
    u.id,
    u.email,
    u.is_dpo,
    u.data_access_level,
    u.created_at
FROM public.users u
ORDER BY u.created_at;

-- 2. Designar un usuario como DPO
-- REEMPLAZA 'tu-email@ejemplo.com' con el email del usuario que será DPO
UPDATE public.users 
SET 
    is_dpo = true,
    data_access_level = 'admin',  -- DPO necesita acceso administrativo
    updated_at = now()
WHERE email = 'robertocarreratech@gmail.com';

-- 3. Verificar que el DPO fue configurado correctamente
SELECT 
    u.id,
    u.email,
    u.is_dpo,
    u.data_access_level,
    CASE 
        WHEN u.is_dpo = true THEN '✅ Data Protection Officer'
        ELSE '👤 Usuario Regular'
    END as role_status
FROM public.users u
WHERE u.is_dpo = true OR u.email = 'robertocarreratech@gmail.com';

-- 4. (OPCIONAL) Crear registro en el log de auditoría del cambio
-- ✅ CORRECTO - Usando old_values y new_values y auth_user_id correcto
INSERT INTO public.gdpr_audit_log (
    table_name,
    action_type,      -- 'update' en minúsculas
    record_id,
    old_values,       -- JSON con valores anteriores
    new_values,       -- JSON con valores nuevos
    user_id,          -- Debe ser auth_user_id, no el id de public.users
    legal_basis,
    purpose
) VALUES (
    'users',
    'update',         -- Minúsculas según constraint
    (SELECT id FROM public.users WHERE email = 'robertocarreratech@gmail.com'),
    jsonb_build_object('is_dpo', false),  -- Valor anterior
    jsonb_build_object(               -- Valores nuevos
        'is_dpo', true,
        'data_access_level', 'admin',
        'dpo_designation_date', now(),
        'reason', 'DPO designation for GDPR compliance'
    ),
    (SELECT auth_user_id FROM public.users WHERE email = 'robertocarreratech@gmail.com'),  -- ✅ Usar auth_user_id
    'legal_obligation',
    'GDPR compliance - DPO designation as required by Article 37'
);

-- 5. Verificar permisos del DPO
SELECT 
    'DPO Configuration' as check_type,
    CASE 
        WHEN COUNT(*) > 0 THEN '✅ DPO configurado correctamente'
        ELSE '❌ No hay DPO designado'
    END as status,
    COUNT(*) as dpo_count
FROM public.users 
WHERE is_dpo = true;
