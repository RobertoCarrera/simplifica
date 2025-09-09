# 🔐 (DEPRECADO) Guía Antigua Autenticación Multi-Tenant

> ESTA GUÍA QUEDA DEPRECADA.
>
> El proyecto ahora usa un modelo simplificado descrito en `README.md` (sección "Autenticación (Arquitectura Minimalista Actual)").
>
> Ya no se usa la tabla `user_profiles` ni triggers automáticos. Mantengo este archivo sólo como referencia histórica hasta completar limpieza final.

## 📋 (Histórico) Resumen original

### ✅ **COMPONENTES CREADOS**

1. (Antiguo) **Base de Datos** (`database/auth-multitenant-setup.sql`)
   - Tablas: companies, user_profiles, invitations (YA NO RECOMENDADO)
   - RLS más complejo y mayor superficie de fallo
   - Reemplazado por `database/base-auth-structure.sql`

2. **Servicios**
   - `AuthService` - Gestión completa de autenticación
   - Guards: AuthGuard, AdminGuard, GuestGuard
   - Integración con Supabase Auth

3. **Componentes UI**
   - LoginComponent - Login moderno y responsivo
   - RegisterComponent - Registro con creación de empresa
   - Formularios reactivos con validación

4. **Rutas Protegidas**
   - Todas las rutas principales protegidas con AuthGuard
   - Rutas administrativas con AdminGuard
   - Redirección automática según estado de autenticación

## 🚀 (Histórico) Pasos anteriores

### **PASO 1: Ejecutar SQL en Supabase**

```sql
-- Ejecutar en Supabase SQL Editor
-- El archivo: database/auth-multitenant-setup.sql
```

### **PASO 2: Instalar Dependencia de Supabase**

```bash
npm install @supabase/supabase-js
```

### **PASO 3: Configurar Variables de Entorno**

Verificar que `src/environments/environment.ts` tenga:

```typescript
export const environment = {
  production: false,
  supabase: {
    url: 'TU_SUPABASE_URL',
    anonKey: 'TU_SUPABASE_ANON_KEY'
  }
};
```

### **PASO 4: Actualizar Servicios Existentes**

Los servicios de customers, tickets y services necesitan ser actualizados para usar multi-tenancy:

```typescript
// En cada servicio, añadir filtro por company_id
.eq('company_id', this.authService.companyId())
```

### **PASO 5: Actualizar App Component**

Añadir inicialización de autenticación:

```typescript
// En app.component.ts
constructor(private authService: AuthService) {
  // La inicialización se hace automáticamente
}
```

## 🔄 (Histórico) Flujo de autenticación

### **Registro de Nueva Empresa**
1. Usuario se registra con "Crear nueva empresa"
2. Se crea cuenta de usuario en auth.users
3. Se crea empresa en tabla companies
4. Se vincula usuario como admin de la empresa
5. Email de confirmación enviado

### **Login Existente**
1. Usuario ingresa credenciales
2. AuthService valida con Supabase
3. Se cargan datos del perfil y empresa
4. Se establece contexto de multi-tenancy
5. Redirección a dashboard

### **Protección de Datos**
- RLS automático filtra por company_id
- Cada consulta limitada a datos de la empresa del usuario
- Roles granulares: admin, manager, user, viewer

## 🎯 (Histórico) Características principales

### **🏢 Multi-Tenancy Completo**
- Cada empresa tiene sus propios datos aislados
- Usuarios solo ven datos de su empresa
- Administradores pueden gestionar su equipo

### **🔒 Seguridad Robusta**
- Row Level Security en base de datos
- Validación de permisos en frontend y backend
- Tokens JWT seguros de Supabase

### **👥 Gestión de Equipos**
- Sistema de invitaciones por email
- Roles jerárquicos con permisos granulares
- Gestión de usuarios por empresa

### **📱 UX Moderna**
- Interfaces responsive y modernas
- Validación en tiempo real
- Feedback claro al usuario
- Loading states y error handling

## ⚡ (Histórico) Beneficios inmediatos

1. **Seguridad**: Datos completamente aislados por empresa
2. **Escalabilidad**: Soporte para múltiples empresas
3. **Gestión**: Admin completo de usuarios y permisos
4. **UX**: Interfaz moderna y profesional
5. **Mantenimiento**: Código limpio y bien estructurado

## 🔧 (Histórico) Próximos pasos recomendados

1. **Ejecutar el SQL** en Supabase
2. **Instalar dependencias** de Supabase
3. **Actualizar servicios** para multi-tenancy
4. **Probar el flujo** completo de registro/login
5. **Configurar invitaciones** de usuarios

Para la versión actual: revisar `README.md` y eliminar dependencias residuales antes de evolucionar invitaciones.
