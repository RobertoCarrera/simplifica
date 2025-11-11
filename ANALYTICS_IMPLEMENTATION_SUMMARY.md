# 📊 Implementación Completa del Sistema de Analíticas

## Resumen Ejecutivo

Sistema de analíticas **100% server-side** para presupuestos, implementado con Supabase/Postgres utilizando Materialized Views, funciones RPC seguras, y frontend Angular con signals reactivos.

### ✅ Estado: Producción Ready

---

## 🏗️ Arquitectura

### Backend (Supabase/Postgres)

#### 1. Schema Analytics
```
analytics/
├── quote_base (VIEW)
├── quote_item_base (VIEW)
├── mv_quote_kpis_monthly (MATERIALIZED VIEW)
├── mv_quote_top_items_monthly (MATERIALIZED VIEW)
└── mv_quote_cube (MATERIALIZED VIEW con CUBE)
```

#### 2. Funciones RPC SECURITY DEFINER
- `get_user_company_id()` - Extrae company_id del JWT
- `f_quote_kpis_monthly(p_start, p_end)` - KPIs mensuales
- `f_quote_top_items_monthly(p_start, p_end, p_limit)` - Top items
- `f_quote_cube(p_start, p_end)` - Agregación multidimensional
- `f_quote_projected_revenue(p_start, p_end)` - Ingresos previstos (borradores)

#### 3. Seguridad
- ✅ Acceso solo vía RPC (SELECT directo revocado)
- ✅ Filtrado por `company_id` + `auth.uid()` en todas las funciones
- ✅ Sin PII en vistas (solo IDs y métricas)
- ✅ Compatible con RLS/GDPR

#### 4. Índices Optimizados
```sql
-- Base tables
ix_quotes_company_created_month ON quotes (company_id, created_by, quote_month)
ix_quote_items_quote_id ON quote_items (quote_id)

-- MVs (unique para REFRESH CONCURRENTLY)
ux_mv_quote_kpis_monthly ON (company_id, created_by, period_month)
ux_mv_quote_top_items_monthly ON (company_id, created_by, period_month, item_id)
ux_mv_quote_cube ON (company_id, created_by, period_month, status, conversion_status, group_id)
```

#### 5. Refresco Automático (pg_cron)
- Job: `refresh_quotes_mvs`
- Schedule: `*/10 * * * *` (cada 10 minutos)
- Ejecuta: `REFRESH MATERIALIZED VIEW CONCURRENTLY` de las 3 MVs

---

## 🎨 Frontend (Angular)

### AnalyticsService
**Archivo**: `src/app/services/analytics.service.ts`

#### Signals Reactivos
```typescript
- kpisMonthly: Signal<KPIs | null>
- projectedDraftMonthly: Signal<{total, draftCount} | null>
- historicalTrend: Signal<Array<{month, total, count}>>
- loading: Signal<boolean>
- error: Signal<string | null>
```

#### Métricas Expuestas
1. **Presupuestos Mes** - Conteo del mes actual
2. **Total Presupuestado** - Suma total_amount (EUR)
3. **Tasa de Conversión** - % accepted/total
4. **Previsto (borradores)** - Suma drafts con contador

#### Métodos Públicos
- `getMetrics()` - Computed con 4 tarjetas
- `getHistoricalTrend()` - Últimos 6 meses
- `isLoading()` - Estado de carga
- `getError()` - Mensaje de error
- `refreshAnalytics()` - Recarga manual

### DashboardAnalyticsComponent
**Archivo**: `src/app/components/dashboard-analytics/dashboard-analytics.component.ts`

#### Features UI
- ✅ Skeleton loader mientras carga
- ✅ Manejo de errores visible
- ✅ 4 tarjetas métricas responsive (grid 1/2/4 cols)
- ✅ Gráfico histórico de barras (6 meses)
- ✅ Tooltips interactivos con hover
- ✅ Dark mode compatible
- ✅ Layout coherente con resto de app

---

## 🔐 Seguridad Implementada

### 1. Autenticación
- JWT requerido para todas las RPC
- `auth.uid()` extrae usuario autenticado

### 2. Autorización
- `get_user_company_id()` valida claim `company_id` en JWT
- Excepción si falta claim: `Missing company_id in JWT claims`

### 3. Aislamiento de Datos
- Cada función filtra por:
  - `company_id = get_user_company_id()`
  - `created_by = auth.uid()`
- Usuarios solo ven sus propios presupuestos

### 4. Sin Acceso Directo
```sql
REVOKE ALL ON TABLE analytics.mv_* FROM PUBLIC;
REVOKE ALL ON TABLE analytics.mv_* FROM authenticated;
```

---

## 📈 Métricas Disponibles

### KPIs Mensuales (mes actual)
- Nº presupuestos
- Subtotal sum
- Tax sum
- Total sum
- Avg días hasta aceptación
- Tasa de conversión (accepted/total)

### Previsto (Borradores)
- Total EUR de quotes en estado `draft`
- Contador de borradores

### Histórico (6 meses)
- Total EUR por mes
- Nº presupuestos por mes
- Visualización en gráfico de barras

---

## 🚀 Despliegue y Mantenimiento

### Primera Ejecución (Ya Realizada)
```sql
-- 1. Poblar MVs inicial (sin CONCURRENTLY primera vez)
REFRESH MATERIALIZED VIEW analytics.mv_quote_kpis_monthly;
REFRESH MATERIALIZED VIEW analytics.mv_quote_top_items_monthly;
REFRESH MATERIALIZED VIEW analytics.mv_quote_cube;

-- 2. Verificar datos
SELECT 'kpis' AS mv, COUNT(*) FROM analytics.mv_quote_kpis_monthly
UNION ALL
SELECT 'top_items', COUNT(*) FROM analytics.mv_quote_top_items_monthly
UNION ALL
SELECT 'cube', COUNT(*) FROM analytics.mv_quote_cube;
```

### Refrescos Subsiguientes (Automático cada 10min)
```sql
-- Manual si necesario
REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_kpis_monthly;
REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_top_items_monthly;
REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_cube;
```

### Verificar Cron Job
```sql
SELECT jobname, schedule, active, command
FROM cron.job
WHERE jobname = 'refresh_quotes_mvs';
```

### Monitoreo Básico
```sql
-- Ver última ejecución del cron
SELECT jobid, runid, job_pid, database, username, 
       command, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh_quotes_mvs')
ORDER BY start_time DESC
LIMIT 10;
```

---

## 🔄 Flujo de Datos

```
1. Usuario autenticado carga dashboard
   ↓
2. Angular llama AnalyticsService.refreshAnalytics()
   ↓
3. Servicio ejecuta RPC paralelas:
   - f_quote_kpis_monthly(mes_actual)
   - f_quote_projected_revenue(mes_actual)
   - f_quote_kpis_monthly(ultimos_6_meses)
   ↓
4. Supabase ejecuta funciones SECURITY DEFINER:
   - Valida JWT (auth.uid())
   - Extrae company_id del JWT
   - Filtra MVs por company_id + created_by
   - Retorna solo datos del usuario/empresa
   ↓
5. Frontend recibe JSON y actualiza signals
   ↓
6. Componente renderiza:
   - 4 tarjetas con KPIs
   - Gráfico histórico de 6 meses
   - Loading/error states
```

---

## 📊 Rendimiento

### Complejidad Query
- **O(1)** - Lectura de MVs pre-agregadas
- **O(log n)** - Índices B-tree en company_id/created_by
- Sin joins pesados en runtime (pre-calculados en MVs)

### Latencia Esperada
- Primera carga (paralela): **< 500ms** típico
- Refresh manual: **< 300ms**
- Refresco CONCURRENTLY de MVs: **< 2s** (no bloquea lecturas)

### Escalabilidad
- MVs escalan linealmente con registros/mes
- Índices mantienen búsqueda logarítmica
- Cron job independiente (sin impacto en frontend)

---

## 🧪 Testing Realizado

### ✅ Funcional
- [x] Primer REFRESH de MVs sin datos
- [x] REFRESH CONCURRENTLY poblado
- [x] Funciones RPC con usuario válido
- [x] Filtrado por company_id correcto
- [x] Error si falta claim company_id
- [x] SELECT directo a MVs bloqueado

### ✅ Frontend
- [x] Loader mientras carga datos
- [x] Manejo de error visible
- [x] Tarjetas métricas reactivas
- [x] Gráfico histórico interactivo
- [x] Responsive layout (mobile/tablet/desktop)
- [x] Dark mode compatible

---

## 🔮 Próximas Mejoras Opcionales

### Corto Plazo
1. **Cache Layer** (Redis/in-memory)
   - TTL: 5 min
   - Invalidación en create/update quote
   
2. **Alertas de Refresco**
   - Log duración en tabla `analytics.refresh_log`
   - Alerta si > 2s

3. **Más KPIs**
   - Tiempo medio hasta aceptación
   - Valor medio por presupuesto
   - Top 5 servicios/productos

### Medio Plazo
4. **Drill-Down**
   - Click en tarjeta → detalle mensual
   - Filtros por rango de fechas

5. **Exports**
   - CSV/Excel de KPIs
   - PDF con gráficos

6. **Comparativas**
   - Mes actual vs mes anterior (% change)
   - YoY comparisons

---

## 📝 Checklist Despliegue Producción

- [x] Esquema `analytics` creado
- [x] Vistas base sin PII
- [x] Materialized Views con índices únicos
- [x] Funciones RPC SECURITY DEFINER
- [x] Permisos revocados (solo RPC)
- [x] pg_cron job programado
- [x] Primer REFRESH ejecutado
- [x] Frontend integrado con signals
- [x] UI responsive y dark mode
- [x] Loading y error states
- [ ] Variables Vercel configuradas (si aplica)
- [ ] Monitoreo básico activo
- [ ] Documentación entregada

---

## 🆘 Troubleshooting

### Error: "Missing company_id in JWT claims"
**Causa**: JWT no incluye claim `company_id`  
**Solución**: Agregar claim en Supabase Auth hook o modificar `get_user_company_id()` para leer de tabla `users`/`profiles`

### Error: "CONCURRENTLY cannot be used when MV is not populated"
**Causa**: Primera ejecución debe ser sin CONCURRENTLY  
**Solución**: Ejecutar `REFRESH MATERIALIZED VIEW` (sin CONCURRENTLY) una vez

### Dashboard muestra "—" en todas las tarjetas
**Causas posibles**:
1. Sin sesión activa (JWT inválido)
2. Sin presupuestos en mes actual
3. MVs vacías (ejecutar REFRESH)

**Debug**:
```sql
-- Ver si hay datos en MVs
SELECT * FROM analytics.mv_quote_kpis_monthly LIMIT 10;

-- Probar función manualmente (en SQL Editor autenticado)
SELECT * FROM f_quote_kpis_monthly(NULL, NULL);
```

### Cron job no refresca
**Verificar**:
```sql
-- Ver ejecuciones recientes
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh_quotes_mvs')
ORDER BY start_time DESC LIMIT 5;

-- Si no hay ejecuciones, recrear job
SELECT cron.unschedule('refresh_quotes_mvs');
SELECT cron.schedule('refresh_quotes_mvs', '*/10 * * * *', 
  $$CALL public.refresh_quotes_materialized_views()$$);
```

---

## 📞 Contacto y Soporte

Para issues, mejoras o consultas:
- Repo: RobertoCarrera/simplifica
- Branch: `analytics`

---

**Última actualización**: 2025-11-11  
**Versión**: 1.0.0  
**Estado**: ✅ Producción Ready
