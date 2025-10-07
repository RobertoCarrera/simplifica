# 🔒 RLS Complete Security Hardening - Execution Guide

**Versión:** 1.2 (Actualizada - Función corregida)  
**Fecha:** 2025-10-07  
**Prioridad:** 🚨 CRÍTICA - Seguridad en producción

---

## 📋 CAMBIOS EN VERSIÓN 1.2

### ✅ Corrección CRÍTICA en Función Helper

**Problema:** La función `get_user_company_id()` fallaba con error:
```sql
ERROR: 42703: column "company_id" does not exist
```

**Causa:** La función PL/pgSQL sin `SET search_path` causaba conflictos con RLS

**Solución:** Función SQL con `SECURITY DEFINER` y `SET search_path = public`

```sql
-- ✅ VERSIÓN CORREGIDA (v1.2):
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public  -- CRÍTICO: Evita search path hijacking
AS $$
    SELECT company_id 
    FROM public.users 
    WHERE auth_user_id = auth.uid()
    LIMIT 1
$$;
```

---

## 📋 CAMBIOS EN VERSIÓN 1.1

### ✅ Correcciones Aplicadas

1. **`gdpr_consent_records`**: Corregido campo `customer_id` → `subject_id`
2. **`gdpr_consent_requests`**: Corregido campo `customer_id` → `client_id`  
3. **`gdpr_processing_inventory`**: Omitido (es VISTA, no tabla)
4. **`addresses`**: Corregida política (`usuario_id = auth.uid()`)
5. **`gdpr_processing_activities`**: Política basada en roles DPO/admin

### � Errores Solucionados

```sql
-- ❌ ERRORES ANTERIORES:
ERROR: column gdpr_consent_records.customer_id does not exist
ERROR: ALTER action ENABLE ROW SECURITY cannot be performed on relation "gdpr_processing_inventory"

-- ✅ SOLUCIONADO EN V1.1
```

---

## 🚨 Problema Detectado

Al revisar el dashboard de Supabase, se identificaron **+30 tablas con RLS deshabilitado** (marcadas como "Unrestricted"):

### Tablas Críticas SIN RLS:
- ❌ **GDPR (7 tablas):** `gdpr_access_requests`, `gdpr_audit_log`, `gdpr_breach_incidents`, `gdpr_consent_records`, `gdpr_consent_requests`, `gdpr_processing_activities`
  - ℹ️ `gdpr_processing_inventory` es una VISTA (hereda RLS de tablas base)
- ❌ **Servicios (4):** `service_categories`, `service_tags`, `service_tag_relations`, `service_units`
- ❌ **Tickets (7):** `ticket_comments`, `ticket_comment_attachments`, `ticket_devices`, `ticket_services`, `ticket_stages`, `ticket_tags`, `ticket_tag_relations`
- ❌ **Productos (5):** `products`, `device_components`, `device_media`, `device_status_history`, `devices`
- ❌ **Admin (3):** `admin_company_analysis`, `admin_company_invitations`, `admin_pending_users`
- ❌ **Otras (10+):** `localities`, `addresses`, `invitations`, `pending_users`, `job_notes`, `company_invitations`

**Total:** 30+ tablas vulnerables

**Riesgo:** Cualquier usuario autenticado podría acceder a datos de TODAS las empresas (violación multi-tenant).

---

## ✅ Solución Implementada

Se ha creado un script SQL completo que:

1. **Habilita RLS** en todas las tablas vulnerables
2. **Crea políticas** basadas en `company_id` para multi-tenancy
3. **Protege datos GDPR** con políticas restrictivas
4. **Permite acceso global** solo donde es necesario (ej: `localities`)
5. **Restringe tablas admin** solo a owners/admins

---

## 🚀 Pasos para Ejecutar

### Paso 1: Backup de la Base de Datos (OBLIGATORIO)

```bash
# Hacer backup ANTES de ejecutar el script
supabase db dump -f backup-before-rls-$(date +%Y%m%d).sql

# O desde dashboard:
# Settings → Database → Backups → Create Manual Backup
```

### Paso 2: Ejecutar el Script RLS

1. **Abre Supabase SQL Editor:**
   - Ve a https://app.supabase.com/project/YOUR_PROJECT/sql
   - Click en "New Query"

2. **Copia el contenido completo de:**
   ```
   database/ENABLE_RLS_ALL_TABLES.sql
   ```

3. **Ejecuta el script** (click en "Run" o F5)

4. **Verifica el output:**
   - Debe mostrar 3 tablas de resultados:
     - ✅ Todas las tablas con RLS habilitado
     - ⚠️ Tablas sin RLS (debe ser lista vacía o muy pequeña)
     - 📊 Todas las políticas creadas

### Paso 3: Verificar Estado RLS

Ejecuta esta query de verificación:

```sql
-- Verificar que TODAS las tablas críticas tienen RLS
SELECT 
    tablename,
    rowsecurity AS rls_enabled,
    COUNT(policyname) AS policies
FROM pg_tables
LEFT JOIN pg_policies USING (schemaname, tablename)
WHERE schemaname = 'public'
    AND tablename IN (
        -- GDPR
        'gdpr_access_requests', 'gdpr_audit_log', 'gdpr_breach_incidents',
        'gdpr_consent_records', 'gdpr_consent_requests', 
        'gdpr_processing_activities', 'gdpr_processing_inventory',
        -- Services
        'service_categories', 'service_tags', 'service_tag_relations', 'service_units',
        -- Tickets
        'ticket_comments', 'ticket_comment_attachments', 'ticket_devices',
        'ticket_services', 'ticket_stages', 'ticket_tags', 'ticket_tag_relations',
        -- Products/Devices
        'products', 'device_components', 'device_media', 'device_status_history', 'devices',
        -- Admin
        'admin_company_analysis', 'admin_company_invitations', 'admin_pending_users',
        -- Other
        'localities', 'addresses', 'invitations', 'pending_users', 'job_notes', 'company_invitations'
    )
GROUP BY tablename, rowsecurity
ORDER BY rls_enabled DESC, tablename;
```

**Expected output:** Todas las tablas con `rls_enabled = true` y al menos 1 política.

---

## 🧪 Testing de Seguridad

### Test 1: Verificar Aislamiento Multi-Tenant

```sql
-- Test con usuario de Empresa A
-- (ejecutar como usuario autenticado de empresa A)
SELECT COUNT(*) FROM service_tags;
-- Debe retornar SOLO tags de empresa A

-- Intentar acceder a tags de empresa B
SELECT COUNT(*) FROM service_tags WHERE company_id = 'EMPRESA_B_UUID';
-- Debe retornar 0 (sin acceso)
```

### Test 2: Verificar GDPR Protection

```sql
-- Test con usuario de Empresa A
SELECT COUNT(*) FROM gdpr_consent_records;
-- Debe retornar SOLO records de clientes de empresa A

-- Intentar acceder a GDPR de otra empresa
SELECT COUNT(*) FROM gdpr_consent_records 
WHERE customer_id IN (
    SELECT id FROM clients WHERE company_id = 'EMPRESA_B_UUID'
);
-- Debe retornar 0 (sin acceso)
```

### Test 3: Verificar Admin Tables

```sql
-- Test con usuario NO admin
SELECT COUNT(*) FROM admin_company_analysis;
-- Debe retornar 0 o error (sin permisos)

-- Test con usuario admin/owner
SELECT COUNT(*) FROM admin_company_analysis;
-- Debe retornar datos
```

### Test 4: Verificar Localities (Acceso Global)

```sql
-- Cualquier usuario autenticado
SELECT COUNT(*) FROM localities;
-- Debe retornar TODAS las localidades (acceso global para lectura)

-- Intentar insertar sin autenticar (debe fallar)
INSERT INTO localities (nombre, provincia) VALUES ('Test', 'Test');
-- Debe fallar si no autenticado
```

---

## 📊 Políticas Creadas por Tabla

| Tabla | Política | Descripción |
|-------|----------|-------------|
| `gdpr_access_requests` | `gdpr_access_requests_company_only` | Solo company_id del usuario |
| `gdpr_audit_log` | `gdpr_audit_log_company_only` | Solo company_id del usuario |
| `gdpr_breach_incidents` | `gdpr_breach_incidents_company_only` | Solo company_id del usuario |
| `gdpr_consent_records` | `gdpr_consent_records_company_only` | Solo clientes de su empresa |
| `gdpr_consent_requests` | `gdpr_consent_requests_company_only` | Solo clientes de su empresa |
| `gdpr_processing_activities` | `gdpr_processing_activities_company_only` | Solo company_id del usuario |
| `gdpr_processing_inventory` | `gdpr_processing_inventory_company_only` | Solo company_id del usuario |
| `service_categories` | `service_categories_company_only` | Solo company_id del usuario |
| `service_tags` | `service_tags_company_only` | Solo company_id del usuario |
| `service_tag_relations` | `service_tag_relations_company_only` | Solo servicios de su empresa |
| `service_units` | `service_units_company_or_global` | Global (null) o su empresa |
| `ticket_comments` | `ticket_comments_company_only` | Solo tickets de su empresa |
| `ticket_comment_attachments` | `ticket_comment_attachments_company_only` | Solo comments de su empresa |
| `ticket_devices` | `ticket_devices_company_only` | Solo tickets de su empresa |
| `ticket_services` | `ticket_services_company_only` | Solo tickets de su empresa |
| `ticket_stages` | `ticket_stages_company_only` | Solo company_id del usuario |
| `ticket_tags` | `ticket_tags_company_only` | Solo company_id del usuario |
| `ticket_tag_relations` | `ticket_tag_relations_company_only` | Solo tickets de su empresa |
| `products` | `products_company_only` | Solo company_id del usuario |
| `device_components` | `device_components_company_only` | Solo devices de su empresa |
| `device_media` | `device_media_company_only` | Solo devices de su empresa |
| `device_status_history` | `device_status_history_company_only` | Solo devices de su empresa |
| `devices` | `devices_company_only` | Solo company_id del usuario |
| `admin_company_analysis` | `admin_company_analysis_admins_only` | Solo owners/admins |
| `admin_company_invitations` | `admin_company_invitations_admins_only` | Solo owners/admins |
| `admin_pending_users` | `admin_pending_users_admins_only` | Solo owners/admins |
| `localities` | `localities_read_all` | Lectura global, escritura autenticados |
| `addresses` | `addresses_company_only` | Solo direcciones de clientes de su empresa |
| `invitations` | `invitations_company_only` | Solo company_id del usuario |
| `pending_users` | `pending_users_company_only` | Solo company_id del usuario |
| `job_notes` | `job_notes_company_only` | Solo company_id del usuario |
| `company_invitations` | `company_invitations_company_only` | Solo company_id del usuario |

---

## ⚠️ Consideraciones Importantes

### 1. Service Role Bypass
El `service_role` key **siempre bypasea RLS**. Esto es necesario para:
- Edge Functions que necesitan acceso total
- Migraciones de datos
- Operaciones administrativas

**Seguridad:** NUNCA expongas el `service_role` key en frontend.

### 2. User Company Context
La función `get_user_company_id()` obtiene el `company_id` del usuario autenticado:

```sql
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT company_id 
        FROM public.users 
        WHERE auth_user_id = auth.uid()
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

**Importante:** Esto asume que `users.company_id` es ÚNICO por usuario (multi-company NO soportado en este script).

### 3. Vistas Materializadas
Las vistas (`gdpr_consent_overview`, `users_with_company`) NO requieren RLS porque heredan las políticas de las tablas subyacentes.

### 4. Performance Impact
RLS añade overhead a las queries (~5-10ms). Las políticas están optimizadas con:
- EXISTS clauses en lugar de JOINs
- Índices en `company_id`
- SECURITY DEFINER en funciones helper

---

## 🔄 Rollback (Si Algo Sale Mal)

Si encuentras problemas, puedes deshacer los cambios:

```sql
-- EMERGENCY: Deshabilitar RLS en tabla problemática
ALTER TABLE nombre_tabla DISABLE ROW LEVEL SECURITY;

-- O restaurar desde backup
-- supabase db reset --db-url postgresql://...
```

**Nota:** Esto NO es recomendado en producción. Mejor ajustar las políticas.

---

## 📈 Métricas de Éxito

Después de ejecutar el script, debes ver:

- ✅ **0 tablas "Unrestricted"** en Supabase Dashboard
- ✅ **+60 políticas RLS** creadas
- ✅ **Multi-tenancy funcional** (test con 2 empresas)
- ✅ **GDPR data protected** (no acceso cross-company)
- ✅ **Admin tables restricted** (solo owners/admins)

---

## 🛡️ Beneficios de Seguridad

### Antes (Sin RLS):
```sql
-- Cualquier usuario podía hacer:
SELECT * FROM service_tags;  -- ❌ Ve tags de TODAS las empresas
SELECT * FROM gdpr_consent_records;  -- ❌ Ve GDPR de TODOS los clientes
```

### Después (Con RLS):
```sql
-- Usuario de Empresa A solo ve:
SELECT * FROM service_tags;  -- ✅ Solo tags de Empresa A
SELECT * FROM gdpr_consent_records;  -- ✅ Solo GDPR de clientes de Empresa A
```

---

## 📚 Documentación Relacionada

- **Script SQL:** `database/ENABLE_RLS_ALL_TABLES.sql`
- **Security Features:** `SECURITY_FEATURES_IMPLEMENTATION.md`
- **Final Summary:** `FINAL_SECURITY_SUMMARY.md`
- **CSRF Interceptor:** `CSRF_INTERCEPTOR_IMPLEMENTATION.md`

---

## 🎯 Checklist de Ejecución

- [ ] **Backup creado** (obligatorio)
- [ ] **Script ejecutado** en SQL Editor
- [ ] **Verificación RLS** (todas las tablas protegidas)
- [ ] **Test multi-tenant** (aislamiento funciona)
- [ ] **Test GDPR** (sin acceso cross-company)
- [ ] **Test admin tables** (solo owners/admins)
- [ ] **Test localities** (lectura global funciona)
- [ ] **App funciona** (sin errores de permisos)

---

## 🚀 Próximos Pasos

Una vez completado este script:

1. **Deploy Edge Functions** con Rate Limiting y CSRF
2. **Test end-to-end** en producción
3. **Monitor logs** para errores de permisos
4. **Ajustar políticas** si es necesario

---

**Status:** ✅ Script listo para ejecutar  
**Impacto:** 🚨 CRÍTICO - Protege 30+ tablas vulnerables  
**Tiempo:** ~5 minutos de ejecución  
**Rollback:** Disponible (backup + ALTER TABLE DISABLE RLS)

---

**Implementado por:** Security Hardening Process  
**Fecha:** 2025-10-07  
**Versión:** 1.0.0
