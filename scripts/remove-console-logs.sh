#!/bin/bash
# remove-console-logs.sh
# Script para eliminar console.logs de componentes de producción

echo "🧹 Eliminando console.logs de componentes de producción..."

# Definir archivos a limpiar
FILES=(
  "src/app/components/supabase-customers/supabase-customers.component.ts"
  "src/app/components/supabase-tickets/supabase-tickets.component.ts"
  "src/app/components/supabase-services/supabase-services.component.ts"
)

# Contador de líneas eliminadas
TOTAL_REMOVED=0

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "📄 Procesando: $file"
    
    # Contar console.logs antes
    BEFORE=$(grep -c "console\.log" "$file" 2>/dev/null || echo 0)
    
    # Eliminar líneas que contienen console.log
    sed -i '/console\.log/d' "$file"
    
    # Contar después  
    AFTER=$(grep -c "console\.log" "$file" 2>/dev/null || echo 0)
    
    REMOVED=$((BEFORE - AFTER))
    TOTAL_REMOVED=$((TOTAL_REMOVED + REMOVED))
    
    echo "  ✅ Eliminadas $REMOVED líneas"
  else
    echo "  ❌ Archivo no encontrado: $file"
  fi
done

echo "🎉 Total de console.logs eliminados: $TOTAL_REMOVED"
echo "✅ Limpieza de console.logs completada"
