# Configuración del Auth Hook para agregar company_id al JWT

## 1. Desplegar la Edge Function

```bash
# Navega al directorio del proyecto
cd f:/simplifica

# Despliega la función (requiere Supabase CLI)
supabase functions deploy custom-access-token --no-verify-jwt
```

## 2. Configurar el Auth Hook en Supabase Dashboard

### Opción A: Mediante Dashboard (Recomendado)

1. Ve a **Authentication → Hooks** en Supabase Dashboard
2. Haz clic en **"Enable Hook"** para **Custom Access Token**
3. Selecciona:
   - **Hook Point**: `Custom Access Token`
   - **Function**: `custom-access-token`
4. Guarda la configuración

### Opción B: Mediante SQL (Alternativa)

Si prefieres configurarlo vía SQL, ejecuta en Supabase SQL Editor:

```sql
-- Configurar Auth Hook para agregar company_id al JWT
INSERT INTO auth.hooks (hook_name, hook_url, events, enabled)
VALUES (
  'custom_access_token',
  'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/custom-access-token',
  ARRAY['custom_access_token'],
  true
)
ON CONFLICT (hook_name) 
DO UPDATE SET 
  hook_url = EXCLUDED.hook_url,
  events = EXCLUDED.events,
  enabled = EXCLUDED.enabled;
```

## 3. Verificar el JWT después de configurar

### 3.1. Cerrar sesión y volver a iniciar

1. Cierra sesión en tu app
2. Vuelve a iniciar sesión
3. El nuevo JWT incluirá `company_id`

### 3.2. Inspeccionar JWT en consola

```javascript
// En la consola del navegador
const session = await supabase.auth.getSession()
console.log('JWT:', session.data.session?.access_token)

// Decodificar en https://jwt.io/
```

Deberías ver algo como:

```json
{
  "aud": "authenticated",
  "exp": 1762866437,
  "sub": "84efaa41-9734-4410-b0f2-9101e225ce0c",
  "email": "tu@email.com",
  "company_id": "123e4567-e89b-12d3-a456-426614174000",  // ← Nuevo claim
  "iss": "https://ufutyjbqfjrlzkprvyvs.supabase.co/auth/v1",
  "role": "authenticated"
}
```

## 4. Probar las funciones RPC

Una vez configurado, prueba desde Supabase SQL Editor:

```sql
-- Esto debe retornar datos (no error "Missing company_id")
SELECT * FROM f_quote_kpis_monthly(NULL, NULL);
```

## 5. Troubleshooting

### El hook no se ejecuta

- Verifica que la Edge Function esté desplegada: `supabase functions list`
- Revisa logs: **Edge Functions → Logs** en Dashboard
- Asegúrate de haber cerrado sesión y vuelto a iniciar

### Error "Function not found"

```bash
# Redespliega con permisos correctos
supabase functions deploy custom-access-token --no-verify-jwt
```

### JWT aún sin company_id

1. Fuerza refresh del token:

```javascript
// En consola del navegador
await supabase.auth.refreshSession()
```

2. O cierra sesión completamente:

```javascript
await supabase.auth.signOut()
```

## 6. Alternativa sin Auth Hook (temporal)

Si no puedes desplegar Edge Functions ahora, modifica temporalmente `get_user_company_id()`:

```sql
-- Alternativa: Leer company_id de tabla users en lugar de JWT
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Buscar company_id del usuario autenticado en tabla users
  SELECT company_id 
  INTO v_company_id
  FROM public.users
  WHERE auth_user_id = auth.uid();
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User does not have company_id assigned';
  END IF;
  
  RETURN v_company_id;
END;
$$;
```

Esta alternativa hace un JOIN extra pero funciona sin Auth Hook.

---

## Resumen

**Causa del error**: JWT no incluye claim `company_id`  
**Solución**: Configurar Auth Hook `custom-access-token`  
**Pasos**: Deploy Edge Function → Configurar Hook → Reiniciar sesión  
**Validación**: JWT incluirá `company_id`, RPCs funcionarán
