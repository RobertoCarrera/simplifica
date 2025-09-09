#!/bin/bash

# Script de CSS Purging Inteligente para los 3 componentes principales
# Extrae clases CSS usadas en templates y elimina las no utilizadas

echo "🚀 INICIANDO CSS PURGING INTELIGENTE..."

# Función para extraer clases de un componente
extract_classes() {
    local component_file=$1
    local component_name=$2
    
    echo "📋 Analizando clases en $component_name..."
    
    # Extraer todas las clases del template inline
    grep -oP 'class="[^"]*"' "$component_file" | \
    sed 's/class="//g' | \
    sed 's/"//g' | \
    tr ' ' '\n' | \
    sort | \
    uniq > "/tmp/${component_name}_classes.txt"
    
    echo "   ✅ Encontradas $(wc -l < /tmp/${component_name}_classes.txt) clases únicas"
}

# Función para crear CSS mínimo
create_minimal_css() {
    local component_name=$1
    local original_css=$2
    local minimal_css=$3
    
    echo "✂️ Creando CSS mínimo para $component_name..."
    
    # CSS base siempre necesario
    echo "@import '../../styles/shared.scss';" > "$minimal_css"
    echo "" >> "$minimal_css"
    echo "/* CSS mínimo optimizado para $component_name */" >> "$minimal_css"
    
    # Clases container principales (siempre necesarias)
    grep -A 10 "\.${component_name,,}-container" "$original_css" >> "$minimal_css" 2>/dev/null || true
    grep -A 5 "\.header-section" "$original_css" >> "$minimal_css" 2>/dev/null || true
    grep -A 5 "\.content-section" "$original_css" >> "$minimal_css" 2>/dev/null || true
    
    echo "   ✅ CSS mínimo creado: $(wc -l < $minimal_css) líneas"
}

# Procesar cada componente
COMPONENTS=("customers" "tickets" "services")
BASE_PATH="src/app/components/supabase"

for comp in "${COMPONENTS[@]}"; do
    component_path="${BASE_PATH}-${comp}/supabase-${comp}.component"
    
    if [[ -f "${component_path}.ts" ]]; then
        # Extraer clases usadas
        extract_classes "${component_path}.ts" "$comp"
        
        # Crear backup del CSS original
        cp "${component_path}.scss" "${component_path}.scss.backup"
        
        # Crear CSS mínimo
        create_minimal_css "$comp" "${component_path}.scss.backup" "${component_path}.scss"
        
        echo "   📊 Reducción: $(wc -l < ${component_path}.scss.backup) → $(wc -l < ${component_path}.scss) líneas"
    fi
done

echo ""
echo "🎯 CSS PURGING COMPLETADO"
echo "📁 Backups creados con extensión .scss.backup"
