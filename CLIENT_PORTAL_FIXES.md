# Client Portal Fixes - Deployment Guide

## Problemas Corregidos

### 1. Error 406 al abrir la app
**Causa**: El Auth Hook `custom-access-token` intentaba leer de la tabla `users` usando `.single()`, pero los clientes del portal están en la tabla `clients`, causando un error 406 (no se encontró un único registro).

**Solución**: Actualizado el hook para buscar primero en `users` y luego en `clients` usando `.maybeSingle()`.

### 2. Error 403 al abrir facturas
**Causa**: La edge function `client-invoices` intentaba autenticar usando solo la tabla `users`, pero los clientes del portal no tienen registros ahí.

**Solución**: Actualizada la función para buscar en ambas tablas (`users` y `clients`).

## Edge Functions Desplegadas ✅

Las siguientes edge functions ya han sido desplegadas:
- ✅ `custom-access-token` - Actualizada para soportar clientes en tabla `clients`
- ✅ `client-invoices` - Actualizada para soportar autenticación desde tabla `clients`

## Políticas RLS Pendientes

Para completar la corrección, necesitas aplicar las políticas RLS actualizadas:

### Opción 1: Usar la interfaz de Supabase (Recomendado)

1. Ir a: https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/sql
2. Copiar y ejecutar el contenido del archivo `rls-client-portal-policies.sql`

### Opción 2: Usar psql directamente

```bash
# Requiere tener las credenciales en .env:
# SUPABASE_PROJECT_ID=ufutyjbqfjrlzkprvyvs
# SUPABASE_DB_PASSWORD=tu_password

PGPASSWORD=$SUPABASE_DB_PASSWORD psql \
  -h db.ufutyjbqfjrlzkprvyvs.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f rls-client-portal-policies.sql
```

### Opción 3: Copiar y pegar manualmente

Abre el archivo `rls-client-portal-policies.sql` y copia las líneas 7-29 (la nueva política para users):

```sql
-- ============================================================================
-- 0. POLÍTICAS PARA USERS (Para clientes con rol client)
-- ============================================================================

-- Eliminar política si existe
DROP POLICY IF EXISTS "users_select_client_self" ON public.users;

-- Permitir a usuarios con rol 'client' ver su propio registro en users
CREATE POLICY "users_select_client_self"
ON public.users
FOR SELECT
TO authenticated
USING (
  -- El usuario puede ver su propio registro si tiene rol 'client'
  auth.uid() = auth_user_id
  AND role = 'client'
  AND active = true
);

COMMENT ON POLICY "users_select_client_self" ON public.users IS 
'Permite a clientes del portal ver su propio registro en la tabla users';
```

## Verificación

Una vez aplicadas las políticas RLS, verifica:

1. ✅ Login como cliente funciona sin error 406
2. ✅ La app carga correctamente
3. ✅ El módulo de facturas es accesible sin error 403
4. ✅ Los clientes solo ven sus propias facturas

## Archivos Modificados

- `supabase/functions/custom-access-token/index.ts` - Auth hook actualizado
- `supabase/edge-functions/client-invoices/index.ts` - Edge function actualizada
- `supabase/functions/client-invoices/index.ts` - Copia para deployment
- `rls-client-portal-policies.sql` - Nueva política RLS agregada

## Notas Técnicas

### Custom Access Token Hook
El hook ahora:
1. Busca el usuario en la tabla `users` primero
2. Si no lo encuentra, busca en la tabla `clients`
3. Retorna el `company_id` encontrado en el JWT para ambos casos

### Client Invoices Function
La función ahora:
1. Autentica usando el token JWT para obtener el `auth.uid()`
2. Busca en `users` table con ese `auth_user_id`
3. Si no encuentra o el rol no es 'client', busca en `clients` table
4. Una vez identificado, resuelve el `client_id` para filtrar las facturas

### RLS Policy
La nueva política permite que:
- Usuarios con `role = 'client'` en la tabla `users` puedan leer su propio registro
- Se mantiene la restricción de `active = true`
- Solo funciona para el propio usuario (`auth.uid() = auth_user_id`)
