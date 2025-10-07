# 🔧 Edge Functions - Fix para RLS

## 📋 Problema

Después de habilitar Row Level Security (RLS), las Edge Functions que usan `supabaseAdmin` (service role) fallan porque:

1. **RLS bloquea queries** sin contexto de usuario
2. **Service role** puede bypassear RLS, pero necesita configuración correcta
3. **Queries deben usar el token del usuario** para respetar políticas RLS

## ✅ Solución Aplicada

### Edge Function: `upsert-client`

**Cambio principal**: Crear cliente Supabase con contexto de usuario

```typescript
// ❌ ANTES (fallaba con RLS)
const { data } = await supabaseAdmin.from('clients').select('*');

// ✅ DESPUÉS (respeta RLS)
const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: {
    headers: {
      Authorization: `Bearer ${token}` // Token del usuario autenticado
    }
  }
});
const { data } = await supabaseUser.from('clients').select('*');
```

### Patrón de Implementación

1. **Validar token del usuario**:
   ```typescript
   const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
   ```

2. **Crear cliente con contexto**:
   ```typescript
   const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
     auth: { persistSession: false },
     global: {
       headers: {
         Authorization: `Bearer ${token}`
       }
     }
   });
   ```

3. **Usar `supabaseUser` para queries que necesitan RLS**:
   ```typescript
   await supabaseUser.from('clients').select('*'); // Respeta RLS
   await supabaseUser.from('users').select('company_id'); // Respeta RLS
   ```

4. **Mantener `supabaseAdmin` solo para**:
   - Validación de tokens: `supabaseAdmin.auth.getUser()`
   - Operaciones que explícitamente deben bypassear RLS (raras)

## 📦 Edge Functions Actualizadas

### ✅ CORREGIDO:
- [x] `upsert-client` - Crear/actualizar clientes

### ⚠️ REVISAR (pueden necesitar el mismo fix):
- [ ] `create-device` - Si crea devices
- [ ] `create-ticket` - Si crea tickets
- [ ] `import-customers` - Si importa clientes masivamente
- [ ] `import-services` - Si importa servicios masivamente
- [ ] `update-client-safe` - Si actualiza clientes
- [ ] `link-ticket-device` - Si vincula dispositivos a tickets
- [ ] `list-company-devices` - Si lista dispositivos por empresa
- [ ] `create-address` - Si crea direcciones
- [ ] `create-locality` - Si crea localidades
- [ ] `upsert-ticket-comment-attachment` - Si añade adjuntos

### ✅ NO NECESITAN CAMBIOS:
- [x] `get-csrf-token` - No hace queries a base de datos

## 🚀 Deployment

### Opción 1: Deploy individual
```bash
# Desde la raíz del proyecto
cd supabase/functions/upsert-client
supabase functions deploy upsert-client
```

### Opción 2: Deploy todas las funciones
```bash
# Desde la raíz del proyecto
supabase functions deploy
```

### Opción 3: Deploy vía Dashboard
1. Ir a Supabase Dashboard → Edge Functions
2. Seleccionar `upsert-client`
3. Click en "Deploy new version"
4. Copiar/pegar el contenido de `index.ts`
5. Deploy

## 🧪 Testing

Después de deployar, probar:

```bash
# 1. Crear un cliente nuevo
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/upsert-client \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "p_name": "TEST CLIENT",
    "p_email": "test@example.com",
    "p_phone": "123456789"
  }'

# 2. Verificar respuesta
# ✅ Debe retornar: { "ok": true, "method": "create", "client": {...} }
# ❌ Si falla: revisar logs en Supabase Dashboard → Edge Functions → Logs
```

## 📝 Checklist Post-Deploy

- [ ] Edge Function desplegada en Supabase
- [ ] Probado crear cliente desde frontend
- [ ] Probado actualizar cliente desde frontend
- [ ] No hay errores 500 en consola del navegador
- [ ] Logs de Edge Function no muestran errores de RLS
- [ ] Cliente se crea correctamente con `company_id` correcto

## 🔍 Troubleshooting

### Error: "Unable to determine company for authenticated user"

**Causa**: Usuario no tiene `company_id` en tabla `users`

**Solución**:
```sql
-- Verificar usuario
SELECT id, auth_user_id, company_id FROM users WHERE auth_user_id = 'UUID_DEL_USUARIO';

-- Si company_id es NULL, asignar una empresa
UPDATE users SET company_id = 'UUID_DE_EMPRESA' WHERE auth_user_id = 'UUID_DEL_USUARIO';
```

### Error: "Client not found" o "Not allowed to modify client from another company"

**Causa**: RLS está funcionando correctamente - el usuario intenta acceder a un cliente de otra empresa

**Solución**: Esto es el comportamiento esperado. Verificar que el usuario esté intentando acceder solo a clientes de su propia empresa.

### Error: "Failed to create client" con detalles de RLS

**Causa**: La política RLS de `clients` está bloqueando la inserción

**Solución**: Verificar que la tabla `clients` tenga política de INSERT:
```sql
-- Ver políticas actuales
SELECT * FROM pg_policies WHERE tablename = 'clients';

-- Debería existir una política que permita INSERT para usuarios autenticados de la misma empresa
```

## 📊 Impacto en Producción

### Antes de RLS:
- ⚠️ Edge Functions podían acceder a datos de TODAS las empresas
- ⚠️ Sin aislamiento multi-tenant en backend
- ⚠️ Seguridad dependía 100% de lógica de aplicación

### Después de RLS:
- ✅ Edge Functions respetan aislamiento multi-tenant
- ✅ Base de datos bloquea acceso cruzado entre empresas
- ✅ Seguridad a nivel de base de datos (defensa en profundidad)

## 🎯 Next Steps

1. **Desplegar `upsert-client` corregida** ⚠️ URGENTE
2. **Probar crear cliente** desde frontend
3. **Revisar otras Edge Functions** que puedan necesitar el mismo fix
4. **Actualizar y desplegar** las que fallen

---

**Última actualización**: 2025-10-07  
**Versión**: 1.0  
**Estado**: `upsert-client` corregida, pendiente de deploy
