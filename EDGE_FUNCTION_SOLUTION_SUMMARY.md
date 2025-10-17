# 🎯 SOLUCIÓN FINAL: Edge Function para Hide/Unhide Stages

## 📊 Resumen Ejecutivo

**Problema**: Error 403 al intentar ocultar estados genéricos debido a políticas RLS con subconsultas complejas en `WITH CHECK`.

**Solución implementada**: Edge Function `hide-stage` que:
- ✅ Valida JWT y obtiene company_id del usuario
- ✅ Verifica que el stage sea genérico (`company_id IS NULL`)
- ✅ Escribe en `hidden_stages` con `service_role` (bypass RLS seguro)
- ✅ Maneja ambas operaciones: `hide` y `unhide`
- ✅ CORS completo y configurable
- ✅ Mensajes de error descriptivos
- ✅ Idempotente (duplicados no causan error)

---

## 📁 Archivos creados/modificados

### ✨ Nuevos archivos

1. **`supabase/functions/hide-stage/index.ts`**
   - Edge Function completa siguiendo patrón maestro
   - 380+ líneas con validación exhaustiva
   - Maneja CORS, auth, validación, operaciones hide/unhide

2. **`supabase/functions/hide-stage/README.md`**
   - Documentación técnica completa
   - Contrato de API con ejemplos
   - Pruebas con curl
   - Guía de troubleshooting

3. **`deploy-hide-stage.sh`**
   - Script automatizado para deployment
   - Validaciones y mensajes de ayuda

4. **`EDGE_FUNCTION_DEPLOYMENT_GUIDE.md`**
   - Guía paso a paso para deployment
   - Checklist de verificación
   - Troubleshooting común
   - Tests de validación

5. **`supabase/migrations/update_rls_for_edge_function.sql`**
   - Elimina funciones RPC antiguas (si existieran)
   - Verifica y documenta políticas RLS simplificadas
   - Mensajes informativos de ejecución

### 🔄 Archivos modificados

1. **`src/app/services/supabase-ticket-stages.service.ts`**
   - `hideGenericStage()`: Ahora llama a Edge Function
   - `unhideGenericStage()`: Ahora llama a Edge Function
   - Ambos métodos usan fetch() con JWT del usuario
   - Manejo de errores con respuestas descriptivas

---

## 🏗️ Arquitectura de la solución

### Antes (❌ causaba 403)
```
Angular Service
    ↓
Supabase REST API (anon key)
    ↓
INSERT en hidden_stages
    ↓ (falla aquí)
RLS Policy con WITH CHECK complejo
```

### Después (✅ funciona)
```
Angular Service
    ↓
Edge Function hide-stage (JWT del usuario)
    ↓
Validación: user → company_id
    ↓
Validación: stage.company_id IS NULL
    ↓
INSERT/DELETE con service_role (bypass RLS seguro)
    ↓
✅ Success
```

---

## 🔐 Seguridad mejorada

1. **Service Role protegido**: Solo accesible dentro de Edge Function (servidor Supabase)
2. **JWT validado**: Cada request verifica usuario autenticado
3. **Company_id verificado**: Se obtiene del usuario autenticado (no del body)
4. **Validación de negocio**: Stage debe ser genérico antes de permitir hide
5. **RLS simplificado**: Solo verifica ownership, no lógica compleja

---

## 📋 Pasos de deployment

### Paso 1: Actualizar base de datos (opcional pero recomendado)

```bash
# En Supabase Dashboard > SQL Editor
# Pegar contenido de: supabase/migrations/update_rls_for_edge_function.sql
# Ejecutar
```

Esto:
- Elimina funciones RPC antiguas
- Verifica políticas RLS están correctas
- Actualiza comentarios para documentar uso de Edge Function

### Paso 2: Desplegar Edge Function

**Opción A - Script automatizado**:
```bash
cd f:/simplifica
bash deploy-hide-stage.sh
```

**Opción B - Manual**:
```bash
supabase functions deploy hide-stage --project-ref ufutyjbqfjrlzkprvyvs
```

### Paso 3: Configurar variables de entorno

En Supabase Dashboard:
1. Ve a: https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/settings/functions
2. Click "Add secret" para cada variable:

```
SUPABASE_URL = https://ufutyjbqfjrlzkprvyvs.supabase.co
SUPABASE_SERVICE_ROLE_KEY = <obtener de Project Settings > API>
ALLOW_ALL_ORIGINS = true
```

### Paso 4: Verificar deployment

```bash
# Ver logs en tiempo real
supabase functions logs hide-stage --project-ref ufutyjbqfjrlzkprvyvs --follow
```

### Paso 5: Probar con curl

```bash
# Test OPTIONS (CORS)
curl -X OPTIONS \
  https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage \
  -H "Origin: http://localhost:4200" \
  -v

# Debe devolver 200 OK

# Test POST sin auth (debe fallar con 401)
curl -X POST \
  https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage \
  -H "Content-Type: application/json" \
  -d '{"p_stage_id": "test", "p_operation": "hide"}'

# Debe devolver: {"error":"Missing or invalid authorization"}
```

### Paso 6: Probar end-to-end desde Angular

1. **NO es necesario** ejecutar `fix_hidden_stages_rls.sql` (ya no usamos RLS directo)
2. Refrescar Angular app: `http://localhost:4200`
3. Ir a: Configuración > Gestionar Estados
4. Click "Ocultar" en un estado genérico
5. ✅ **Debe funcionar sin error 403**
6. El estado debe mostrarse con badge "Oculto" y opacidad reducida
7. Click "Mostrar" debe revertir la operación

---

## 🧪 Tests de validación

### Test 1: Ocultar estado genérico
```typescript
// Debe funcionar ✅
await stagesService.hideGenericStage('uuid-estado-generico');
// Resultado: { error: null, data: { operation: 'hide', ... } }
```

### Test 2: Ocultar estado de empresa (debe fallar)
```typescript
// Debe devolver error ❌
await stagesService.hideGenericStage('uuid-estado-empresa');
// Resultado: { error: { message: 'Only generic stages can be hidden' } }
```

### Test 3: Ocultar estado ya oculto (idempotente)
```typescript
// No causa error, devuelve mensaje informativo ✅
await stagesService.hideGenericStage('uuid-ya-oculto');
// Resultado: { error: null, data: { message: 'Stage already hidden' } }
```

### Test 4: Mostrar estado oculto
```typescript
// Debe funcionar ✅
await stagesService.unhideGenericStage('uuid-estado-oculto');
// Resultado: { error: null, data: { operation: 'unhide', ... } }
```

---

## 📊 Comparación: Antes vs Después

| Aspecto | Antes (RLS directo) | Después (Edge Function) |
|---------|---------------------|-------------------------|
| **Error 403** | ❌ Sí | ✅ No |
| **Validación stage genérico** | En RLS (complejo) | En Edge Function (claro) |
| **Mensajes de error** | Crípticos | Descriptivos con detalles |
| **Debugging** | Difícil | Logs claros en tiempo real |
| **Seguridad** | RLS policy compleja | Service role + validación |
| **Mantenibilidad** | Baja | Alta |
| **Performance** | Subconsultas en cada insert | Validación directa |
| **Idempotencia** | No | Sí |

---

## 🎓 Ventajas de esta arquitectura

### 1. **Separación de responsabilidades**
- RLS: Seguridad multi-tenant (aislar datos por company_id)
- Edge Function: Lógica de negocio (validar stage genérico)

### 2. **Debugging mejorado**
```bash
# Logs en tiempo real con contexto
supabase functions logs hide-stage --follow

# Output ejemplo:
# ✅ Authenticated user: uuid-123
# ✅ User company_id: uuid-456
# 🔄 Processing hide for stage uuid-789
# ✅ Stage "Pendiente" is generic
# ✅ Stage hidden successfully
```

### 3. **Mensajes de error útiles**
Antes:
```json
{
  "code": "42501",
  "message": "new row violates row-level security policy"
}
```

Después:
```json
{
  "error": "Only generic stages (system-wide) can be hidden",
  "stage_id": "uuid",
  "stage_name": "Mi Estado Custom",
  "is_generic": false
}
```

### 4. **Escalabilidad**
- Fácil añadir más validaciones
- Fácil añadir webhooks o notificaciones
- Fácil integrar con otros servicios

### 5. **Testing**
- Pruebas independientes con curl
- No depende del estado de UI
- Fácil automatizar en CI/CD

---

## 📈 Métricas de éxito

### Antes del deployment
- ❌ Error 403 al ocultar estado
- ❌ Mensaje de error no útil
- ❌ Imposible debugging
- ❌ Lógica mezclada en RLS

### Después del deployment
- ✅ Ocultar estado funciona
- ✅ Mostrar estado funciona
- ✅ Mensajes descriptivos
- ✅ Logs claros en tiempo real
- ✅ Validación robusta
- ✅ Código mantenible

---

## 🚨 Notas importantes

### ⚠️ Ya NO es necesario ejecutar `fix_hidden_stages_rls.sql`

Ese script era para simplificar RLS cuando insertábamos directamente. Ahora que usamos Edge Function con `service_role`, las inserciones bypasean RLS de forma segura.

### ✅ Las políticas RLS actuales son suficientes

```sql
-- SELECT: Ver estados ocultos de tu empresa ✅
-- INSERT: Verificar company_id (usado por Edge Function) ✅
-- DELETE: Verificar company_id (usado por Edge Function) ✅
```

### 🔐 Service Role Key

**CRÍTICO**: El `SUPABASE_SERVICE_ROLE_KEY` solo debe estar en:
- ✅ Variables de entorno de Edge Function (servidor Supabase)
- ❌ NUNCA en código frontend
- ❌ NUNCA en repositorio git
- ❌ NUNCA expuesto al cliente

La Edge Function es segura porque ejecuta en el servidor de Supabase.

---

## 📚 Documentación de referencia

1. **Guía de deployment**: `EDGE_FUNCTION_DEPLOYMENT_GUIDE.md`
2. **Documentación técnica**: `supabase/functions/hide-stage/README.md`
3. **Patrón maestro**: `crear-Edge-Function-correctamente.txt`
4. **Migración SQL**: `supabase/migrations/update_rls_for_edge_function.sql`

---

## 🎯 Siguiente acción inmediata

```bash
# 1. Desplegar función
cd f:/simplifica
bash deploy-hide-stage.sh

# 2. Configurar env vars en Dashboard
# Ver: https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/settings/functions

# 3. Probar
supabase functions logs hide-stage --project-ref ufutyjbqfjrlzkprvyvs --follow

# 4. Desde otro terminal, probar OPTIONS
curl -X OPTIONS https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage -H "Origin: http://localhost:4200" -v

# 5. Abrir Angular y probar UI
# http://localhost:4200/configuracion/estados
```

---

## ✅ Checklist final

- [x] Edge Function creada (`hide-stage/index.ts`)
- [x] Servicio Angular actualizado (usa fetch a Edge Function)
- [x] Documentación completa (README + GUIDE)
- [x] Script de deployment (`deploy-hide-stage.sh`)
- [x] Migración SQL para limpiar RPCs (`update_rls_for_edge_function.sql`)
- [ ] **Desplegar Edge Function** ← SIGUIENTE PASO
- [ ] Configurar variables de entorno
- [ ] Probar con curl
- [ ] Probar end-to-end desde UI
- [ ] Verificar logs

---

## 🎉 Resultado final esperado

**Usuario puede**:
- ✅ Ocultar estados genéricos que no usa
- ✅ Ver estados ocultos con badge y estilo visual
- ✅ Mostrar estados previamente ocultos
- ✅ Ver mensajes claros si algo falla

**Desarrollador puede**:
- ✅ Ver logs en tiempo real
- ✅ Debuggear fácilmente
- ✅ Mantener código limpio
- ✅ Añadir features fácilmente

**Sistema tiene**:
- ✅ Seguridad robusta multi-tenant
- ✅ Validación de negocio clara
- ✅ Error handling completo
- ✅ Performance óptimo

---

**Creado**: 2025-10-17  
**Versión**: 1.0.0  
**Estado**: ✅ Lista para deployment  
**Patrón**: Edge Function + Service Role + Validación en servidor
