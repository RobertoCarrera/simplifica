#!/bin/bash

# Script de prueba y aplicación de correcciones

echo "🚀 INICIANDO CORRECCIÓN DE GESTIÓN DE EMPRESAS"
echo "==============================================="

echo ""
echo "📋 DIAGNÓSTICO INICIAL:"
echo "------------------------"

# Verificar empresas duplicadas
echo "1. Consultando empresas actuales..."
psql "$SUPABASE_DB_URL" -c "
SELECT 
    c.name,
    COUNT(*) as count_companies,
    ARRAY_AGG(c.id ORDER BY c.created_at) as company_ids,
    ARRAY_AGG(c.created_at ORDER BY c.created_at) as created_dates
FROM public.companies c
WHERE c.deleted_at IS NULL
GROUP BY c.name
ORDER BY count_companies DESC, c.name;
"

echo ""
echo "2. Consultando usuarios por empresa..."
psql "$SUPABASE_DB_URL" -c "
SELECT 
    c.name as company_name,
    COUNT(u.id) as user_count,
    STRING_AGG(u.email || ' (' || u.role || ')', ', ') as users
FROM public.companies c
LEFT JOIN public.users u ON c.id = u.company_id AND u.active = true
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name
ORDER BY c.created_at DESC;
"

echo ""
echo "🔧 APLICANDO CORRECCIONES:"
echo "--------------------------"

# Aplicar el script de corrección
echo "3. Ejecutando script de corrección de gestión de empresas..."

if [ -f "database/fix-company-management.sql" ]; then
    psql "$SUPABASE_DB_URL" -f database/fix-company-management.sql
    echo "✅ Script de corrección ejecutado"
else
    echo "❌ No se encontró el archivo database/fix-company-management.sql"
    exit 1
fi

echo ""
echo "📊 VERIFICACIÓN POST-CORRECCIÓN:"
echo "--------------------------------"

echo "4. Verificando estado final de empresas..."
psql "$SUPABASE_DB_URL" -c "
SELECT * FROM admin_company_analysis ORDER BY created_at DESC;
"

echo ""
echo "5. Verificando sistema de invitaciones..."
psql "$SUPABASE_DB_URL" -c "
SELECT 
    table_name, 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'company_invitations' 
ORDER BY ordinal_position;
"

echo ""
echo "6. Verificando funciones creadas..."
psql "$SUPABASE_DB_URL" -c "
SELECT 
    p.proname as function_name,
    p.prokind as kind
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND p.proname IN ('check_company_exists', 'invite_user_to_company', 'accept_company_invitation', 'cleanup_duplicate_companies')
ORDER BY p.proname;
"

echo ""
echo "✅ CORRECCIÓN COMPLETADA"
echo "========================"
echo ""
echo "🎯 PRÓXIMOS PASOS:"
echo "1. Probar registro con empresa nueva ✅"
echo "2. Probar registro con empresa existente (invitación) ✅"
echo "3. Verificar flujo de confirmación de email ✅"
echo "4. Probar aceptación de invitaciones ✅"
echo ""
echo "📱 SERVIDOR DE DESARROLLO:"
echo "http://localhost:4200"
echo ""
echo "🔗 RUTAS DE PRUEBA:"
echo "- /register (registro de usuario)"
echo "- /auth/confirm (confirmación de email)"
echo "- /login (inicio de sesión)"
echo ""
