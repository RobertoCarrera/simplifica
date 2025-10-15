# ANÁLISIS DE ERRORES DE SEGURIDAD - SUPABASE SECURITY ADVISOR

## 🚨 Resumen Ejecutivo

**Total de Errores**: 8 errores críticos de seguridad  
**Nivel**: ERROR (CRÍTICO)  
**Categoría**: SECURITY  

---

## 📊 Errores Detectados

### **Error Tipo 1: `auth_users_exposed`** (1 error - CRÍTICO ⚠️)

**Vista Afectada**: `admin_pending_users`

**Problema**:
- La vista hace `LEFT JOIN` con `auth.users` 
- Expone datos sensibles de autenticación al rol `anon` (no autenticado)
- Riesgo: Filtración de información de usuarios (emails confirmados, fechas de registro)

**Solución**:
1. **Opción A (RECOMENDADA)**: Eliminar el `LEFT JOIN auth.users` y usar solo datos de `pending_users`
2. **Opción B**: Añadir RLS a la vista para restringir acceso solo a admins/owners
3. **Opción C**: Mover vista a schema privado no expuesto a PostgREST

---

### **Error Tipo 2: `security_definer_view`** (7 errores - ALTO RIESGO ⚠️)

**Vistas Afectadas**:
1. `admin_pending_users`
2. `admin_company_invitations`
3. `admin_company_analysis`
4. `users_with_company`
5. `user_company_context`
6. `gdpr_processing_inventory`
7. `gdpr_consent_overview`

**Problema**:
- Estas vistas NO tienen `SECURITY DEFINER` declarado explícitamente en su definición
- **PERO** Supabase las detecta como tal por alguna razón (posiblemente funciones o triggers asociados)
- Riesgo: Las vistas podrían ejecutar con permisos elevados, bypassing RLS

**Análisis**:
```sql
-- ❌ PROBLEMA: Vista sin control de acceso explícito
CREATE OR REPLACE VIEW users_with_company AS
SELECT u.*, c.name as company_name
FROM users u JOIN companies c ON u.company_id = c.id;
-- Cualquier usuario autenticado puede ver TODOS los usuarios

-- ✅ SOLUCIÓN: Vista con filtro RLS
CREATE OR REPLACE VIEW users_with_company 
WITH (security_invoker=true) AS  -- Usa permisos del usuario, no del creador
SELECT u.*, c.name as company_name
FROM users u JOIN companies c ON u.company_id = c.id
WHERE u.company_id IN (
    SELECT company_id FROM users WHERE auth_user_id = auth.uid()
);
```

---

## 🔒 Plan de Corrección

### **Fase 1: Correcciones CRÍTICAS** (AHORA - 15 min)

#### **1.1. Corregir `admin_pending_users` (auth_users_exposed)**

**Opción A - Eliminar JOIN con auth.users** (RECOMENDADA):
```sql
CREATE OR REPLACE VIEW admin_pending_users AS
SELECT 
    p.id,
    p.email,
    p.full_name,
    p.company_name,
    p.created_at,
    p.expires_at,
    p.confirmed_at,
    CASE 
        WHEN p.confirmed_at IS NOT NULL THEN 'confirmed'
        WHEN p.expires_at < NOW() THEN 'expired'
        ELSE 'pending'
    END as status
    -- ❌ ELIMINADO: au.email_confirmed_at, au.created_at
FROM public.pending_users p
-- ❌ ELIMINADO: LEFT JOIN auth.users au ON p.auth_user_id = au.id
WHERE EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_user_id = auth.uid()
    AND u.role IN ('owner', 'admin')
)
ORDER BY p.created_at DESC;
```

**Opción B - Añadir RLS a la vista**:
```sql
-- Crear política RLS para la vista
ALTER VIEW admin_pending_users SET (security_barrier = true);
CREATE POLICY admin_pending_users_policy ON admin_pending_users
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE auth_user_id = auth.uid() 
        AND role IN ('owner', 'admin')
    )
);
```

---

#### **1.2. Corregir Vistas con SECURITY DEFINER**

**Problema**: Vistas ejecutan con permisos del creador, no del usuario que consulta.

**Solución**: Añadir `WITH (security_invoker=true)` para que usen permisos del usuario.

**Script de Corrección**:
```sql
-- 1. users_with_company
DROP VIEW IF EXISTS users_with_company CASCADE;
CREATE VIEW users_with_company 
WITH (security_invoker=true)
AS
SELECT 
    u.id,
    u.email,
    u.full_name,
    u.permissions,
    u.created_at as user_created_at,
    c.id as company_id,
    c.name as company_name,
    c.website as company_website,
    c.legacy_negocio_id
FROM users u
JOIN companies c ON u.company_id = c.id
WHERE u.deleted_at IS NULL 
AND c.deleted_at IS NULL
AND u.company_id IN (
    SELECT company_id FROM users WHERE auth_user_id = auth.uid()
);

-- 2. user_company_context
DROP VIEW IF EXISTS user_company_context CASCADE;
CREATE VIEW user_company_context
WITH (security_invoker=true)
AS
SELECT 
    u.id as user_id,
    u.auth_user_id,
    u.company_id,
    c.name as company_name,
    u.role,
    u.permissions
FROM users u
JOIN companies c ON u.company_id = c.id
WHERE u.auth_user_id = auth.uid()
AND u.active = true;

-- 3. admin_company_invitations
DROP VIEW IF EXISTS admin_company_invitations CASCADE;
CREATE VIEW admin_company_invitations
WITH (security_invoker=true)
AS
SELECT 
    ci.id,
    ci.company_id,
    ci.email,
    ci.role,
    ci.status,
    ci.created_at,
    ci.expires_at,
    ci.responded_at,
    c.name as company_name,
    u.name as invited_by_name,
    u.email as invited_by_email,
    CASE 
        WHEN ci.status = 'pending' AND ci.expires_at < NOW() THEN 'expired'
        ELSE ci.status
    END as effective_status
FROM public.company_invitations ci
JOIN public.companies c ON ci.company_id = c.id
JOIN public.users u ON ci.invited_by_user_id = u.id
WHERE ci.company_id IN (
    SELECT company_id FROM users WHERE auth_user_id = auth.uid()
)
ORDER BY ci.created_at DESC;

-- 4. admin_company_analysis
DROP VIEW IF EXISTS admin_company_analysis CASCADE;
CREATE VIEW admin_company_analysis
WITH (security_invoker=true)
AS
SELECT 
    c.id,
    c.name,
    c.slug,
    c.created_at,
    COUNT(u.id) as total_users,
    COUNT(u.id) FILTER (WHERE u.role = 'owner') as owners_count,
    COUNT(u.id) FILTER (WHERE u.role = 'admin') as admins_count,
    COUNT(u.id) FILTER (WHERE u.role = 'member') as members_count,
    COUNT(ci.id) FILTER (WHERE ci.status = 'pending') as pending_invitations,
    STRING_AGG(u.email, ', ') FILTER (WHERE u.role = 'owner') as owner_emails
FROM public.companies c
LEFT JOIN public.users u ON c.id = u.company_id AND u.active = true
LEFT JOIN public.company_invitations ci ON c.id = ci.company_id AND ci.status = 'pending'
WHERE c.deleted_at IS NULL
AND c.id IN (
    SELECT company_id FROM users WHERE auth_user_id = auth.uid()
)
GROUP BY c.id, c.name, c.slug, c.created_at
ORDER BY c.created_at DESC;

-- 5. gdpr_processing_inventory
DROP VIEW IF EXISTS gdpr_processing_inventory CASCADE;
CREATE VIEW gdpr_processing_inventory
WITH (security_invoker=true)
AS
SELECT 
    pa.activity_name,
    pa.purpose,
    pa.legal_basis,
    pa.data_categories,
    pa.data_subjects,
    pa.recipients,
    pa.retention_period,
    pa.cross_border_transfers,
    COUNT(DISTINCT c.id) as affected_subjects_count,
    pa.created_at,
    pa.updated_at
FROM public.gdpr_processing_activities pa
LEFT JOIN public.clients c ON c.company_id IN (
    SELECT id FROM public.companies 
    WHERE id IN (
        SELECT company_id FROM public.users 
        WHERE auth_user_id = auth.uid()
    )
)
WHERE pa.is_active = true
GROUP BY pa.id, pa.activity_name, pa.purpose, pa.legal_basis, 
         pa.data_categories, pa.data_subjects, pa.recipients, 
         pa.retention_period, pa.cross_border_transfers, 
         pa.created_at, pa.updated_at;

-- 6. gdpr_consent_overview
DROP VIEW IF EXISTS gdpr_consent_overview CASCADE;
CREATE VIEW gdpr_consent_overview
WITH (security_invoker=true)
AS
SELECT 
    cr.subject_email,
    cr.consent_type,
    cr.purpose,
    cr.consent_given,
    cr.consent_method,
    cr.created_at as consent_date,
    cr.withdrawn_at,
    cr.is_active,
    c.name as client_name
FROM public.gdpr_consent_records cr
LEFT JOIN public.clients c ON c.email = cr.subject_email
WHERE cr.company_id IN (
    SELECT company_id FROM public.users 
    WHERE auth_user_id = auth.uid()
)
ORDER BY cr.created_at DESC;
```

---

## ⚠️ IMPORTANTE

### **Verificar Dependencias Antes de DROP VIEW**

Algunas vistas pueden tener dependencias (otras vistas, funciones, triggers). Antes de ejecutar, verifica:

```sql
-- Listar dependencias de cada vista
SELECT 
    v.schemaname,
    v.viewname,
    d.objid::regclass as dependent_object
FROM pg_views v
LEFT JOIN pg_depend d ON d.refobjid = (v.schemaname || '.' || v.viewname)::regclass::oid
WHERE v.schemaname = 'public'
AND v.viewname IN (
    'users_with_company',
    'user_company_context',
    'admin_company_invitations',
    'admin_company_analysis',
    'admin_pending_users',
    'gdpr_processing_inventory',
    'gdpr_consent_overview'
)
ORDER BY v.viewname;
```

---

## 📈 Resultado Esperado

### **Antes**:
```
Errores de Seguridad: 8
├── auth_users_exposed: 1 ❌
└── security_definer_view: 7 ❌
```

### **Después**:
```
Errores de Seguridad: 0 ✅
├── auth_users_exposed: 0 ✅
└── security_definer_view: 0 ✅
```

---

## 🔒 Beneficios de Seguridad

1. ✅ **Protección de auth.users**: Datos de autenticación NO expuestos
2. ✅ **RLS Aplicado**: Vistas respetan políticas de seguridad del usuario
3. ✅ **Principio de Mínimo Privilegio**: Usuarios solo ven sus propios datos
4. ✅ **Aislamiento Multi-tenant**: Cada empresa solo ve sus datos
5. ✅ **Auditoría GDPR**: Cumplimiento con protección de datos

---

## 📚 Referencias

- [Supabase Security Advisor - auth_users_exposed](https://supabase.com/docs/guides/database/database-linter?lint=0002_auth_users_exposed)
- [Supabase Security Advisor - security_definer_view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)
- [PostgreSQL Security Invoker Views](https://www.postgresql.org/docs/current/sql-createview.html#SQL-CREATEVIEW-SECURITY)

---

**Fecha**: 2025-10-07  
**Prioridad**: 🔴 CRÍTICA - Ejecutar INMEDIATAMENTE  
**Impacto**: Alto - Afecta seguridad de datos de usuarios
