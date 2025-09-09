# 🚨 CORRECCIÓN URGENTE - RLS Recursion Fix

## Problema Identificado
Los errores de consola indican **recursión infinita en las políticas RLS** de Supabase. Esto impide que la autenticación funcione correctamente.

## Solución Inmediata

### 1. Accede a Supabase Dashboard
- Ve a [https://supabase.com/dashboard](https://supabase.com/dashboard)
- Selecciona tu proyecto
- Ve a la sección **SQL Editor**

### 2. Ejecuta el Script de Corrección
Copia y pega este SQL en el editor y ejecuta:

```sql
-- ================================================
-- EMERGENCY FIX: DISABLE RLS TEMPORARILY
-- ================================================

-- 1. Eliminar todas las políticas problemáticas
DROP POLICY IF EXISTS companies_select_own ON public.companies;
DROP POLICY IF EXISTS companies_authenticated ON public.companies;
DROP POLICY IF EXISTS companies_insert_auth ON public.companies;
DROP POLICY IF EXISTS companies_update_auth ON public.companies;
DROP POLICY IF EXISTS users_select_self ON public.users;
DROP POLICY IF EXISTS users_update_self ON public.users;
DROP POLICY IF EXISTS users_insert_self ON public.users;
DROP POLICY IF EXISTS users_own_data ON public.users;
DROP POLICY IF EXISTS users_insert_own ON public.users;

-- 2. Deshabilitar RLS completamente (temporal)
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 3. Verificar estado
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'companies');

-- 4. Mensaje de confirmación
DO $$ 
BEGIN 
    RAISE NOTICE '🚨 RLS TEMPORARILY DISABLED';
    RAISE NOTICE '✅ App should work now';
    RAISE NOTICE '⚠️  Remember to re-enable RLS with proper policies later';
END $$;
```

### 3. Verifica la Aplicación
Después de ejecutar el script:
1. Recarga la aplicación Angular
2. Intenta registrarte de nuevo
3. Ve a `/debug` para ver el debug dashboard

## Debugging
Si sigues teniendo problemas:
1. Abre la consola del navegador (F12)
2. Ve a la pestaña Network
3. Busca errores 500/401 en las peticiones HTTP
4. Ve a `/debug` en la aplicación para más información

## Estado Temporal
⚠️ **IMPORTANTE**: Esta corrección desactiva temporalmente la seguridad RLS. 
Una vez que la app funcione, implementaremos políticas RLS más seguras.

## Próximos Pasos
1. ✅ Aplicar corrección SQL
2. ✅ Verificar que funciona la autenticación
3. 🔄 Implementar RLS seguro (siguiente fase)
4. 🔄 Pruebas completas
