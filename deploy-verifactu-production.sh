#!/bin/bash
# =====================================================
# Script de Despliegue VeriFactu a Producción
# Fecha: 2025-11-25
# =====================================================

set -e

echo "=========================================="
echo "  VERIFACTU - Despliegue a Producción"
echo "=========================================="
echo ""

# Verificar Supabase CLI
if ! command -v supabase &> /dev/null && ! npx supabase --version &> /dev/null; then
    echo "❌ Supabase CLI no encontrado. Instalar con: npm install -g supabase"
    exit 1
fi

# Usar npx si supabase no está en PATH
SUPABASE_CMD="npx supabase"

# Verificar que estamos en el directorio correcto
if [ ! -d "supabase" ]; then
    echo "❌ Ejecutar desde la raíz del proyecto (donde está la carpeta supabase/)"
    exit 1
fi

echo "📋 PASO 1: Verificar estado del proyecto"
echo "----------------------------------------"
$SUPABASE_CMD status || echo "⚠️  Proyecto no enlazado localmente (ok si usas dashboard)"
echo ""

echo "📋 PASO 2: Generar clave de encriptación para certificados"
echo "---------------------------------------------------------"
# Genera una clave AES-256 de 32 bytes en base64
ENC_KEY=$(openssl rand -base64 32)
echo "🔐 VERIFACTU_CERT_ENC_KEY=$ENC_KEY"
echo ""
echo "⚠️  GUARDA ESTA CLAVE EN UN LUGAR SEGURO"
echo "   Necesitarás configurarla en Supabase Dashboard > Edge Functions > Secrets"
echo ""

echo "📋 PASO 3: Migraciones a aplicar"
echo "--------------------------------"
echo "1. supabase/migrations/20251125_add_nif_to_companies.sql"
echo "2. supabase/migrations/20251125_verifactu_settings_complete.sql"
echo ""
echo "Para aplicar con CLI: $SUPABASE_CMD db push"
echo "O copiar el contenido en Supabase Dashboard > SQL Editor"
echo ""

echo "📋 PASO 4: Edge Functions a desplegar"
echo "-------------------------------------"
echo "Después de aplicar migraciones, ejecutar:"
echo ""
echo "$SUPABASE_CMD functions deploy invoices-pdf"
echo "$SUPABASE_CMD functions deploy verifactu-dispatcher"
echo "$SUPABASE_CMD functions deploy upload-verifactu-cert"
echo "$SUPABASE_CMD functions deploy verifactu-cert-history"
echo ""

echo "📋 PASO 5: Variables de entorno"
echo "-------------------------------"
echo "Configurar en Supabase Dashboard > Edge Functions > Secrets:"
echo ""
echo "VERIFACTU_MODE=mock"
echo "VERIFACTU_CERT_ENC_KEY=<la clave generada arriba>"
echo "ALLOWED_ORIGINS=https://simplifica.app,http://localhost:4200"
echo "VERIFACTU_ENABLE_FALLBACK=true"
echo ""

echo "=========================================="
echo "  Checklist completo en:"
echo "  VERIFACTU_PRODUCTION_CHECKLIST.md"
echo "=========================================="
