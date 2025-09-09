# 🚀 PASOS RESTANTES PARA COMPLETAR MULTI-TENANT

## ✅ **YA COMPLETADO**

1. ✅ **Base de datos**: Tablas multi-tenant creadas
2. ✅ **Supabase**: Dependencia ya instalada (`@supabase/supabase-js: ^2.57.2`)
3. ✅ **Environment**: Variables ya configuradas correctamente
4. ✅ **Servicios**: AuthService y guards creados
5. ✅ **Componentes**: Login y Register implementados
6. ✅ **Rutas**: Sistema de protección implementado

## 🔄 **PRÓXIMOS PASOS**

### **PASO 1: Ejecutar Scripts SQL** ⏰ (5 min)

En Supabase SQL Editor, ejecutar en orden:

```sql
-- 1. Actualizar companies existentes
-- Ejecutar: database/update-existing-companies.sql

-- 2. Migrar datos existentes  
-- Ejecutar: database/migrate-existing-data.sql
```

### **PASO 2: Actualizar Servicios Restantes** ⏰ (10 min)

He empezado a actualizar `supabase-customers.service.ts`. Necesitas hacer lo mismo para:

- `supabase-tickets.service.ts`
- `supabase-services.service.ts`

**Cambios necesarios en cada servicio:**

```typescript
// 1. Añadir import
import { AuthService } from './auth.service';

// 2. Inyectar en constructor
private authService = inject(AuthService);

// 3. En métodos de consulta, añadir filtro:
const companyId = this.authService.companyId();
if (companyId) {
  query = query.eq('company_id', companyId);
}

// 4. En métodos de creación, añadir company_id:
const companyId = this.authService.companyId();
if (!companyId) {
  return throwError(() => new Error('Usuario no tiene empresa asignada'));
}
// Añadir company_id al objeto a insertar
```

### **PASO 3: Crear Usuarios Admin** ⏰ (5 min)

1. Ir a `/register`
2. Crear usuarios admin para cada empresa:
   - `admin@digitalizamostupyme.es`
   - `admin@satpcgo.es`
3. Después del registro, en SQL Editor:

```sql
-- Para Digitalizamos tu PYME
UPDATE user_profiles 
SET company_id = '6c1a6e99-be3f-4bae-9398-3b892082c7c6', role = 'admin'
WHERE email = 'admin@digitalizamostupyme.es';

-- Para SatPCGo
UPDATE user_profiles 
SET company_id = 'c0976b79-a10a-4e94-9f1d-f78afcdbee2a', role = 'admin'
WHERE email = 'admin@satpcgo.es';
```

### **PASO 4: Reasignar Datos Existentes** ⏰ (10 min)

Revisar y reasignar customers, tickets, services a las empresas correctas:

```sql
-- Ejemplo: Si todos los datos actuales son de "Digitalizamos tu PYME"
UPDATE customers 
SET company_id = '6c1a6e99-be3f-4bae-9398-3b892082c7c6'
WHERE company_id IS NULL OR company_id != '6c1a6e99-be3f-4bae-9398-3b892082c7c6';

UPDATE tickets 
SET company_id = '6c1a6e99-be3f-4bae-9398-3b892082c7c6'
WHERE company_id IS NULL OR company_id != '6c1a6e99-be3f-4bae-9398-3b892082c7c6';

UPDATE services 
SET company_id = '6c1a6e99-be3f-4bae-9398-3b892082c7c6'
WHERE company_id IS NULL OR company_id != '6c1a6e99-be3f-4bae-9398-3b892082c7c6';
```

### **PASO 5: Probar Sistema** ⏰ (5 min)

1. Login con usuario admin
2. Verificar que solo ve datos de su empresa
3. Crear nuevo cliente/ticket/servicio
4. Verificar que se asigna automáticamente a su empresa

## 🎯 **RESULTADO FINAL**

- ✅ **Aislamiento completo**: Cada empresa ve solo sus datos
- ✅ **Seguridad RLS**: Base de datos protegida automáticamente  
- ✅ **Multi-tenancy**: Soporte para múltiples empresas
- ✅ **Gestión de usuarios**: Roles y permisos granulares
- ✅ **UX moderna**: Interfaces de login/register profesionales

**¿Empezamos con el PASO 1 (Scripts SQL)?**
