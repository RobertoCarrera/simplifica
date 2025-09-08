# 🔧 Configuración Rápida de Supabase para Clientes

## 📋 Checklist de Configuración

### ✅ **Paso 1: Verificar Credenciales** (Ya configurado)
- [x] URL de Supabase: `https://ufutyjbqfjrlzkprvyvs.supabase.co`
- [x] Anon Key: Configurada en `environment.ts`
- [x] Paquete instalado: `@supabase/supabase-js`

### ⚠️ **Paso 2: Configurar Base de Datos** (REQUERIDO)

#### **Opción A: Configuración Automática (Recomendada)**
```sql
1. Ve a: https://app.supabase.com/project/ufutyjbqfjrlzkprvyvs/sql
2. Copia TODO el contenido del archivo: supabase-schema.sql
3. Pégalo en el SQL Editor de Supabase
4. Haz clic en "Run" (▶️)
5. ¡Listo! Todas las tablas y políticas se crean automáticamente
```

#### **Opción B: Configuración Manual**
```sql
-- 1. Crear tabla customers
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    nombre VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    dni VARCHAR(20) UNIQUE,
    fecha_nacimiento DATE,
    email VARCHAR(255) NOT NULL UNIQUE,
    telefono VARCHAR(20),
    profesion VARCHAR(100),
    empresa VARCHAR(100),
    notas TEXT,
    activo BOOLEAN DEFAULT true,
    avatar_url TEXT,
    direccion_id UUID REFERENCES public.addresses(id),
    usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 2. Habilitar RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas de seguridad
CREATE POLICY "Users can view own customers" ON public.customers
    FOR SELECT USING (auth.uid() = usuario_id);

CREATE POLICY "Users can insert own customers" ON public.customers
    FOR INSERT WITH CHECK (auth.uid() = usuario_id);

-- 4. Crear bucket para avatares
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-avatars', 'customer-avatars', true)
ON CONFLICT (id) DO NOTHING;
```

### ✅ **Paso 3: Verificar Configuración**

#### **En Supabase Dashboard:**
1. **Table Editor** → Verificar que existe tabla `customers`
2. **Authentication** → RLS habilitado
3. **Storage** → Bucket `customer-avatars` creado
4. **SQL Editor** → Sin errores en ejecución

#### **En la Aplicación:**
1. Ir a: `http://localhost:4200/clientes`
2. Intentar crear un cliente
3. Si funciona → ✅ Configuración correcta
4. Si da error → ⚠️ Revisar pasos anteriores

---

## 🚨 Solución de Problemas Comunes

### **Error: "Failed to connect to Supabase"**
```bash
❌ Problema: Credenciales incorrectas
✅ Solución: Verificar URL y anon key en environment.ts
```

### **Error: "Row Level Security violation"**
```bash
❌ Problema: Políticas no configuradas
✅ Solución: Ejecutar supabase-schema.sql completo
```

### **Error: "Storage bucket not found"**
```bash
❌ Problema: Bucket de avatares no creado
✅ Solución: Crear bucket manualmente en Storage → New bucket → "customer-avatars"
```

### **Error: "Cannot read properties of undefined"**
```bash
❌ Problema: Usuario no autenticado
✅ Solución: Por ahora el sistema funciona sin auth (para pruebas)
```

---

## 🔄 Estados de Configuración

### 🟢 **LISTO PARA USAR**
- Supabase conectado
- Tablas creadas
- Políticas configuradas
- Storage funcionando
- App compilando sin errores

### 🟡 **PARCIALMENTE CONFIGURADO**
- Credenciales configuradas
- Falta ejecutar schema SQL
- Necesita configuración de tablas

### 🔴 **REQUIERE CONFIGURACIÓN**
- Credenciales no configuradas
- Base de datos no inicializada
- Storage no configurado

---

## 📞 Testing Rápido

### **Test 1: Conexión Básica**
```typescript
// Abrir Developer Tools (F12) en http://localhost:4200/clientes
// Si no hay errores de conexión → ✅ Supabase conectado
```

### **Test 2: Crear Cliente**
```bash
1. Clic en "Nuevo Cliente"
2. Llenar formulario básico:
   - Nombre: Test
   - Apellidos: Usuario
   - Email: test@example.com
3. Guardar
4. Si aparece en la lista → ✅ CRUD funcionando
```

### **Test 3: Upload Avatar**
```bash
1. Editar cliente creado
2. Subir imagen de avatar
3. Si la imagen se muestra → ✅ Storage funcionando
```

---

## 🎯 Resultado Esperado

### **Dashboard de Clientes Funcional:**
- ✅ Lista de clientes (inicialmente vacía)
- ✅ Botón "Nuevo Cliente" funcionando
- ✅ Estadísticas actualizándose
- ✅ Búsqueda en tiempo real
- ✅ Filtros operativos
- ✅ Import/Export CSV

### **Sin Errores en Consola:**
- ✅ No errores de Supabase
- ✅ No errores de compilación
- ✅ No errores de autenticación (para pruebas)

---

## 🚀 Siguiente Fase

Una vez que el módulo de Clientes esté 100% funcional:

1. **Testing completo** de todas las funcionalidades
2. **Optimización** de rendimiento
3. **Módulo de Productos** con la misma integración
4. **Sistema de Tickets/Órdenes** conectado a clientes
5. **Dashboard consolidado** con métricas generales

---

*📝 Nota: Este archivo sirve como guía rápida. Para detalles completos, consulta `CLIENTES_SUPABASE_README.md`*
