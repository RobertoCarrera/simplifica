#!/bin/bash
# Script de diagnóstico completo para VeriFactu Dispatcher
# Ejecuta verificaciones de base de datos y tests de endpoints

set -e

echo "======================================"
echo "DIAGNÓSTICO VERIFACTU DISPATCHER"
echo "======================================"
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SUPABASE_URL="https://ufutyjbqfjrlzkprvyvs.supabase.co"
FUNCTION_URL="${SUPABASE_URL}/functions/v1/verifactu-dispatcher"

echo -e "${YELLOW}[1/5] Verificando permisos del esquema verifactu...${NC}"
echo "Ejecutando: fix-verifactu-permissions.sql"
if command -v supabase &> /dev/null; then
    supabase db execute -f fix-verifactu-permissions.sql || echo -e "${RED}Error aplicando permisos${NC}"
else
    echo -e "${RED}CLI de Supabase no encontrado. Ejecuta manualmente en el SQL Editor:${NC}"
    echo "  cat fix-verifactu-permissions.sql"
fi
echo ""

echo -e "${YELLOW}[2/5] Verificando estructura de tablas...${NC}"
echo "Ejecutando: check-verifactu-tables.sql"
if command -v supabase &> /dev/null; then
    supabase db execute -f check-verifactu-tables.sql || echo -e "${RED}Error verificando tablas${NC}"
else
    echo -e "${RED}CLI de Supabase no encontrado. Ejecuta manualmente en el SQL Editor:${NC}"
    echo "  cat check-verifactu-tables.sql"
fi
echo ""

# Obtener SERVICE_ROLE_KEY del entorno o solicitar
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${YELLOW}SUPABASE_SERVICE_ROLE_KEY no encontrada en variables de entorno${NC}"
    echo "Para tests completos, exporta la variable:"
    echo "  export SUPABASE_SERVICE_ROLE_KEY='tu-service-role-key'"
    echo ""
    echo "Continuando con tests que no requieren service_role..."
    SERVICE_KEY=""
else
    SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
fi

echo -e "${YELLOW}[3/5] Test: Endpoint de configuración${NC}"
curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "apikey: ${SERVICE_KEY:-sb_publishable_dNnMhmfC0luhkc4GazBtSw_l7gWvcqq}" \
  -d '{"action":"config"}' | jq '.' || echo -e "${RED}Falló test de config${NC}"
echo ""

echo -e "${YELLOW}[4/5] Test: Endpoint de diagnóstico${NC}"
curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "apikey: ${SERVICE_KEY:-sb_publishable_dNnMhmfC0luhkc4GazBtSw_l7gWvcqq}" \
  -d '{"action":"diag"}' | jq '.' || echo -e "${RED}Falló test de diagnóstico${NC}"
echo ""

echo -e "${YELLOW}[5/5] Test: Endpoint de health${NC}"
curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "apikey: ${SERVICE_KEY:-sb_publishable_dNnMhmfC0luhkc4GazBtSw_l7gWvcqq}" \
  -d '{"action":"health"}' | jq '.' || echo -e "${RED}Falló test de health${NC}"
echo ""

echo "======================================"
echo -e "${GREEN}DIAGNÓSTICO COMPLETO${NC}"
echo "======================================"
echo ""
echo "Próximos pasos:"
echo "1. Si events_ok o meta_ok = false, verifica permisos en Supabase Dashboard"
echo "2. Si pending_count > 0, el dispatcher debería procesarlos en el próximo ciclo"
echo "3. Si mode = 'mock', los eventos se simularán (no se envían a AEAT real)"
echo "4. Para producción, configura VERIFACTU_MODE=live en las variables de entorno"
echo ""
