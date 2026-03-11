#!/bin/bash

echo "🚀 Preparando build de producción..."

# 1. Limpiar build anterior
echo "🧹 Limpiando builds anteriores..."
rm -rf dist/

# 2. Build de producción
echo "🔨 Creando build optimizado..."
pnpm run build

# 3. Verificar que el build fue exitoso
if [ ! -d "dist/" ]; then
    echo "❌ Error: El build falló"
    exit 1
fi

echo "✅ Build completado exitosamente"

# 4. Mostrar tamaño del build
echo "📊 Tamaño del build:"
du -sh dist/

# 5. Verificar archivos principales
echo "📁 Archivos principales generados:"
ls -la dist/simplifica/browser/ | grep -E "\.(js|css|html)$" | head -10

echo ""
echo "🎉 Build listo para producción!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Configurar URLs en Supabase Dashboard (ver PRODUCTION_SETUP_COMPLETE.md)"
echo "2. Ejecutar scripts SQL en Supabase (database/setup-*.sql)"
echo "3. Deploy a Vercel: vercel --prod"
echo ""
