# 🚀 DESPLEGAR EDGE FUNCTION: verifactu-dispatcher

## ⚠️ PROBLEMA DETECTADO

La función `verifactu-dispatcher` **NO ESTÁ DESPLEGADA** en tu proyecto de Supabase.

Los errores CORS que ves son porque:
1. Angular intenta llamar a la función
2. Supabase devuelve **404 Not Found** (la función no existe)
3. Como la respuesta es 404, ni siquiera se procesan los headers CORS
4. El navegador bloquea la petición con error CORS

## 📋 PASOS PARA DESPLEGAR

### 1️⃣ Verificar que tienes el código local

Asegúrate de que existe el archivo:
```
supabase/functions/verifactu-dispatcher/index.ts
```

### 2️⃣ Desplegar la función

Abre una terminal en la raíz del proyecto y ejecuta:

```bash
# Navegar a la carpeta del proyecto
cd f:/simplifica

# Desplegar la función específica
supabase functions deploy verifactu-dispatcher --no-verify-jwt

# O desplegar TODAS las funciones
supabase functions deploy
```

### 3️⃣ Verificar el despliegue

Después del despliegue, verifica en:
- **Supabase Dashboard** → Edge Functions
- Deberías ver `verifactu-dispatcher` en la lista
- Verifica que esté **ACTIVA** (enabled)

### 4️⃣ Probar la función

Prueba manualmente con curl:

```bash
curl -i --location --request POST 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/verifactu-dispatcher' \
  --header 'Authorization: Bearer TU_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"action":"health"}'
```

Deberías recibir **200 OK** en lugar de **404**.

---

## 🔍 VERIFICACIÓN ADICIONAL

### Comprobar funciones desplegadas

Lista todas las funciones actualmente desplegadas:

```bash
supabase functions list
```

Busca `verifactu-dispatcher` en la lista. Si **NO aparece**, definitivamente no está desplegada.

### Logs en tiempo real

Después de desplegar, monitorea los logs:

```bash
supabase functions logs verifactu-dispatcher --follow
```

---

## 🎯 CÓDIGO DE LA FUNCIÓN

Si por alguna razón **no tienes el archivo local**, aquí está el código completo que debes crear en:

**`supabase/functions/verifactu-dispatcher/index.ts`**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, ...params } = await req.json();

    let result;

    switch (action) {
      case 'health':
        result = { status: 'ok', timestamp: new Date().toISOString() };
        break;

      case 'get-config':
        const { companyId } = params;
        const { data: config, error: configError } = await supabase
          .from('verifactu_settings')
          .select('*')
          .eq('company_id', companyId)
          .single();

        if (configError) throw configError;
        result = config;
        break;

      case 'get-events':
        const { invoiceId } = params;
        const { data: events, error: eventsError } = await supabase
          .from('verifactu_events')
          .select('*')
          .eq('invoice_id', invoiceId)
          .order('created_at', { ascending: false });

        if (eventsError) throw eventsError;
        result = events;
        break;

      case 'sign-invoice':
        // Aquí iría la lógica de firma VeriFactu
        // Por ahora, devolver placeholder
        result = { 
          success: true, 
          message: 'VeriFactu signing not yet implemented',
          qr_code: null,
          signature: null
        };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in verifactu-dispatcher:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: error.message === 'Unauthorized' ? 401 : 500,
      }
    );
  }
});
```

---

## ✅ CHECKLIST POST-DESPLIEGUE

- [ ] La función aparece en Supabase Dashboard → Edge Functions
- [ ] El estado es **ACTIVE** (no disabled)
- [ ] La prueba con curl devuelve 200 OK
- [ ] Los logs de Supabase muestran peticiones POST/GET en lugar de 404
- [ ] La aplicación Angular ya no muestra errores CORS
- [ ] El detalle de factura carga sin errores en consola

---

## 🆘 SI AÚN NO FUNCIONA

1. **Verifica las variables de entorno** en Supabase Dashboard:
   - `SUPABASE_URL` debe estar configurada
   - `SUPABASE_SERVICE_ROLE_KEY` debe estar configurada

2. **Revisa los permisos RLS**:
   - Asegúrate de que las tablas `verifactu_settings` y `verifactu_events` existen
   - Verifica que las RLS policies permiten acceso desde service_role

3. **Reinicia el proyecto local** (si usas local dev):
   ```bash
   supabase stop
   supabase start
   ```

---

## 📞 COMANDO RÁPIDO

Si tienes prisa, ejecuta esto:

```bash
cd f:/simplifica && supabase functions deploy verifactu-dispatcher --no-verify-jwt && echo "✅ Desplegado con éxito"
```

Luego recarga la página de la factura en Angular y debería funcionar.
