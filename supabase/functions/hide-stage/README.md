# Edge Function: hide-stage

## 🎯 Propósito

Edge Function robusta que gestiona ocultar/mostrar estados genéricos del sistema para cada empresa, con validación exhaustiva y bypass seguro de RLS.

## 🏗️ Arquitectura

### ¿Por qué Edge Function?

**Problema anterior**: La política RLS con subconsultas complejas en `WITH CHECK` causaba errores 403.

**Solución**: Edge Function con `service_role` que:
- ✅ Valida JWT del usuario
- ✅ Obtiene company_id del usuario autenticado
- ✅ Verifica que el stage sea genérico (`company_id IS NULL`)
- ✅ Escribe en `hidden_stages` con service_role (bypass RLS seguro)
- ✅ Maneja todos los casos de error con mensajes descriptivos

### Ventajas

1. **Seguridad**: Ejecuta con service_role DENTRO de Supabase (no expuesto al cliente)
2. **Validación robusta**: Verifica que el stage sea genérico antes de insertar
3. **Mensajes claros**: Errores descriptivos con detalles útiles
4. **CORS completo**: Soporta preflight y múltiples orígenes
5. **Idempotente**: Manejar duplicados y registros inexistentes sin error

## 📋 Contrato de la función

### URL
```
POST https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage
```

### Headers requeridos
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Body (JSON)

**Campos canónicos con prefijo `p_`** (siguiendo patrón maestro):

```json
{
  "p_stage_id": "uuid-del-estado",
  "p_operation": "hide" | "unhide"
}
```

### Validaciones

1. **Autenticación**: JWT válido obligatorio (401 si falta/inválido)
2. **Usuario-Empresa**: Usuario debe tener company_id (400 si no)
3. **Stage existe**: El stage_id debe existir (404 si no)
4. **Stage genérico**: El stage debe tener `company_id IS NULL` (400 si no)
5. **Operación válida**: Solo "hide" o "unhide" (400 si otra)

### Respuestas

#### ✅ 200 OK - Ocultar exitoso
```json
{
  "result": {
    "operation": "hide",
    "stage_id": "uuid",
    "stage_name": "Pendiente",
    "company_id": "uuid",
    "id": "uuid",
    "hidden_at": "2025-10-17T...",
    "hidden_by": "uuid"
  }
}
```

#### ✅ 200 OK - Mostrar exitoso
```json
{
  "result": {
    "operation": "unhide",
    "stage_id": "uuid",
    "stage_name": "Pendiente",
    "company_id": "uuid"
  }
}
```

#### ⚠️ 200 OK - Ya estaba oculto (idempotente)
```json
{
  "result": {
    "message": "Stage already hidden",
    "stage_id": "uuid",
    "company_id": "uuid"
  }
}
```

#### ❌ 400 Bad Request - Falta campo requerido
```json
{
  "error": "Missing required fields: p_operation",
  "details": {
    "required": ["p_stage_id", "p_operation"],
    "optional": [],
    "received_keys": ["p_stage_id"]
  }
}
```

#### ❌ 400 Bad Request - No es genérico
```json
{
  "error": "Only generic stages (system-wide) can be hidden",
  "stage_id": "uuid",
  "stage_name": "Estado Custom",
  "is_generic": false
}
```

#### ❌ 401 Unauthorized
```json
{
  "error": "Missing or invalid authorization"
}
```

#### ❌ 403 Forbidden - CORS
```json
{
  "error": "Origin not allowed"
}
```

#### ❌ 404 Not Found
```json
{
  "error": "Stage not found",
  "stage_id": "uuid"
}
```

#### ❌ 405 Method Not Allowed
```json
{
  "error": "Method not allowed",
  "allowed": ["POST", "OPTIONS"]
}
```

## 🚀 Despliegue

### 1. Configurar variables de entorno

En Supabase Dashboard > Edge Functions > Settings:

```bash
SUPABASE_URL=https://ufutyjbqfjrlzkprvyvs.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>
ALLOW_ALL_ORIGINS=true
# O específicos:
# ALLOWED_ORIGINS=http://localhost:4200,https://tudominio.com
```

### 2. Desplegar función

```bash
# Desde raíz del proyecto
supabase functions deploy hide-stage --project-ref ufutyjbqfjrlzkprvyvs
```

### 3. Verificar deployment

```bash
# Ver logs en tiempo real
supabase functions logs hide-stage --project-ref ufutyjbqfjrlzkprvyvs --follow
```

## 🧪 Pruebas

### Test 1: OPTIONS preflight (CORS)

```bash
curl -X OPTIONS \
  https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage \
  -H "Origin: http://localhost:4200" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

**Esperado**: `200 OK` con headers CORS

### Test 2: POST sin Authorization

```bash
curl -X POST \
  https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage \
  -H "Content-Type: application/json" \
  -d '{"p_stage_id": "uuid", "p_operation": "hide"}'
```

**Esperado**: `401 {"error":"Missing or invalid authorization"}`

### Test 3: POST con Authorization válido

```bash
# Obtener token de localStorage o Supabase Dashboard
TOKEN="tu-jwt-token-aquí"

curl -X POST \
  https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "p_stage_id": "uuid-de-estado-generico",
    "p_operation": "hide"
  }'
```

**Esperado**: `200 OK` con `{result: {...}}`

### Test 4: Intentar ocultar stage no genérico

```bash
curl -X POST \
  https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "p_stage_id": "uuid-de-estado-de-empresa",
    "p_operation": "hide"
  }'
```

**Esperado**: `400 {"error":"Only generic stages (system-wide) can be hidden"}`

### Test 5: Unhide stage

```bash
curl -X POST \
  https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/hide-stage \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "p_stage_id": "uuid-de-estado-generico",
    "p_operation": "unhide"
  }'
```

**Esperado**: `200 OK` con resultado de unhide

## 🔐 Seguridad

### Service Role vs Anon Key

- ✅ **Service Role**: Usado SOLO en Edge Function (servidor seguro)
- ❌ **Anon Key**: NUNCA usar para bypas RLS desde cliente
- ✅ JWT validado antes de cualquier operación
- ✅ company_id extraído del usuario autenticado (no del body)

### RLS Simplificado

Con la Edge Function, las políticas RLS de `hidden_stages` se simplifican:

```sql
-- SELECT: Ver estados ocultos de tu empresa
CREATE POLICY "Users can view their company hidden stages" ON hidden_stages
  FOR SELECT
  USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- INSERT/DELETE: Ya no necesitan validación compleja
-- La Edge Function maneja toda la validación
```

## 📊 Monitoreo

### Ver logs en producción

```bash
# Tiempo real
supabase functions logs hide-stage --project-ref ufutyjbqfjrlzkprvyvs --follow

# Últimos 100
supabase functions logs hide-stage --project-ref ufutyjbqfjrlzkprvyvs --limit 100
```

### Logs generados

La función registra:
- ✅ `✅` - Operaciones exitosas
- ⚠️ `⚠️` - Advertencias (duplicados, no existente)
- ❌ `❌` - Errores (validación, auth, BD)

## 🔄 Integración con Angular

El servicio `supabase-ticket-stages.service.ts` llama a la Edge Function:

```typescript
async hideGenericStage(stageId: string): Promise<{ error: any; data?: any }> {
  const { data: { session } } = await this.supabase.auth.getSession();
  
  const response = await fetch(
    `${environment.supabase.url}/functions/v1/hide-stage`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_stage_id: stageId,
        p_operation: 'hide'
      })
    }
  );

  const result = await response.json();
  return !response.ok ? { error: result.error } : { error: null, data: result.result };
}
```

## 🎓 Patrón aplicado

Esta Edge Function sigue el **patrón maestro** de:
- Validación de JWT
- CORS completo y configurable
- Validación de entrada con campos canónicos `p_*`
- Mensajes de error descriptivos con detalles
- Service role para bypass RLS seguro
- Idempotencia en operaciones
- Logging exhaustivo

## 📝 Checklist de deployment

- [ ] Variables de entorno configuradas en Supabase
- [ ] Función desplegada: `supabase functions deploy hide-stage`
- [ ] Test OPTIONS (preflight CORS) pasa
- [ ] Test POST sin auth devuelve 401
- [ ] Test POST con auth válido devuelve 200
- [ ] Test hide stage genérico funciona
- [ ] Test hide stage no genérico devuelve 400
- [ ] Test unhide funciona
- [ ] Logs visibles en Dashboard
- [ ] Angular service actualizado para usar Edge Function
- [ ] Frontend probado end-to-end

---

## 🚨 Migración desde RLS directo

**ANTES** (causaba 403):
```typescript
await supabase.from('hidden_stages').insert({ company_id, stage_id })
```

**DESPUÉS** (Edge Function robusta):
```typescript
await fetch('/functions/v1/hide-stage', {
  body: JSON.stringify({ p_stage_id, p_operation: 'hide' })
})
```

✅ **Resultado**: Sin errores RLS, validación robusta, mensajes claros
