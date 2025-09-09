#!/bin/bash

# Script para optimización rápida de CSS - Eliminar duplicados más grandes

echo "Optimizando supabase-tickets..."
# Eliminar duplicados en tickets
sed -i '/\.form-group {/,/^}$/d' src/app/components/supabase-tickets/supabase-tickets.component.scss
sed -i '/\.modal-content {/,/^}$/d' src/app/components/supabase-tickets/supabase-tickets.component.scss
sed -i '/\.btn {/,/^}$/d' src/app/components/supabase-tickets/supabase-tickets.component.scss

echo "Optimizando supabase-customers..."
# Eliminar duplicados en customers
sed -i '/\.form-group {/,/^}$/d' src/app/components/supabase-customers/supabase-customers.component.scss
sed -i '/\.modal-content {/,/^}$/d' src/app/components/supabase-customers/supabase-customers.component.scss
sed -i '/\.btn {/,/^}$/d' src/app/components/supabase-customers/supabase-customers.component.scss

echo "Optimizando supabase-services..."
# Eliminar duplicados en services
sed -i '/\.form-group {/,/^}$/d' src/app/components/supabase-services/supabase-services.component.scss
sed -i '/\.modal-content {/,/^}$/d' src/app/components/supabase-services/supabase-services.component.scss
sed -i '/\.btn {/,/^}$/d' src/app/components/supabase-services/supabase-services.component.scss

echo "Optimización CSS completada"
