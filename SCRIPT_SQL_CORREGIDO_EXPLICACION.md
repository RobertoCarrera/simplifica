# ✅ Script SQL Corregido - Análisis de Cambios

## 🔧 **Correcciones Realizadas**

### **Archivo Nuevo:** `fix-addresses-rls-CORREGIDO.sql`

---

## ❌ **Errores en el Script Original**

### 1. **Tabla `user_companies` no existe**

**Error original:**
```sql
SELECT uc.company_id 
FROM user_companies uc  -- ❌ Esta tabla NO existe
WHERE uc.user_id = a.usuario_id
```

**Corrección:**
```sql
SELECT u.company_id 
FROM public.users u    -- ✅ Tabla correcta
WHERE u.auth_user_id = a.usuario_id  -- ✅ Relación correcta
```

**Explicación:**
- `addresses.usuario_id` → FK a `auth.users(id)`
- `public.users.auth_user_id` → FK a `auth.users(id)`
- Por lo tanto: `public.users.auth_user_id = addresses.usuario_id`

---

### 2. **Columna `company_id` YA EXISTE en `addresses`**

Según el schema:
```sql
CREATE TABLE public.addresses (
  ...
  company_id uuid,  -- ✅ YA EXISTE
  CONSTRAINT addresses_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
```

**Implicación:**
- No necesitamos crear la columna
- Solo necesitamos **POBLARLA** con datos correctos
- La foreign key ya está configurada

---

### 3. **Verificación Mejorada**

**Script original:**
```sql
RAISE NOTICE '✅ Addresses con company_id: %', updated_count;
```

**Script corregido:**
```sql
RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
RAISE NOTICE '📊 MIGRACIÓN DE DATOS COMPLETADA';
RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
RAISE NOTICE '  Total addresses:           %', total_count;
RAISE NOTICE '  ✅ Con company_id:         %', updated_count;
RAISE NOTICE '  ⚠️  Sin company_id:        %', null_count;
```

---

## 📊 **Estructura de Relaciones (Basada en Schema Real)**

```
┌─────────────────────┐
│   auth.users        │
│   ├─ id (PK)        │
└─────────────────────┘
         ↑
         │ FK
         │
┌────────┴────────────┐         ┌─────────────────────┐
│ addresses           │         │  public.users       │
│ ├─ usuario_id (FK)  │         │  ├─ auth_user_id    │←──┐
│ ├─ company_id       │         │  ├─ company_id      │   │
└─────────────────────┘         └─────────────────────┘   │
         │                               ↑                  │
         │                               │                  │
         │ FK                            │ FK               │
         ↓                               │                  │
┌─────────────────────┐                 │                  │
│  companies          │─────────────────┘                  │
│  ├─ id (PK)         │                                    │
└─────────────────────┘                                    │
                                                            │
┌─────────────────────┐                                    │
│  clients            │                                    │
│  ├─ direccion_id ──────→ addresses.id                   │
│  ├─ company_id      │                                    │
└─────────────────────┘                                    │
                                                            │
RELACIÓN CLAVE:                                             │
addresses.usuario_id = auth.users.id ═══════════════════════┘
public.users.auth_user_id = auth.users.id
                           
POR LO TANTO:
addresses.usuario_id = public.users.auth_user_id
```

---

## ✅ **Cambios Principales del Script Corregido**

### 1. **UPDATE Corregido**

```sql
UPDATE addresses a
SET company_id = (
  SELECT u.company_id 
  FROM public.users u 
  WHERE u.auth_user_id = a.usuario_id  -- ✅ Relación correcta
  LIMIT 1
)
WHERE a.company_id IS NULL 
  AND a.usuario_id IS NOT NULL;
```

### 2. **Eliminado paso de crear columna**

Ya que `company_id` ya existe, se elimina:
```sql
-- ❌ ELIMINADO - Ya existe
-- ALTER TABLE addresses ADD COLUMN company_id UUID;
```

### 3. **Verificaciones Mejoradas**

- Muestra addresses sin `company_id` con detalles
- Genera query de test automática con un `company_id` real
- Resumen visual con separadores

### 4. **Tests de Integración**

```sql
-- Verifica que el JOIN funciona
SELECT c.*, a.*
FROM clients c
LEFT JOIN addresses a ON c.direccion_id = a.id
WHERE c.company_id = 'xxx'
```

---

## 🚀 **Cómo Usar el Script Corregido**

### Paso 1: Backup
```
Supabase → Database → Backups → Create Backup
```

### Paso 2: Ejecutar Script
```
Supabase → SQL Editor
Pegar contenido de: fix-addresses-rls-CORREGIDO.sql
Ejecutar TODO de golpe
```

### Paso 3: Verificar Output

Deberías ver algo como:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 MIGRACIÓN DE DATOS COMPLETADA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total addresses:           7
  ✅ Con company_id:         7
  ⚠️  Sin company_id:        0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Paso 4: Probar Consulta

El script te mostrará una query de test:

```sql
SELECT c.id, c.name, c.email, a.direccion, a.locality_id
FROM clients c
LEFT JOIN addresses a ON c.direccion_id = a.id
WHERE c.company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
  AND c.deleted_at IS NULL
LIMIT 5;
```

**Resultado esperado:** Devuelve datos sin error 400

---

## 📋 **Checklist Post-Ejecución**

- [ ] Backup creado
- [ ] Script ejecutado sin errores
- [ ] Todas las addresses tienen `company_id`
- [ ] Políticas RLS creadas (4 nuevas)
- [ ] Índices creados (2 nuevos)
- [ ] Query de test ejecutada con éxito
- [ ] Error 400 desaparece en Angular

---

## 🔍 **Troubleshooting**

### Si hay addresses sin `company_id`:

```sql
-- Ver cuáles son
SELECT 
  a.id,
  a.usuario_id,
  a.direccion,
  a.created_at,
  u.email as user_email,
  u.company_id as user_company
FROM addresses a
LEFT JOIN public.users u ON u.auth_user_id = a.usuario_id
WHERE a.company_id IS NULL;
```

**Posibles causas:**
1. `usuario_id` no existe en `public.users`
2. Usuario no tiene `company_id` asignada
3. `usuario_id` apunta a un usuario borrado

**Solución:**
```sql
-- Asignar company_id manualmente
UPDATE addresses
SET company_id = 'TU-COMPANY-ID-AQUI'
WHERE id = 'ID-DEL-ADDRESS-PROBLEMATICO';
```

### Si el error 400 persiste:

1. Verificar que `get_user_company_id()` funciona:
```sql
SELECT get_user_company_id();
```

2. Verificar que usuario actual tiene company:
```sql
SELECT u.*, auth.uid()
FROM public.users u
WHERE u.auth_user_id = auth.uid();
```

3. Limpiar caché de Supabase:
```sql
NOTIFY pgrst, 'reload schema';
```

---

## 📊 **Comparación: Antes vs Después**

### ANTES (Error 400):
```
clients (RLS: company_id ✅)
    └─ JOIN addresses (RLS: usuario_id ❌)
       └─ POLICY RECHAZA → ERROR 400
```

### DESPUÉS (Funciona):
```
clients (RLS: company_id ✅)
    └─ JOIN addresses (RLS: company_id ✅)
       └─ POLICY ACEPTA → SUCCESS 200
```

---

## ✅ **Resultado Final Esperado**

```json
{
  "total_addresses": 7,
  "addresses_con_company": 7,
  "addresses_sin_company": 0,
  "policies_nuevas": 4,
  "indices_nuevos": 2,
  "error_400": "RESUELTO ✅"
}
```

---

**Última actualización:** 15 de octubre de 2025  
**Versión:** 2.0 (Corregida basada en schema real)  
**Estado:** ✅ Listo para ejecutar
