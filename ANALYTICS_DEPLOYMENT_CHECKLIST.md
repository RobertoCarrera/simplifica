# ✅ Checklist Final - Analytics Data Mart

## 📋 Estado Actual

Tu SQL ha sido optimizado con:
- ✅ Columna física `quote_month` en `quotes` (con trigger automático)
- ✅ Índices solo en columnas físicas (sin expresiones)
- ✅ Vistas base usan `quote_month` directamente
- ✅ Todas las funciones RPC completas y correctas

---

## 🔧 Pasos para Aplicar

### 1️⃣ **Ejecutar SQL en Supabase** (OBLIGATORIO)

```bash
# Opción A: Desde Supabase Dashboard
1. Ve a SQL Editor en tu proyecto Supabase
2. Copia todo el contenido de analytics-quotes-datamart-FINAL.sql
3. Ejecuta (Run)
4. Verifica que no hay errores
```

```bash
# Opción B: Desde terminal (si tienes Supabase CLI)
supabase db reset --db-url "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
# O si prefieres solo ejecutar el script:
psql -h db.[PROJECT].supabase.co -U postgres -d postgres -f analytics-quotes-datamart-FINAL.sql
```

### 2️⃣ **Poblar las Vistas Materializadas** (OBLIGATORIO)

Después de ejecutar el SQL, las MVs están vacías (`WITH NO DATA`). Debes poblarlas:

```sql
-- Ejecutar estos 3 comandos en SQL Editor:
REFRESH MATERIALIZED VIEW analytics.mv_quote_kpis_monthly;
REFRESH MATERIALIZED VIEW analytics.mv_quote_top_items_monthly;
REFRESH MATERIALIZED VIEW analytics.mv_quote_cube;
```

O llamar al procedimiento directamente:
```sql
CALL public.refresh_quotes_materialized_views();
```

### 3️⃣ **Verificar en Frontend** (OPCIONAL - Ya está listo)

El frontend **NO requiere cambios**. Ya está preparado para:
- ✅ Leer `period_month` directamente (es un `date`, no timestamp)
- ✅ Usar `subtotal`, `tax_amount`, `grand_total` desde `f_quote_projected_revenue`
- ✅ Aplicar lógica de "IVA incluido" correctamente

---

## 🔍 Verificaciones Post-Despliegue

### Test 1: Verificar que las MVs tienen datos
```sql
SELECT company_id, created_by, period_month, quotes_count, subtotal_sum, tax_sum, total_sum
FROM analytics.mv_quote_kpis_monthly
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
ORDER BY period_month DESC
LIMIT 5;
```

**Resultado esperado**: Debería ver filas con tus presupuestos del mes actual (2025-11-01).

### Test 2: Verificar función RPC de KPIs
```sql
SELECT * FROM public.f_quote_kpis_monthly('2025-11-01', '2025-11-30');
```

**Resultado esperado** (aproximado):
```
period_month | quotes_count | subtotal_sum | tax_sum | total_sum
2025-11-01   | 4            | 208.00       | 43.68   | 251.68
```

### Test 3: Verificar función RPC de borradores
```sql
SELECT * FROM public.f_quote_projected_revenue('2025-11-01', '2025-11-30');
```

**Resultado esperado**:
```
period_month | draft_count | subtotal | tax_amount | grand_total
2025-11-01   | 4           | 208.00   | 43.68      | 251.68
```

### Test 4: Verificar en la app
1. Abre http://localhost:4200/analytics
2. Deberías ver:
   - **Presupuestos Mes**: 4
   - **Total Presupuestado**: €208 (si tienes IVA incluido activado) o €252 (si no)
   - **IVA Presupuestado**: €44
   - **Previsto (borradores)**: €208 con 4 borradores

---

## ⚠️ Diferencias Clave en tu SQL Final vs Original

| Aspecto | Original | Tu Versión Final |
|---------|----------|------------------|
| **Mes calculado** | `DATE_TRUNC()` en vistas | Columna física `quote_month` con trigger |
| **Índice** | En expresión `DATE_TRUNC()` | En columna física `quote_month` |
| **Performance** | Más lento (recalcula en cada query) | Más rápido (índice directo) |
| **quote_items.item_id** | Asume `item_id` existe | Usa `COALESCE(service_id, product_id, variant_id)` |
| **quote_items total** | `total_amount` | `total` (sin `_amount`) |

---

## 🚀 Beneficios de tu Versión

1. **Performance mejorado**: Índice directo en `quote_month` (en lugar de expresión funcional)
2. **Trigger automático**: `quote_month` se actualiza automáticamente en INSERT/UPDATE
3. **Compatibilidad**: Usa las columnas reales de tu schema (`service_id`, `product_id`, `variant_id`, `qi.total`)
4. **Mantenimiento**: Si cambia `quote_date`, el trigger recalcula `quote_month` automáticamente

---

## 📝 Frontend - Confirmación de Compatibilidad

### ✅ Sin cambios necesarios

El `analytics.service.ts` ya está preparado porque:

1. **Lee `period_month` como string**:
   ```typescript
   const row = (kpisRes.data as any[] | null)?.find(r => 
     String(r.period_month || '').startsWith(monthStr)
   ) || null;
   ```
   - Tu SQL devuelve `period_month` como `date` (2025-11-01)
   - TypeScript lo convierte a string automáticamente: "2025-11-01"
   - `.startsWith('2025-11')` funciona correctamente ✅

2. **Usa campos correctos de RPC**:
   ```typescript
   // Para f_quote_kpis_monthly (desde MV):
   subtotal_sum, tax_sum, total_sum ✅
   
   // Para f_quote_projected_revenue (desde quote_base directo):
   subtotal, tax_amount, grand_total ✅
   ```

3. **Lógica IVA incluido**:
   ```typescript
   value: kpis ? this.formatCurrency(
     includeTax ? kpis.subtotal_sum : kpis.total_sum
   ) : '—'
   ```
   - Si `prices_include_tax = true`: muestra `subtotal_sum` (€208)
   - Si `prices_include_tax = false`: muestra `total_sum` (€252)

---

## 🐛 Posibles Problemas y Soluciones

### ❌ Problema: "Missing company_id in JWT claims"
**Causa**: Auth Hook no configurado o usuario no hizo logout/login después de configurarlo.

**Solución**:
```bash
1. Verifica que el Auth Hook "custom-access-token" esté desplegado y habilitado
2. Cierra sesión en la app
3. Vuelve a iniciar sesión
4. El nuevo JWT incluirá company_id
```

### ❌ Problema: MVs vacías / sin datos
**Causa**: No ejecutaste el REFRESH después de crear las MVs.

**Solución**:
```sql
CALL public.refresh_quotes_materialized_views();
```

### ❌ Problema: Contador de borradores incorrecto
**Causa**: La columna `quote_month` no se actualizó en registros antiguos.

**Solución**:
```sql
-- Forzar recálculo de quote_month en todos los registros:
UPDATE public.quotes
SET quote_month = DATE_TRUNC('month', COALESCE(quote_date, created_at))::date
WHERE quote_month IS NULL OR quote_month != DATE_TRUNC('month', COALESCE(quote_date, created_at))::date;

-- Luego refrescar MVs:
CALL public.refresh_quotes_materialized_views();
```

### ❌ Problema: Error "column quote_month does not exist"
**Causa**: El `ALTER TABLE` no se ejecutó correctamente.

**Solución**:
```sql
-- Verificar si existe la columna:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'quotes' AND column_name = 'quote_month';

-- Si no existe, ejecutar manualmente:
ALTER TABLE public.quotes ADD COLUMN quote_month date;
UPDATE public.quotes SET quote_month = DATE_TRUNC('month', COALESCE(quote_date, created_at))::date;
```

---

## ✅ Resumen Final

| Item | Estado | Acción Requerida |
|------|--------|------------------|
| SQL optimizado | ✅ Listo | Ejecutar `analytics-quotes-datamart-FINAL.sql` |
| Funciones RPC | ✅ Completas | Incluidas en el SQL |
| Frontend | ✅ Compatible | Ninguna |
| Trigger `quote_month` | ✅ Incluido | Se crea automáticamente con el SQL |
| Índices | ✅ Optimizados | Se crean automáticamente con el SQL |
| Refresh automático | ✅ Configurado | pg_cron cada 10 minutos |

---

## 🎯 Próximos Pasos Inmediatos

1. **Ejecutar** `analytics-quotes-datamart-FINAL.sql` en Supabase SQL Editor
2. **Verificar** que no hay errores en la ejecución
3. **Poblar MVs**: `CALL public.refresh_quotes_materialized_views();`
4. **Probar** en la app: Ir a `/analytics` y verificar métricas
5. **Opcional**: Ejecutar los Test 1-4 de arriba para confirmar datos

**¿Todo listo?** El frontend no necesita cambios. Solo ejecuta el SQL y refresca las MVs. 🚀
