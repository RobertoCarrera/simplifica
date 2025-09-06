# 🚀 INSTRUCCIONES FINALES DE SETUP

## ✅ **COMPLETADO:**
- ✅ Instalación de @supabase/supabase-js
- ✅ Servicios multi-tenant creados
- ✅ Componente actualizado con ejemplo
- ✅ Configuración de environment

---

## 🔧 **FALTA POR HACER:**

### **1. CONFIGURAR CREDENCIALES DE SUPABASE**
```typescript
// Editar: src/environments/environment.ts
export const environment = {
  production: false,
  supabase: {
    url: 'TU_URL_AQUÍ',     // https://xxxxx.supabase.co
    anonKey: 'TU_KEY_AQUÍ'  // anon key de tu proyecto
  }
};
```

**Dónde obtener las credenciales:**
1. Ve a https://app.supabase.com
2. Selecciona tu proyecto
3. Ve a Settings → API
4. Copia URL y anon key

### **2. EJECUTAR SCRIPT DE STORAGE**
1. Ve a tu proyecto Supabase → SQL Editor
2. Copia y pega TODO el contenido de: `database/03-setup-storage.sql`
3. Ejecuta el script

### **3. CREAR BUCKET DE STORAGE**
1. Ve a Supabase → Storage
2. Create Bucket → Name: `attachments`
3. NO marcar como público

### **4. CONFIGURAR CONTEXTO DE EMPRESA**
```typescript
// En app.component.ts o donde manejes la autenticación:
constructor(private companyService: CompanyMultiTenantService) {}

async ngOnInit() {
  // Establecer contexto de empresa (usar una empresa existente)
  await this.companyService.switchToCompany('00000000-0000-4000-8000-000000000001');
}
```

---

## 📋 **PROBAR EL SISTEMA:**

### **1. Ver clientes multi-tenant:**
- Ve a tu componente de clientes
- Cambia a la pestaña "Clientes Multi-Tenant"
- Deberías ver los clientes de prueba

### **2. Crear nuevo cliente:**
- Clic en "Nuevo Cliente" en la pestaña multi-tenant
- Se crea automáticamente para la empresa actual

### **3. Eliminar cliente:**
- Clic en "Eliminar" en cualquier cliente
- Soft delete (no se borra, se marca deleted_at)

---

## 🎯 **ARCHIVOS CREADOS/ACTUALIZADOS:**

### **Servicios nuevos:**
- `src/app/services/supabase.service.ts` → Base de Supabase
- `src/app/services/clients-multi-tenant.service.ts` → Clientes
- `src/app/services/jobs-multi-tenant.service.ts` → Trabajos + archivos
- `src/app/services/company-multi-tenant.service.ts` → Empresas
- `src/app/services/services-multi-tenant.service.ts` → Servicios del CRM

### **Configuración:**
- `src/environments/environment.ts` → Credenciales Supabase
- `src/environments/environment.prod.ts` → Credenciales producción

### **Componente actualizado:**
- `src/app/components/dashboard-customers/` → Ejemplo con pestañas

### **Database:**
- `database/03-setup-storage.sql` → Script de archivos adjuntos

---

## 🚨 **POSIBLES ERRORES:**

### **Error: "function does not exist"**
→ No has ejecutado los scripts de base de datos

### **Error: "Invalid API key"**
→ Credenciales incorrectas en environment.ts

### **Error: "No company context set"**
→ No has establecido contexto de empresa

### **Error: "Table does not exist"**
→ No has ejecutado el script inicial (01-setup-multitenant.sql)

---

## ⚡ **SIGUIENTE NIVEL:**

Una vez que funcione básico, puedes:

1. **Migrar más componentes** a los servicios multi-tenant
2. **Crear selector de empresa** en el header
3. **Añadir gestión de usuarios** por empresa
4. **Implementar subida de archivos** en trabajos
5. **Crear dashboard** con estadísticas
6. **Añadir realtime** para cambios en vivo

---

## 🎪 **COMANDOS RÁPIDOS:**

```bash
# Instalar dependencias (ya hecho)
npm install @supabase/supabase-js

# Ejecutar app
npm start

# Verificar errores
npm run build
```

---

**¿Algún paso no funciona?** Revisa:
1. Credenciales correctas ✅
2. Scripts ejecutados ✅  
3. Contexto de empresa establecido ✅
4. No errores de TypeScript ✅
