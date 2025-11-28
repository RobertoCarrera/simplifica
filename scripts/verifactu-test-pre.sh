#!/bin/bash
# ============================================
# SCRIPT DE PRUEBAS VERIFACTU PRE-PRODUCCIÓN
# ============================================
# Este script valida que todo esté correctamente configurado
# antes de pasar a producción.

# Configuración
SUPABASE_URL="https://ufutyjbqfjrlzkprvyvs.supabase.co"
COMPANY_ID="cd830f43-f6f0-4b78-a2a4-505e4e0976b5"

# Necesitas tu token de sesión (lo obtienes del localStorage después de login)
# O puedes usar el service_role key para pruebas administrativas
echo "============================================"
echo "PRUEBAS VERIFACTU - PRE-PRODUCCIÓN"
echo "============================================"
echo ""

# Test 1: Verificar configuración del dispatcher
echo "📋 Test 1: Configuración del Dispatcher"
echo "----------------------------------------"
curl -s -X POST "${SUPABASE_URL}/functions/v1/verifactu-dispatcher" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_AQUI" \
  -d '{"action": "config"}' | jq .
echo ""

# Test 2: Verificar salud del sistema
echo "📊 Test 2: Salud del Sistema"
echo "----------------------------------------"
curl -s -X POST "${SUPABASE_URL}/functions/v1/verifactu-dispatcher" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_AQUI" \
  -d '{"action": "health"}' | jq .
echo ""

# Test 3: Probar certificado (IMPORTANTE)
echo "🔐 Test 3: Validación de Certificado"
echo "----------------------------------------"
curl -s -X POST "${SUPABASE_URL}/functions/v1/verifactu-dispatcher" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_AQUI" \
  -d "{\"action\": \"test-cert\", \"company_id\": \"${COMPANY_ID}\"}" | jq .
echo ""

echo "============================================"
echo "INSTRUCCIONES"
echo "============================================"
echo ""
echo "1. Reemplaza TU_TOKEN_AQUI con tu token JWT de sesión"
echo "   (Lo encuentras en localStorage -> sb-ufutyjbqfjrlzkprvyvs-auth-token)"
echo ""
echo "2. O usa el service_role key desde el dashboard de Supabase"
echo ""
echo "3. Interpretación de resultados del Test 3:"
echo "   - ✅ 'ok': true + 'signatureTest': '✅ Puede firmar' = TODO OK"
echo "   - ❌ step: 'encryption_key' = Falta VERIFACTU_CERT_ENC_KEY"
echo "   - ❌ step: 'decryption' = La clave de encriptación no coincide"
echo "   - ❌ step: 'format' = El certificado no tiene formato PEM"
echo "   - ❌ signatureTest error = Problema con la firma (contraseña?)"
echo ""
