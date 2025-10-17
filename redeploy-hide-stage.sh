#!/bin/bash
# =====================================================
# RE-DEPLOY: Fix auth_user_id en Edge Function
# =====================================================

set -e

PROJECT_REF="ufutyjbqfjrlzkprvyvs"
FUNCTION_NAME="hide-stage"

echo "🔧 RE-DESPLEGANDO Edge Function con fix auth_user_id"
echo "===================================================="
echo ""

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}📦 Re-desplegando función corregida...${NC}"
supabase functions deploy $FUNCTION_NAME --project-ref $PROJECT_REF

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Función re-desplegada exitosamente${NC}"
    echo ""
    echo "🎯 FIXES APLICADOS:"
    echo "   1. Cambiado: .select('company_id')"
    echo "      A: .select('id, company_id')"
    echo "   2. Cambiado: .eq('id', user.id)"
    echo "      A: .eq('auth_user_id', user.id)"
    echo "   3. Cambiado: hidden_by: user.id (auth UUID)"
    echo "      A: hidden_by: userId (users.id para FK)"
    echo ""
    echo "📋 Próximo paso:"
    echo "   • Refrescar Angular app (F5)"
    echo "   • Ir a Configuración > Gestionar Estados"
    echo "   • Probar ocultar un estado genérico"
    echo "   • ✅ Debe funcionar ahora sin errores FK"
    echo ""
else
    echo -e "${RED}❌ Error al re-desplegar${NC}"
    exit 1
fi
