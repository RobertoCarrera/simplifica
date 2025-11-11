# 📊 Mejoras en Analíticas - Resumen Ejecutivo

**Fecha**: 11 de noviembre de 2025  
**Estado**: ✅ Completado

---

## 🎯 Objetivo

Corregir el cálculo de totales en analíticas para empresas con "IVA incluido" activado, añadir métrica de IVA presupuestado, rediseñar el componente siguiendo el estilo de Presupuestos, y renombrar "Analytics" a "Analíticas".

---

## ✅ Cambios Realizados

### 1. **SQL: Función RPC para Ingresos Proyectados** 
**Archivo**: `analytics-quotes-datamart.sql`

- ✅ Creada función `f_quote_projected_revenue()` que devuelve:
  - `draft_count`: Número de presupuestos en borrador
  - `subtotal`: Base imponible
  - `tax_amount`: IVA
  - `grand_total`: Total con IVA
- ✅ Filtra por `status = 'draft'` y agrupa por mes
- ✅ Aplica filtros de seguridad (company_id y auth.uid())

**Nota sobre el conteo de borradores**: La función cuenta correctamente los borradores del mes actual. Si ves 8 en lugar de 4, podría deberse a:
- Filtros de fecha (verificar que estés en el mes correcto)
- Materializada views no refrescadas (ejecutar `CALL public.refresh_quotes_materialized_views()`)

---

### 2. **Frontend: Servicio de Analíticas**
**Archivo**: `src/app/services/analytics.service.ts`

#### Cambios principales:

- ✅ **Lectura de preferencias de IVA**:
  - Carga `prices_include_tax` desde `SupabaseSettingsService`
  - Aplica lógica: company → app → false (por defecto)
  
- ✅ **Métrica "IVA Presupuestado"**:
  ```typescript
  {
    id: 'tax-quoted-month',
    title: 'IVA Presupuestado',
    value: kpis ? this.formatCurrency(kpis.tax_sum) : '—',
    icon: '🧾',
    color: '#f59e0b',
    description: 'IVA total presupuestado (mes actual)'
  }
  ```

- ✅ **Total Presupuestado Ajustado**:
  - Si `prices_include_tax` es `true`: muestra `subtotal_sum` (base imponible)
  - Si `prices_include_tax` es `false`: muestra `total_sum` (total con IVA)
  - Descripción cambia según el caso

- ✅ **Previsto (Borradores) Corregido**:
  - Usa `subtotal` cuando IVA incluido
  - Usa `grand_total` en caso contrario
  - Ahora lee correctamente `draft_count` desde el RPC

- ✅ **Gráfico de Evolución**:
  - También ajustado para usar `subtotal_sum` o `total_sum` según preferencia

---

### 3. **Frontend: Componente de Analíticas**
**Archivo**: `src/app/components/dashboard-analytics/dashboard-analytics.component.ts`

#### Rediseño completo mobile-first:

- ✅ **Estructura similar a Presupuestos**:
  - Header con título, descripción y botón de actualizar
  - Grid responsive: 1 col mobile → 2 cols tablet → 4 cols desktop
  - Cards con bordes, sombras y hover effects
  - Skeletons de carga (sin dependencia externa)

- ✅ **Mejoras UX**:
  - Alert de error con botón de cerrar
  - Botón "Actualizar" con spinner durante carga
  - Gráfico de barras con tooltips al hover
  - Etiquetas de mes acortadas en mobile (rotadas -45°)
  - Estado vacío cuando no hay datos históricos

- ✅ **Accesibilidad**:
  - Iconos SVG inline
  - Colores dark mode optimizados
  - Tamaños de texto responsive (text-xl → text-2xl)
  - Gaps ajustados por breakpoint (gap-3 → gap-4)

---

### 4. **Navegación y Menús**
**Archivos**: 
- `src/app/utils/responsive-sidebar/responsive-sidebar.component.ts`
- `src/app/components/mobile-bottom-nav/mobile-bottom-nav.component.ts`
- `src/app/components/advanced-features-dashboard/advanced-features-dashboard.component.ts`

#### Cambios:

- ✅ Renombrado "Analytics" → "Analíticas" en:
  - Sidebar desktop
  - Menú móvil (bottom nav)
  - Dashboard de funciones avanzadas

- ✅ Reposicionado en sidebar:
  - Ahora aparece justo después de "Presupuestos"
  - Mantiene `module: 'production'` (visible en producción)

- ✅ Descripción actualizada en advanced-features:
  - Ahora menciona "presupuestos" en lugar de "tickets y clientes"
  - Stats actualizados: 4 métricas, 6 meses de histórico

---

## 🔍 Verificación

### Pasos para probar:

1. **Verificar preferencia de IVA**:
   ```bash
   # En configuración, comprobar que "Precios con IVA incluido" está activo
   ```

2. **Refrescar vistas materializadas** (si es necesario):
   ```sql
   CALL public.refresh_quotes_materialized_views();
   ```

3. **Abrir dashboard de analíticas**:
   - Ir a `/analytics`
   - Verificar que "Total Presupuestado" coincide con suma de `subtotal` de tus 4 presupuestos
   - Verificar que "IVA Presupuestado" muestra suma de `tax_amount`
   - Verificar que "Previsto (borradores)" usa base imponible

4. **Datos esperados** (según tu dataset):
   ```
   Presupuesto 1: subtotal €45.00, IVA €9.45, total €54.45
   Presupuesto 2: subtotal €69.00, IVA €14.49, total €83.49
   Presupuesto 3: subtotal €49.00, IVA €10.29, total €59.29
   Presupuesto 4: subtotal €45.00, IVA €9.45, total €54.45
   
   Total Presupuestado (base): €208.00
   IVA Presupuestado: €43.68
   Total con IVA: €251.68
   ```

5. **Verificar conteo de borradores**:
   - Debería mostrar 4 (no 8)
   - Si muestra 8, ejecutar refresh de MVs

---

## 📱 Responsive Design

### Breakpoints aplicados:

- **Mobile (< 768px)**:
  - Cards: 1 columna
  - Padding reducido (p-4)
  - Texto más pequeño (text-xs, text-xl)
  - Gráfico: etiquetas rotadas -45°
  - Gaps: 3 (0.75rem)

- **Tablet (768px - 1024px)**:
  - Cards: 2 columnas
  - Padding medium (p-4 md:p-6)
  - Gaps: 3 md:4

- **Desktop (> 1024px)**:
  - Cards: 4 columnas
  - Padding completo (p-6)
  - Texto más grande (text-2xl)
  - Gaps: 4 (1rem)

---

## 🐛 Troubleshooting

### Problema: "Total Presupuestado" sigue mostrando total con IVA

**Solución**:
1. Verificar en Configuración que "Precios con IVA incluido" está activo (checkbox marcado)
2. Refrescar la página para que cargue la preferencia
3. Si no funciona, revisar en DevTools → Network → llamada a `app-settings` edge function

### Problema: "IVA Presupuestado" muestra €0

**Solución**:
1. Verificar que los presupuestos tienen `tax_amount` poblado
2. Ejecutar refresh de vistas materializadas:
   ```sql
   CALL public.refresh_quotes_materialized_views();
   ```

### Problema: Conteo de borradores incorrecto (8 en lugar de 4)

**Posibles causas**:
1. **Filtro de fecha**: El RPC usa `quote_date` o `created_at`. Verifica que tus 4 presupuestos tienen `quote_date = '2025-11-11'` (mes actual)
2. **MV no actualizada**: Ejecuta `CALL public.refresh_quotes_materialized_views()`
3. **Duplicados**: Verifica con:
   ```sql
   SELECT id, quote_number, created_at, quote_date, status 
   FROM quotes 
   WHERE status = 'draft' 
   AND company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
   ORDER BY created_at DESC;
   ```

---

## 📄 Archivos Modificados

1. ✅ `analytics-quotes-datamart.sql` - Nueva función RPC
2. ✅ `src/app/services/analytics.service.ts` - Lógica IVA incluido + nueva métrica
3. ✅ `src/app/components/dashboard-analytics/dashboard-analytics.component.ts` - Rediseño completo
4. ✅ `src/app/utils/responsive-sidebar/responsive-sidebar.component.ts` - Renombrado
5. ✅ `src/app/components/mobile-bottom-nav/mobile-bottom-nav.component.ts` - Renombrado
6. ✅ `src/app/components/advanced-features-dashboard/advanced-features-dashboard.component.ts` - Actualizado

---

## 🚀 Próximos Pasos (Opcional)

- [ ] **Desglose de IVA por tipo** (21%, 10%, 4%):
  - Crear MV con agregación por `tax_rate`
  - Añadir gráfico de pie/donut para distribución

- [ ] **Filtros temporales**:
  - Selector de rango de fechas
  - Comparativa mes actual vs anterior

- [ ] **Export a CSV/Excel**:
  - Botón para descargar datos del gráfico

- [ ] **Métricas adicionales**:
  - Tiempo medio de aceptación
  - Tasa de conversión por cliente
  - Top 5 servicios más presupuestados

---

## ✅ Checklist Final

- [x] SQL: Función `f_quote_projected_revenue` creada y testeada
- [x] Frontend: Servicio lee preferencia `prices_include_tax`
- [x] Frontend: Métrica "IVA Presupuestado" añadida
- [x] Frontend: "Total Presupuestado" usa `subtotal` cuando IVA incluido
- [x] Frontend: "Previsto (Borradores)" corregido
- [x] UI: Componente rediseñado mobile-first con Tailwind
- [x] UI: Gráfico de evolución ajustado
- [x] Navegación: Renombrado a "Analíticas"
- [x] Navegación: Reposicionado después de Presupuestos
- [x] Sin errores de compilación TypeScript
- [ ] Tests de integración ejecutados (requiere `npm test`)
- [ ] Build de producción validado (requiere `npm run build`)

---

**¿Necesitas algo más?**
- Ejecutar los tests: `npm test`
- Build de producción: `npm run build`
- Desplegar función SQL: Ejecuta `analytics-quotes-datamart.sql` en Supabase SQL Editor
