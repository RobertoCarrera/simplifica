# 🔧 Solución Manual: Configurar Auth Hook para Analytics

## ❌ Problema Actual

Las analíticas dan error **400 Bad Request** con mensaje:
```
Missing company_id in JWT claims
Hint: Ensure Auth Hook is configured and user has logged in after activation
```

## ✅ Solución: Desplegar Edge Function y Configurar Auth Hook

---

## 📝 PASO 1: Desplegar Edge Function en Supabase Dashboard

### 1.1. Acceder al Dashboard
1. Ve a https://supabase.com/dashboard
2. Abre tu proyecto: **ufutyjbqfjrlzkprvyvs**

### 1.2. Crear la Edge Function
1. En el menú lateral, haz clic en **"Edge Functions"**
2. Haz clic en **"Create a new function"**
3. Configura:
   - **Name**: `custom-access-token` (IMPORTANTE: nombre exacto)
   - **Template**: Selecciona "Blank function" o "HTTP Server"

### 1.3. Copiar el código
**Copia y pega EXACTAMENTE este código en el editor:**

```typescript
// Edge Function: custom-access-token
// Supabase Auth Hook para agregar company_id al JWT
// Documentación: https://supabase.com/docs/guides/auth/auth-hooks

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async (req) => {
  try {
    const { user } = await req.json()
    
    console.log('[custom-access-token] Processing for user:', user.id)

    // Crear cliente Supabase con service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar company_id del usuario en la tabla users
    const { data: userData, error } = await supabase
      .from('users')
      .select('company_id')
      .eq('auth_user_id', user.id)
      .single()

    if (error) {
      console.error('[custom-access-token] Error fetching user:', error)
      // Si no encuentra el usuario, no agregar claim (permitir continuar)
      return new Response(
        JSON.stringify({ 
          app_metadata: {}, 
          user_metadata: {} 
        }),
        { 
          headers: { 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    console.log('[custom-access-token] Found company_id:', userData?.company_id)

    // Retornar company_id como custom claim
    return new Response(
      JSON.stringify({
        app_metadata: {
          company_id: userData?.company_id || null
        },
        user_metadata: {}
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('[custom-access-token] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
```

### 1.4. Desplegar la función
1. Haz clic en **"Deploy"** o **"Save & Deploy"**
2. Espera a que el despliegue se complete (puede tardar 1-2 minutos)
3. Verás un mensaje de éxito: **"Function deployed successfully"**

---

## 🔐 PASO 2: Configurar Auth Hook

### 2.1. Acceder a Authentication Hooks
1. En el menú lateral de Supabase Dashboard, ve a **"Authentication"**
2. Haz clic en la pestaña **"Hooks"**

### 2.2. Habilitar Custom Access Token Hook
1. Busca la sección **"Custom Access Token"**
2. Haz clic en **"Enable Hook"** o **"Configure"**
3. Selecciona:
   - **Hook Function**: `custom-access-token` (la función que acabas de crear)
   - **Enabled**: ✅ Activado
4. Haz clic en **"Save"** o **"Update"**

### 2.3. Verificar configuración
- Deberías ver que el Hook está **"Enabled"** con el icono verde ✅
- La función apunta a: `custom-access-token`

---

## 🔄 PASO 3: Regenerar JWT del Usuario

**IMPORTANTE**: El JWT actual NO tiene el `company_id`. Necesitas regenerarlo cerrando y volviendo a entrar.

### 3.1. Cerrar sesión en la aplicación
1. Abre http://localhost:4200
2. Haz clic en tu perfil → **"Cerrar sesión"** (o logout)
3. Asegúrate de que se cierra completamente la sesión

### 3.2. Volver a iniciar sesión
1. Inicia sesión con tu usuario: **roberto@sincronia.es** (o el que uses)
2. Ingresa tu contraseña
3. ✅ **El nuevo JWT ahora incluirá `company_id` en app_metadata**

---

## ✅ PASO 4: Verificar que funciona

### 4.1. Probar Analytics Dashboard
1. Ve a http://localhost:4200/analytics
2. La página debería cargar **SIN errores 400**
3. Verás los KPIs:
   - Presupuestos Enviados
   - Ingresos Proyectados  
   - Presupuestos Aceptados
   - Tasa de Conversión

### 4.2. Verificar en consola del navegador
Abre DevTools (F12) → Console:
- ❌ **ANTES**: Veías `POST .../f_quote_kpis_monthly 400 (Bad Request)`
- ✅ **AHORA**: Deberías ver `POST .../f_quote_kpis_monthly 200 (OK)`

### 4.3. Verificar logs en Supabase
1. Ve a **Edge Functions** → **custom-access-token**
2. Haz clic en **"Logs"** o **"Invocations"**
3. Deberías ver logs como:
   ```
   [custom-access-token] Processing for user: 84efaa41-9734-4410-b0f2-9101e225ce0c
   [custom-access-token] Found company_id: cd830f43-f6f0-4b78-a2a4-505e4e0976b5
   ```

---

## 🐛 Troubleshooting

### ❌ Problema: Sigo viendo error 400
**Solución**:
1. Verifica que el Auth Hook está **Enabled** (verde ✅)
2. Cierra sesión completamente (borra cookies si es necesario)
3. Vuelve a iniciar sesión
4. Limpia caché del navegador: Ctrl+Shift+Del → Borrar caché

### ❌ Problema: Edge Function no aparece en el dropdown
**Solución**:
1. Asegúrate de que el nombre sea **exactamente** `custom-access-token`
2. Verifica que el despliegue fue exitoso (estado: **"Live"**)
3. Refresca la página del Dashboard

### ❌ Problema: Error al desplegar Edge Function
**Solución**:
1. Verifica que copiaste **todo el código** correctamente
2. No modifiques los imports ni las variables de entorno
3. Si el error persiste, intenta crear la función de nuevo

---

## 📊 Resultado Esperado

**ANTES (con error):**
```
POST /rest/v1/rpc/f_quote_kpis_monthly 400 (Bad Request)
Error: Missing company_id in JWT claims
```

**DESPUÉS (funcionando):**
```
POST /rest/v1/rpc/f_quote_kpis_monthly 200 (OK)
{
  "kpi_sent": 5,
  "kpi_accepted": 2,
  "kpi_revenue": 1234.50,
  "kpi_conversion_rate": 0.4
}
```

---

## 📞 Si necesitas ayuda

1. **Revisa logs de Edge Function**: Dashboard → Edge Functions → custom-access-token → Logs
2. **Revisa logs del navegador**: F12 → Console → busca errores en rojo
3. **Verifica tabla users**: Asegúrate de que tu usuario tiene `company_id` en la columna

---

✅ **Una vez completado todos los pasos, las analíticas deberían funcionar correctamente.**
