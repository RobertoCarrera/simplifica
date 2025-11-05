# Deployment Guide for New Edge Functions

## New Edge Functions Created

1. **quotes-stats** - Obtiene estadísticas de presupuestos (pendientes y aceptados) desde la última sesión del usuario
2. **top-products** - Calcula el top 3 de productos más vendidos basándose en facturas pagadas

## Prerequisites

Antes de desplegar, ejecuta la migración SQL para añadir el campo `last_session_at` a la tabla profiles:

```bash
# Conecta a tu base de datos de Supabase y ejecuta:
psql -h <your-supabase-db-host> -U postgres -d postgres -f database/add-last-session-at.sql
```

O desde el SQL Editor de Supabase Dashboard, ejecuta el contenido de `database/add-last-session-at.sql`

## Deployment Steps

### 1. Login to Supabase CLI

```bash
npx supabase login
```

### 2. Link to your project

```bash
npx supabase link --project-ref xqpxkxmtykwqnmcxoknr
```

### 3. Deploy Edge Functions

```bash
# Deploy quotes-stats function
npx supabase functions deploy quotes-stats

# Deploy top-products function
npx supabase functions deploy top-products
```

### 4. Verify Deployment

Check the Supabase Dashboard > Edge Functions to verify both functions are deployed successfully.

## Testing

### Test quotes-stats

```bash
curl -i --location --request POST 'https://xqpxkxmtykwqnmcxoknr.supabase.co/functions/v1/quotes-stats' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json'
```

Expected response:
```json
{
  "pendingSinceLastSession": 5,
  "acceptedSinceLastSession": 2
}
```

### Test top-products

```bash
curl -i --location --request POST 'https://xqpxkxmtykwqnmcxoknr.supabase.co/functions/v1/top-products' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json'
```

Expected response:
```json
{
  "topProducts": [
    {
      "productId": "prod-123",
      "productName": "Producto A",
      "totalQuantitySold": 150
    },
    {
      "productId": "prod-456",
      "productName": "Producto B",
      "totalQuantitySold": 120
    },
    {
      "productId": "prod-789",
      "productName": "Producto C",
      "totalQuantitySold": 95
    }
  ]
}
```

## Frontend Integration

Las funciones ya están integradas en el componente Home:

- `quotes-stats` se llama al cargar el dashboard para mostrar presupuestos pendientes y aceptados desde la última sesión
- `top-products` se llama para mostrar el ranking de los 3 productos más vendidos

Las cards correspondientes tienen navegación:
- **Presupuestos Pendientes** → `/presupuestos?status=pendiente`
- **Presupuestos Aceptados** → `/presupuestos?status=aceptado`
- **Top Productos** → `/productos`

## Database Schema Changes

### profiles table
- Added column: `last_session_at` (timestamp with time zone)
- Index created for performance: `idx_profiles_last_session_at`

## Notes

- Las edge functions utilizan autenticación del usuario actual (Authorization header)
- Solo devuelven datos de la compañía del usuario autenticado
- `quotes-stats` actualiza automáticamente el `last_session_at` cada vez que se ejecuta
- `top-products` solo cuenta productos de facturas con estado 'paid'
