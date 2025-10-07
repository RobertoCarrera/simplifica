# 🚀 DEPLOYMENT URGENTE - Edge Function upsert-client

## ⚠️ ACCIÓN INMEDIATA REQUERIDA

La Edge Function `upsert-client` ha sido corregida para funcionar con RLS.  
**DEBES DESPLEGARLA AHORA** para que crear clientes funcione.

---

## 📝 Opción 1: Deploy Manual (RECOMENDADO - MÁS RÁPIDO)

### Paso 1: Ir a Supabase Dashboard
1. Abre tu navegador
2. Ve a: https://supabase.com/dashboard
3. Selecciona tu proyecto: `ufutyjbqfjrlzkprvyvs`
4. Click en **Edge Functions** (menú lateral izquierdo)

### Paso 2: Editar la función
1. Encuentra `upsert-client` en la lista
2. Click en `upsert-client`
3. Click en botón **"Edit Function"** o **"Deploy new version"**

### Paso 3: Copiar código actualizado
1. Abre el archivo: `f:\simplifica\supabase\functions\upsert-client\index.ts`
2. Selecciona TODO el contenido (Ctrl+A)
3. Copia (Ctrl+C)
4. Pega en el editor del Dashboard
5. Click en **"Deploy"** o **"Save & Deploy"**

### Paso 4: Verificar
1. Espera 10-30 segundos para que despliegue
2. Verifica que aparezca "Successfully deployed" o similar
3. Refresca tu aplicación Angular (F5)
4. Intenta crear un cliente nuevamente

---

## 📝 Opción 2: Deploy vía CLI (si tienes Supabase CLI instalado)

### Verificar si tienes CLI:
```bash
supabase --version
```

### Si SÍ tienes CLI:
```bash
cd f:/simplifica
supabase login
supabase functions deploy upsert-client
```

### Si NO tienes CLI:
```bash
npm install -g supabase
supabase login
cd f:/simplifica
supabase functions deploy upsert-client
```

---

## 📝 Opción 3: Deploy vía GitHub (si tienes GitHub Actions)

Si tienes configurado deployment automático vía GitHub:

```bash
cd f:/simplifica
git add supabase/functions/upsert-client/index.ts
git commit -m "fix: Edge Function upsert-client compatible con RLS"
git push origin main
```

Luego espera a que GitHub Actions despliegue automáticamente.

---

## ✅ ¿Cómo saber si funcionó?

Después de desplegar:

1. **Refresca tu app Angular** (F5)
2. **Intenta crear un cliente**:
   - Nombre: "Cliente Prueba"
   - Email: "prueba@test.com"
   - Teléfono: "123456789"
3. **Resultado esperado**:
   - ✅ Cliente se crea correctamente
   - ✅ Aparece en la lista de clientes
   - ✅ NO hay error 500 en consola

4. **Si aún falla**:
   - Ve a Supabase Dashboard → Edge Functions → upsert-client → **Logs**
   - Copia el error que aparece
   - Compártelo conmigo para seguir debuggeando

---

## 🔧 ¿Qué se cambió exactamente?

### Cambio 1: Cliente Supabase con contexto de usuario (RLS)

**ANTES (fallaba con RLS):**
```typescript
// Usaba solo supabaseAdmin (service role sin contexto)
const { data } = await supabaseAdmin.from('clients').select('*');
// ❌ RLS bloqueaba la query
```

**DESPUÉS (funciona con RLS):**
```typescript
// Crea cliente Supabase con token del usuario
const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: {
    headers: {
      Authorization: `Bearer ${token}` // Token del usuario
    }
  }
});

// Ahora respeta RLS correctamente
const { data } = await supabaseUser.from('clients').select('*');
// ✅ RLS permite la query porque tiene contexto de usuario
```

### Cambio 2: Removido campo direccion_id (no existe en schema)

**ANTES:**
```typescript
const FIELD_MAP = {
  p_id: 'id',
  p_name: 'name',
  p_apellidos: 'apellidos',
  p_email: 'email',
  p_phone: 'phone',
  p_dni: 'dni',
  p_direccion_id: 'direccion_id', // ❌ Esta columna NO existe
  p_metadata: 'metadata'
};
```

**DESPUÉS:**
```typescript
const FIELD_MAP = {
  p_id: 'id',
  p_name: 'name',
  p_apellidos: 'apellidos',
  p_email: 'email',
  p_phone: 'phone',
  p_dni: 'dni',
  // p_direccion_id: removido - no existe en schema
  p_metadata: 'metadata'
};
```

**Error previo:**
```
Could not find the 'direccion_id' column of 'clients' in the schema cache
```

---

## 🎯 PRIORIDAD: ALTA

**Esto es bloqueante**: Sin este deploy, no podrás crear clientes nuevos.

**Tiempo estimado**: 2-5 minutos (Opción 1 - Manual Dashboard)

---

## 📞 Si tienes problemas

Comparte:
1. Screenshot del error en consola del navegador
2. Logs de Supabase Dashboard → Edge Functions → upsert-client → Logs
3. Método de deployment que intentaste usar

---

**Última actualización**: 2025-10-07  
**Estado**: Código corregido (RLS + schema fix), pendiente de deployment  
**Archivo modificado**: `f:\simplifica\supabase\functions\upsert-client\index.ts`  
**Versión**: 2025-10-07-RLS-COMPATIBLE  
**Cambios**: 
- ✅ Compatible con RLS (usa token de usuario)
- ✅ Removido campo `direccion_id` (no existe en schema)
