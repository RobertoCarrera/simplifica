# Corrección de Error de Registro de Usuarios

## ❌ Problema Identificado
Error durante el registro de nuevas cuentas:
```
NavigatorLockAcquireTimeoutError: Acquiring an exclusive Navigator LockManager lock "lock:sb-main-auth-token" immediately failed
new row violates row-level security policy for table "companies"
```

## ✅ Soluciones Implementadas

### 1. Corrección de Políticas RLS
**Archivo creado**: `database/fix-companies-rls.sql`
- Políticas RLS demasiado restrictivas bloqueaban la creación de empresas
- Nuevas políticas permiten a usuarios autenticados crear empresas y usuarios
- Vista `user_company_context` agregada para soporte de políticas existentes

### 2. Manejo Mejorado de Errores de Lock
**Archivo modificado**: `src/app/services/auth.service.ts`
- Función `retryWithBackoff()` para manejar errores de Navigator Lock
- Reintentos automáticos con backoff exponencial
- Aplicado a operaciones críticas: signUp, creación de empresa, creación de usuario

## 🚀 Pasos para Aplicar la Corrección

### Paso 1: Ejecutar Script de Corrección RLS
```sql
-- Ejecuta este archivo en el SQL Editor de Supabase:
database/fix-company-rls.sql
```

### Paso 2: Reiniciar Servidor de Desarrollo
```bash
# Detener el servidor actual si está ejecutándose
# Ctrl+C en la terminal

# Limpiar caché y reiniciar
ng serve
```

### Paso 3: Probar el Flujo de Registro
1. Ir a la página de registro
2. Intentar crear una nueva cuenta
3. Verificar que se creen correctamente:
   - Usuario en `auth.users`
   - Empresa en `public.companies`
   - Usuario en `public.users`

## 🔍 Verificación de Éxito

### En Supabase Dashboard:
1. **Table Editor > companies**: Debe aparecer la nueva empresa
2. **Table Editor > users**: Debe aparecer el nuevo usuario con `role: 'owner'`
3. **Authentication > Users**: Debe aparecer el usuario autenticado

### En la Aplicación:
1. Login automático después del registro (si no requiere confirmación de email)
2. Acceso al dashboard principal
3. Funcionalidades GDPR funcionando correctamente

## 🛠️ Cambios Técnicos Realizados

### Políticas RLS Nuevas:
- `companies_allow_authenticated_insert`: Permite crear empresas
- `companies_user_company_select`: Ver empresas del usuario
- `companies_user_company_update`: Editar empresas (admin/owner)
- `companies_owner_delete`: Eliminar empresas (owner)
- `users_allow_own_insert`: Crear perfil propio
- `users_company_select`: Ver usuarios de la empresa
- `users_update_own_or_admin`: Actualizar perfiles
- `users_owner_delete`: Eliminar usuarios (owner)

### Mejoras en AuthService:
- Función `retryWithBackoff()` con 3 reintentos y backoff exponencial
- Aplicada a: `signUp()`, creación de empresa, creación de usuario
- Logging mejorado para debugging

## 🚨 Posibles Problemas Adicionales

Si el error persiste, verificar:

1. **Variables de entorno** en Supabase:
   ```
   SUPABASE_URL=tu-url-supabase
   SUPABASE_ANON_KEY=tu-anon-key
   ```

2. **RLS habilitado** en las tablas:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables 
   WHERE schemaname = 'public' AND tablename IN ('companies', 'users');
   ```

3. **Estructura de tablas** correcta:
   ```sql
   \d public.companies;
   \d public.users;
   ```

## 📝 Notas Importantes

- Las políticas RLS son más permisivas durante el registro para permitir la creación inicial
- Una vez creada la empresa y usuario, las políticas de seguridad tenant-based funcionan normalmente
- El retry automático maneja problemas temporales de concurrencia en Supabase
- Todos los cambios mantienen la compatibilidad con funciones GDPR existentes
