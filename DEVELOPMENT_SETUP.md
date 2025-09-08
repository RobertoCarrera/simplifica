# 🚀 Simplifica - Setup del Proyecto

## 📋 Configuración Inicial

### 1. Instalación de Dependencias
```bash
npm install
# o
bun install
```

### 2. Configuración de Supabase

#### A. Ejecutar el Schema Principal
1. Ve a tu panel de Supabase (https://app.supabase.com)
2. Selecciona tu proyecto
3. Ve a **"SQL Editor"**
4. Ejecuta el archivo `supabase-schema.sql`

#### B. Ejecutar las Funciones RPC (Para Desarrollo)
1. En el mismo SQL Editor de Supabase
2. Ejecuta el archivo `SETUP_SUPABASE_RPC_FUNCTIONS.sql`
3. Estas funciones permiten el desarrollo sin autenticación

### 3. Variables de Entorno
Configura tu archivo `src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  supabase: {
    url: 'TU_SUPABASE_URL',
    anonKey: 'TU_SUPABASE_ANON_KEY'
  }
};
```

## 🔧 Modo Desarrollo

### Características Activas
- ✅ **Selector de Usuario DEV**: Permite cambiar entre usuarios sin autenticación
- ✅ **Funciones RPC**: Bypassean RLS para desarrollo
- ✅ **Logs Detallados**: Información completa en consola
- ✅ **Testing**: Botón de diagnóstico disponible

### Usuarios de Prueba Disponibles
- **Alberto Dominguez** (alberto@satpcgo.es)
- **Eva Marín** (eva@michinanny.es)
- **Marina Casado García** (marina@michinanny.es)
- **Vanesa Santa Maria Garibaldi** (vanesa@liberatuscreencias.com)
- **Admin Demo 1** (admin@demo1.com)
- **Admin Demo 2** (admin@demo2.com)

## 🚀 Modo Producción

### Transición Automática
La aplicación detecta automáticamente si está en producción basándose en:
- `window.location.hostname !== 'localhost'`

### Cambios Automáticos en Producción
- ❌ **Selector de Usuario DEV**: Se oculta completamente
- ❌ **Funciones RPC**: Se usan consultas normales con autenticación
- ❌ **Logs Detallados**: Se reducen a mínimos
- ✅ **RLS Normal**: Funciona con `auth.uid()` real

### Configuración Manual (Opcional)
Si necesitas forzar un modo específico, edita `src/app/config/supabase.config.ts`:
```typescript
export function getCurrentSupabaseConfig(): SupabaseConfig {
  // Para forzar producción:
  return supabaseConfigs.production;
  
  // Para forzar desarrollo:
  return supabaseConfigs.development;
}
```

## 🔍 Testing y Diagnóstico

### En Desarrollo
1. **Selector de Usuario**: Cambia entre usuarios para probar datos específicos
2. **Botón Test**: Ejecuta diagnósticos de RPC y consultas
3. **Logs**: Revisa la consola para información detallada

### Verificación de Setup
```typescript
// En la consola del navegador, verifica:
console.log('Config actual:', getCurrentSupabaseConfig());

// Test manual de RPC:
// (En SQL Editor de Supabase)
SELECT * FROM get_customers_dev('1e816ec8-4a5d-4e43-806a-6c7cf2ec6950');
```

## 🗂️ Estructura del Proyecto

```
src/
├── app/
│   ├── components/
│   │   ├── dev-user-selector/         # Selector DEV
│   │   └── dashboard-customers/       # Dashboard principal
│   ├── config/
│   │   └── supabase.config.ts         # Configuración dev/prod
│   ├── models/
│   │   └── customer.ts                # Modelos de datos
│   └── services/
│       └── supabase-customers.service.ts  # Service principal
├── SETUP_SUPABASE_RPC_FUNCTIONS.sql   # Funciones para desarrollo
├── supabase-schema.sql                # Schema principal
└── PRODUCTION_SETUP_GUIDE.md         # Guía de producción
```

## 🎯 Comandos Útiles

```bash
# Desarrollo
ng serve
# o
npm start

# Build para producción
ng build --configuration production

# Testing
ng test

# Verificar configuración actual
# (En DevTools console)
getCurrentSupabaseConfig()
```

## 🔒 Seguridad

### Desarrollo
- Las funciones RPC usan `SECURITY DEFINER` para bypassear RLS
- Solo disponibles en modo desarrollo
- Mantienen separación de datos por usuario

### Producción
- RLS activo con políticas normales
- Autenticación real con Supabase Auth
- Sin funciones RPC expuestas

## 🐛 Troubleshooting

### Problema: "No se muestran clientes"
1. Verifica que las funciones RPC estén instaladas en Supabase
2. Selecciona un usuario en el selector DEV
3. Usa el botón "Test" para diagnóstico

### Problema: "Errors de RLS"
1. Confirma que estás en modo desarrollo
2. Verifica que el usuario seleccionado tenga clientes
3. Revisa los logs en consola

### Problema: "Selector DEV no aparece"
1. Verifica que estés en localhost
2. Confirma la configuración en `supabase.config.ts`
3. Refresca la página

---

**¡Listo para desarrollar! 🚀**

Para cualquier duda, revisa los logs en consola o usa el botón de diagnóstico en modo desarrollo.
