# Actualización de Dominio para Enlaces de Pago

## Cambios Realizados

Se ha actualizado el dominio para los enlaces de pago de `https://simplifica.app` a `https://pagos.simplificacrm.es`.

### Archivos Modificados

1. **`supabase/functions/create-payment-link/index.ts`**
   - Actualizado `PUBLIC_SITE_URL` por defecto

2. **`supabase/edge-functions/process-recurring-quotes/index.ts`**
   - Actualizado `PUBLIC_SITE_URL` por defecto

## Pasos para Completar la Configuración

### 1. Configurar el Subdominio

Crea el subdominio `pagos.simplificacrm.es` en tu proveedor de DNS apuntando a tu aplicación:

**Opción A: Si usas Vercel**
```bash
# En tu proyecto de Vercel, añade el dominio personalizado
pagos.simplificacrm.es
```

**Opción B: Si usas otro hosting**
- Crea un registro CNAME o A apuntando a tu servidor
- Configura SSL/TLS (certificado HTTPS)

### 2. Configurar Variable de Entorno en Supabase

Añade la variable de entorno en tu proyecto de Supabase:

```bash
# En Supabase Dashboard > Project Settings > Edge Functions > Environment Variables
PUBLIC_SITE_URL=https://pagos.simplificacrm.es
```

O mediante CLI:
```bash
supabase secrets set PUBLIC_SITE_URL=https://pagos.simplificacrm.es
```

### 3. Desplegar las Edge Functions Actualizadas

```bash
cd supabase

# Desplegar función de creación de enlaces de pago
supabase functions deploy create-payment-link

# Desplegar función de procesamiento de presupuestos recurrentes
supabase functions deploy process-recurring-quotes

# Verificar el despliegue
supabase functions list
```

### 4. Configurar CORS en el Frontend

Si tu frontend está en `app.simplificacrm.es`, asegúrate de permitir peticiones desde el subdominio de pagos.

En tu archivo de configuración de Angular (`angular.json` o proxy config):
```json
{
  "allowedOrigins": [
    "https://app.simplificacrm.es",
    "https://pagos.simplificacrm.es"
  ]
}
```

### 5. Actualizar Webhooks de Proveedores de Pago

**PayPal:**
- Ir a Developer Dashboard > Webhooks
- Actualizar URL de webhook a: `https://[tu-proyecto].supabase.co/functions/v1/paypal-webhook`

**Stripe:**
- Ir a Dashboard > Webhooks
- Actualizar URL de webhook a: `https://[tu-proyecto].supabase.co/functions/v1/stripe-webhook`

### 6. Crear Página de Pago Pública

Necesitas crear una aplicación o página pública que responda en `https://pagos.simplificacrm.es/pago/:token`:

**Estructura esperada:**
```
pagos.simplificacrm.es/
└── pago/
    └── [token]  --> Página que muestra información de pago
```

Esta página debe:
1. Obtener el token de la URL
2. Llamar a la función `public-payment-info` para obtener datos de la factura
3. Redirigir automáticamente al proveedor de pago (PayPal/Stripe)
4. Manejar las respuestas (success/cancelled)

## Verificación

Para verificar que todo funciona:

1. Genera un enlace de pago desde el panel de facturas
2. Copia el enlace generado
3. Verifica que comienza con `https://pagos.simplificacrm.es/pago/...`
4. Accede al enlace y verifica que:
   - Se muestra la información correcta de la factura
   - El botón de pago redirige correctamente a PayPal/Stripe
   - Después del pago, vuelve correctamente con el estado

## Troubleshooting

### El enlace no funciona (404)
- Verifica que el dominio `pagos.simplificacrm.es` está correctamente configurado
- Verifica que la aplicación está desplegada en ese dominio
- Comprueba los logs de DNS

### Error de CORS
- Añade `pagos.simplificacrm.es` a los orígenes permitidos en Supabase
- Verifica headers CORS en tu aplicación frontend

### El pago no se procesa
- Verifica que los webhooks están configurados correctamente
- Revisa los logs de las Edge Functions en Supabase
- Comprueba las credenciales de PayPal/Stripe

## Rollback

Si necesitas volver atrás:

1. Restaurar las Edge Functions con el dominio anterior
2. Actualizar la variable de entorno:
   ```bash
   supabase secrets set PUBLIC_SITE_URL=https://app.simplificacrm.es
   ```
3. Redesplegar las funciones

## Notas Importantes

- Los enlaces de pago antiguos (con `simplifica.app`) dejarán de funcionar
- Considera implementar una redirección desde el dominio antiguo si es necesario
- Actualiza cualquier documentación o emails que mencionen el dominio antiguo
