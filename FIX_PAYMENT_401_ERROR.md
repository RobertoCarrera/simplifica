# Fix: Error 401 en Enlaces de Pago Públicos

## Problema
Las funciones públicas de pago (`public-payment-info` y `public-payment-redirect`) están devolviendo 401 porque requieren autenticación JWT.

## Solución

### Opción 1: Desactivar JWT Verification (RECOMENDADO) ✅

He creado archivos `function.yaml` para ambas funciones. Ahora redesplégalas:

```bash
cd supabase

# Redesplegar con la nueva configuración
supabase functions deploy public-payment-info
supabase functions deploy public-payment-redirect
```

### Opción 2: Configurar Manualmente en Dashboard

Si la opción 1 no funciona:

1. Ve a [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecciona tu proyecto
3. Ve a **Edge Functions** en el menú lateral
4. Para cada función (`public-payment-info` y `public-payment-redirect`):
   - Haz clic en la función
   - Ve a **Settings** o **Configuration**
   - Busca **JWT Verification** o **Verify JWT**
   - **Desactívalo** (toggle OFF)
   - Guarda los cambios

### Verificación

Después de redesplegar, verifica que funciona:

```bash
# Obtén tu PROJECT_REF de Supabase
PROJECT_REF="ufutyjbqfjrlzkprvyvs"

# Prueba la función (usa un token real de tu base de datos)
curl "https://${PROJECT_REF}.supabase.co/functions/v1/public-payment-info?token=TU_TOKEN_AQUI"
```

Deberías obtener un JSON con la información de la factura (200 OK) en lugar de un 401.

### Por qué esto es seguro

Estas funciones son públicas **por diseño**:
- No exponen datos sensibles
- Solo muestran información básica de factura (número, total, empresa)
- Requieren un token único y difícil de adivinar (48 caracteres hex)
- El token tiene fecha de expiración
- Usan service role key internamente para acceder a datos (bypassing RLS)

## Troubleshooting

### Sigue dando 401
- Verifica que los archivos `function.yaml` existen en las carpetas correctas
- Prueba a borrar y volver a crear las funciones
- Limpia la caché de Supabase: `supabase functions delete public-payment-info` y luego vuelve a desplegar

### La función no encuentra el token
- Verifica que el token existe en la tabla `invoices` columna `payment_link_token`
- Verifica que no ha expirado (`payment_link_expires_at`)
- Verifica que el enlace se está generando correctamente desde `create-payment-link`

### Error de CORS
- Los headers CORS están configurados como `*` (abierto a todos)
- Si quieres restringirlo, actualiza `corsHeaders` en el código
