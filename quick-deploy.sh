#!/bin/bash
# =====================================================
# QUICK START: Deployment completo en 5 minutos
# =====================================================

set -e

PROJECT_REF="ufutyjbqfjrlzkprvyvs"
FUNCTION_NAME="hide-stage"

echo "🚀 DEPLOYMENT RÁPIDO: Edge Function hide-stage"
echo "=============================================="
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Paso 1: Verificar archivos
echo -e "${BLUE}[1/5]${NC} Verificando archivos..."
if [ ! -f "supabase/functions/${FUNCTION_NAME}/index.ts" ]; then
    echo -e "${RED}❌ Error: No se encuentra la Edge Function${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Archivos encontrados${NC}"
echo ""

# Paso 2: Desplegar función
echo -e "${BLUE}[2/5]${NC} Desplegando Edge Function..."
supabase functions deploy $FUNCTION_NAME --project-ref $PROJECT_REF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Función desplegada${NC}"
else
    echo -e "${RED}❌ Error en deployment${NC}"
    exit 1
fi
echo ""

# Paso 3: Recordatorio de env vars
echo -e "${BLUE}[3/5]${NC} Variables de entorno (MANUAL)"
echo -e "${YELLOW}⚠️  Necesitas configurar en Supabase Dashboard:${NC}"
echo ""
echo "   🔗 URL: https://supabase.com/dashboard/project/$PROJECT_REF/settings/functions"
echo ""
echo "   Variables requeridas:"
echo "   • SUPABASE_URL = https://ufutyjbqfjrlzkprvyvs.supabase.co"
echo "   • SUPABASE_SERVICE_ROLE_KEY = <desde Project Settings > API>"
echo "   • ALLOW_ALL_ORIGINS = true"
echo ""
read -p "Presiona ENTER cuando hayas configurado las variables de entorno..."
echo ""

# Paso 4: Test básico
echo -e "${BLUE}[4/5]${NC} Probando función..."
echo "Test OPTIONS (CORS preflight):"

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
  https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/$FUNCTION_NAME \
  -H "Origin: http://localhost:4200")

if [ "$RESPONSE" = "200" ]; then
    echo -e "${GREEN}✅ CORS funciona (200 OK)${NC}"
else
    echo -e "${YELLOW}⚠️  CORS responde con: $RESPONSE${NC}"
    echo "   (Puede tardar unos segundos en activarse)"
fi
echo ""

# Paso 5: Ver logs
echo -e "${BLUE}[5/5]${NC} Verificando logs..."
echo "Últimos logs de la función:"
echo ""
supabase functions logs $FUNCTION_NAME --project-ref $PROJECT_REF --limit 5
echo ""

# Resumen final
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETADO${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "📋 Próximos pasos:"
echo ""
echo "1. Ver logs en tiempo real:"
echo "   supabase functions logs $FUNCTION_NAME --project-ref $PROJECT_REF --follow"
echo ""
echo "2. Probar desde Angular UI:"
echo "   • http://localhost:4200/configuracion/estados"
echo "   • Click 'Ocultar' en un estado genérico"
echo "   • Verificar que funciona sin error 403"
echo ""
echo "3. Si hay problemas:"
echo "   • Ver: EDGE_FUNCTION_DEPLOYMENT_GUIDE.md"
echo "   • Troubleshooting completo en ese archivo"
echo ""
echo "🎉 ¡Listo para usar!"
