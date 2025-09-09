-- ============================================
-- TEST SIMPLE DEL SISTEMA DE INVITACIONES
-- ============================================

-- Verificar que las tablas existen
SELECT 'Verificando tablas...' as status;
SELECT 
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'companies') as companies_exists,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'users') as users_exists;

-- Mostrar empresas
SELECT 'EMPRESAS DISPONIBLES:' as info;
SELECT id, name, slug, is_active FROM public.companies;

-- Mostrar usuarios actuales
SELECT 'USUARIOS ACTUALES:' as info;
SELECT email, name, role, active, company_id FROM public.users;

-- Test de función de invitación (con email diferente)
SELECT 'PROBANDO FUNCIÓN DE INVITACIÓN:' as info;
SELECT public.invite_user_to_company(
    'test.invitation@ejemplo.com',
    'Usuario Test Invitacion',
    'member'
) as invitation_result;
