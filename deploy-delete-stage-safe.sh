#!/bin/bash
# =====================================================
# Script de despliegue de Edge Function: delete-stage-safe
# =====================================================

set -e  # Salir si cualquier comando falla

echo "🚀 Desplegando Edge Function: delete-stage-safe"
echo "=========================================="

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar que estamos en la raíz del proyecto
if [ ! -d "supabase/functions/delete-stage-safe" ]; then
    echo -e "${RED}❌ Error: No se encuentra supabase/functions/delete-stage-safe${NC}"
    echo "   Ejecuta este script desde la raíz del proyecto (f:/simplifica)"
    exit 1
fi

# Project ref (ajusta si cambias de proyecto)
PROJECT_REF="ufutyjbqfjrlzkprvyvs"

echo -e "${YELLOW}📦 Desplegando función...${NC}"
supabase functions deploy delete-stage-safe --project-ref $PROJECT_REF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Función desplegada exitosamente${NC}"
    echo ""
    echo "📋 Próximos pasos:"
    echo ""
    echo "1. Configurar variables de entorno en Supabase Dashboard:"
    echo "   https://supabase.com/dashboard/project/$PROJECT_REF/settings/functions"
    echo ""
    echo "   Variables requeridas:"
    echo "   - SUPABASE_URL=https://$PROJECT_REF.supabase.co"
    echo "   - SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>"
    echo "   - ALLOW_ALL_ORIGINS=true (o usa ALLOWED_ORIGINS con tu(s) dominio(s))"
    echo ""
    echo "2. Ver logs en tiempo real:"
    echo "   supabase functions logs delete-stage-safe --project-ref $PROJECT_REF --follow"
    echo ""
    echo "3. Probar la función desde el frontend (gestión de estados)"
    echo ""
else
    echo -e "${RED}❌ Error al desplegar función${NC}"
    exit 1
fi
