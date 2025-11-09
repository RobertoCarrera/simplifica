# 🚀 Cómo Desplegar la Edge Function Actualizada

## Problema Actual
La Edge Function `create-service-variant` en Supabase está usando código antiguo.
El código local está actualizado con el nuevo formato de `pricing[]`, pero Supabase ejecuta la versión antigua.

## Solución: Redesplegar la Edge Function

### Opción 1: Desplegar vía Supabase CLI (Recomendado)

```bash
# 1. Asegúrate de tener Supabase CLI instalado
supabase --version

# 2. Si no está instalado:
npm install -g supabase

# 3. Login en Supabase (solo primera vez)
supabase login

# 4. Link al proyecto (solo primera vez)
supabase link --project-ref ufutyjbqfjrlzkprvyvs

# 5. Desplegar la función
supabase functions deploy create-service-variant
```

### Opción 2: Desplegar vía Dashboard de Supabase

1. Ve a https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/functions
2. Encuentra la función `create-service-variant`
3. Click en "Edit Function"
4. Copia todo el contenido de `f:\simplifica\supabase\functions\create-service-variant\index.ts`
5. Pégalo en el editor
6. Click en "Deploy"

## Verificar el Despliegue

Después de desplegar, prueba creando una variante desde la UI.
Los logs deberían mostrar:
```
📤 Sending variant to Edge Function: {
  "variant_name": "...",
  "pricing": [
    { "billing_period": "monthly", "base_price": 49 }
  ],
  ...
}
```

Y la Edge Function debería responder con `200 OK`.

## Notas Importantes

- La Edge Function local (archivo) está actualizada ✅
- La Edge Function en Supabase (desplegada) está desactualizada ❌
- Por eso recibes el error 400 - la función desplegada no espera el array `pricing`

## Logs para Depurar

Si sigue fallando después del despliegue, revisa:
1. **Console del navegador**: Busca el log `📤 Sending variant to Edge Function`
2. **Supabase Logs**: Ve a Functions > create-service-variant > Logs
3. **Network tab**: Inspecciona el payload del POST request
