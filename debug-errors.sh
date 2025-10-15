#!/bin/bash

# =====================================================
# SCRIPT DE DEBUGGING Y VERIFICACIÓN
# =====================================================
# Herramientas para diagnosticar errores en la app
# Uso: ./debug-errors.sh [opcion]
# =====================================================

COLOR_RED='\033[0;31m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_BLUE='\033[0;34m'
COLOR_NC='\033[0m' # No Color

echo -e "${COLOR_BLUE}╔════════════════════════════════════════╗${COLOR_NC}"
echo -e "${COLOR_BLUE}║  🔍 Simplifica - Debug Tool           ║${COLOR_NC}"
echo -e "${COLOR_BLUE}╚════════════════════════════════════════╝${COLOR_NC}"
echo ""

# =====================================================
# FUNCIÓN: Verificar estado de AnyChat
# =====================================================
function check_anychat() {
  echo -e "${COLOR_YELLOW}📡 Verificando AnyChat API...${COLOR_NC}"
  
  # Test de conectividad básico
  response=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "x-api-key: iPLpIQmz5RIVoBigmpjICNC2aOlhXzqVouuNedaCaf01cXuqnIvCD27-lz56Bnys" \
    -H "Content-Type: application/json" \
    "https://api.anychat.one/public/v1/contact?page=1&limit=1")
  
  if [ "$response" == "200" ]; then
    echo -e "${COLOR_GREEN}✅ AnyChat API respondiendo correctamente${COLOR_NC}"
  elif [ "$response" == "000" ]; then
    echo -e "${COLOR_RED}❌ Error de conectividad o CORS bloqueando${COLOR_NC}"
  else
    echo -e "${COLOR_YELLOW}⚠️  AnyChat respondió con código: $response${COLOR_NC}"
  fi
}

# =====================================================
# FUNCIÓN: Verificar configuración de entorno
# =====================================================
function check_environment() {
  echo -e "${COLOR_YELLOW}🔧 Verificando configuración...${COLOR_NC}"
  
  # Verificar archivo de environment
  if [ -f "src/environments/environment.ts" ]; then
    echo -e "${COLOR_GREEN}✅ environment.ts encontrado${COLOR_NC}"
    
    # Verificar API Key
    if grep -q "anychatApiKey:" src/environments/environment.ts; then
      api_key=$(grep "anychatApiKey:" src/environments/environment.ts | cut -d"'" -f2)
      if [ -n "$api_key" ]; then
        echo -e "${COLOR_GREEN}✅ API Key configurada (${#api_key} caracteres)${COLOR_NC}"
      else
        echo -e "${COLOR_RED}❌ API Key vacía${COLOR_NC}"
      fi
    else
      echo -e "${COLOR_RED}❌ anychatApiKey no encontrada en environment${COLOR_NC}"
    fi
  else
    echo -e "${COLOR_RED}❌ environment.ts no encontrado${COLOR_NC}"
  fi
  
  echo ""
}

# =====================================================
# FUNCIÓN: Verificar estado de compilación
# =====================================================
function check_build() {
  echo -e "${COLOR_YELLOW}🏗️  Verificando compilación...${COLOR_NC}"
  
  # Buscar errores comunes en el código
  error_count=0
  
  # Buscar imports faltantes
  if grep -r "import.*from.*anychat" src/app --include="*.ts" | grep -v "node_modules" > /dev/null; then
    echo -e "${COLOR_GREEN}✅ Imports de AnyChat encontrados${COLOR_NC}"
  else
    echo -e "${COLOR_YELLOW}⚠️  No se encontraron imports de AnyChat${COLOR_NC}"
  fi
  
  # Verificar que el interceptor esté registrado
  if grep -q "HttpErrorInterceptor" src/app/app.config.ts; then
    echo -e "${COLOR_GREEN}✅ HttpErrorInterceptor registrado${COLOR_NC}"
  else
    echo -e "${COLOR_YELLOW}⚠️  HttpErrorInterceptor no registrado${COLOR_NC}"
    ((error_count++))
  fi
  
  echo ""
}

# =====================================================
# FUNCIÓN: Buscar errores conocidos en el código
# =====================================================
function scan_known_issues() {
  echo -e "${COLOR_YELLOW}🔎 Escaneando problemas conocidos...${COLOR_NC}"
  
  # 1. Buscar uso de index.html en código (error de parsing)
  if grep -r "index.html" src/app --include="*.ts" | grep -v "assets" | grep -v "node_modules" > /dev/null; then
    echo -e "${COLOR_YELLOW}⚠️  Referencias a index.html encontradas${COLOR_NC}"
  else
    echo -e "${COLOR_GREEN}✅ Sin referencias sospechosas a index.html${COLOR_NC}"
  fi
  
  # 2. Buscar console.error sin manejo
  error_logs=$(grep -r "console.error" src/app --include="*.ts" | wc -l)
  echo -e "${COLOR_BLUE}ℹ️  $error_logs console.error encontrados${COLOR_NC}"
  
  # 3. Verificar política RLS en comentarios
  if grep -r "RLS" src/app --include="*.ts" | grep -i "TODO\|FIXME" > /dev/null; then
    echo -e "${COLOR_YELLOW}⚠️  TODOs relacionados con RLS encontrados${COLOR_NC}"
  else
    echo -e "${COLOR_GREEN}✅ Sin TODOs pendientes de RLS${COLOR_NC}"
  fi
  
  echo ""
}

# =====================================================
# FUNCIÓN: Mostrar estadísticas del proyecto
# =====================================================
function show_stats() {
  echo -e "${COLOR_YELLOW}📊 Estadísticas del proyecto...${COLOR_NC}"
  
  total_ts=$(find src/app -name "*.ts" | wc -l)
  total_services=$(find src/app/services -name "*.service.ts" 2>/dev/null | wc -l)
  total_components=$(find src/app/components -name "*.component.ts" 2>/dev/null | wc -l)
  
  echo -e "${COLOR_BLUE}  TypeScript files: $total_ts${COLOR_NC}"
  echo -e "${COLOR_BLUE}  Services: $total_services${COLOR_NC}"
  echo -e "${COLOR_BLUE}  Components: $total_components${COLOR_NC}"
  
  echo ""
}

# =====================================================
# FUNCIÓN: Test de base de datos (requiere psql)
# =====================================================
function test_database() {
  echo -e "${COLOR_YELLOW}🗄️  Test de base de datos...${COLOR_NC}"
  echo -e "${COLOR_BLUE}ℹ️  Para ejecutar tests SQL, usa Supabase SQL Editor${COLOR_NC}"
  echo -e "${COLOR_BLUE}ℹ️  Archivo: fix-clients-400-error.sql${COLOR_NC}"
  echo ""
}

# =====================================================
# FUNCIÓN: Verificar errores en logs de build
# =====================================================
function check_build_logs() {
  echo -e "${COLOR_YELLOW}📜 Verificando logs de compilación recientes...${COLOR_NC}"
  
  if [ -d "dist" ]; then
    echo -e "${COLOR_GREEN}✅ Directorio dist/ existe (última compilación exitosa)${COLOR_NC}"
    
    # Mostrar fecha de última compilación
    if [ -d "dist/simplifica" ]; then
      last_build=$(stat -c %y "dist/simplifica" 2>/dev/null || stat -f "%Sm" "dist/simplifica" 2>/dev/null)
      echo -e "${COLOR_BLUE}ℹ️  Última compilación: $last_build${COLOR_NC}"
    fi
  else
    echo -e "${COLOR_YELLOW}⚠️  No se encontró directorio dist/${COLOR_NC}"
    echo -e "${COLOR_BLUE}ℹ️  Ejecuta: npm run build${COLOR_NC}"
  fi
  
  echo ""
}

# =====================================================
# FUNCIÓN: Generar reporte completo
# =====================================================
function generate_report() {
  echo -e "${COLOR_BLUE}╔════════════════════════════════════════╗${COLOR_NC}"
  echo -e "${COLOR_BLUE}║  📋 REPORTE COMPLETO                   ║${COLOR_NC}"
  echo -e "${COLOR_BLUE}╚════════════════════════════════════════╝${COLOR_NC}"
  echo ""
  
  check_environment
  check_build
  check_anychat
  scan_known_issues
  show_stats
  check_build_logs
  test_database
  
  echo -e "${COLOR_GREEN}✅ Reporte completado${COLOR_NC}"
  echo ""
}

# =====================================================
# FUNCIÓN: Mostrar ayuda
# =====================================================
function show_help() {
  echo "Uso: ./debug-errors.sh [opcion]"
  echo ""
  echo "Opciones:"
  echo "  report      - Generar reporte completo"
  echo "  anychat     - Verificar AnyChat API"
  echo "  env         - Verificar configuración de entorno"
  echo "  build       - Verificar estado de compilación"
  echo "  scan        - Escanear problemas conocidos"
  echo "  stats       - Mostrar estadísticas del proyecto"
  echo "  db          - Información sobre tests de BD"
  echo "  logs        - Verificar logs de build"
  echo "  help        - Mostrar esta ayuda"
  echo ""
}

# =====================================================
# MAIN - Procesamiento de argumentos
# =====================================================

case "${1:-report}" in
  report)
    generate_report
    ;;
  anychat)
    check_anychat
    ;;
  env)
    check_environment
    ;;
  build)
    check_build
    ;;
  scan)
    scan_known_issues
    ;;
  stats)
    show_stats
    ;;
  db)
    test_database
    ;;
  logs)
    check_build_logs
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    echo -e "${COLOR_RED}❌ Opción desconocida: $1${COLOR_NC}"
    echo ""
    show_help
    exit 1
    ;;
esac

exit 0
