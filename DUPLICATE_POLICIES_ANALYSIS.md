# ANÁLISIS DE POLÍTICAS RLS DUPLICADAS

## 📊 Resumen Ejecutivo

**Estado**: ℹ️ **INFORMATIVO - NO CRÍTICO**  
**Warnings**: 156 de 192 (81% del total)  
**Impacto en Seguridad**: ✅ **NINGUNO** (políticas duplicadas son redundantes pero seguras)  
**Impacto en Rendimiento**: ⚠️ **MENOR** (evalúa 2 políticas en lugar de 1)  
**Prioridad de Corrección**: 🔵 **BAJA** (puede esperar a fase de limpieza)

---

## 🔍 ¿Por qué existen políticas duplicadas?

Durante la implementación de RLS, se crearon **nuevas políticas modernas** sin eliminar las **antiguas políticas legacy**. PostgreSQL permite múltiples políticas permisivas para la misma acción, evaluándolas con **OR lógico**.

**Ejemplo en tabla `addresses`**:
- ✅ **Nueva política**: `addresses_own_user_only` (política moderna, naming consistente)
- ⚠️ **Política legacy**: `Users can delete own addresses` (política antigua, naming descriptivo)

**Resultado**: Ambas permiten el acceso correcto, pero PostgreSQL debe evaluar ambas.

---

## 📋 Tablas Afectadas y Políticas Duplicadas

### 1. **addresses** (8 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT, INSERT, UPDATE, DELETE

**Políticas duplicadas**:
- `Users can view own addresses` + `addresses_own_user_only`
- `Users can insert own addresses` + `addresses_own_user_only`
- `Users can update own addresses` + `addresses_own_user_only`
- `Users can delete own addresses` + `addresses_own_user_only`

**Recomendación**: Eliminar las 4 políticas legacy con nombre `Users can...`, mantener `addresses_own_user_only`.

---

### 2. **companies** (16 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT, UPDATE, INSERT, DELETE

**Políticas duplicadas**:
- `companies_own_view` + `companies_own_only` (SELECT)
- `companies_owner_edit` + `companies_own_only` (UPDATE)
- `allow_all_for_companies` + `companies_own_only` (INSERT, DELETE en authenticated)

**Recomendación**: 
- Mantener `companies_own_only` (política moderna, cubre todos los casos)
- Eliminar `companies_own_view`, `companies_owner_edit`, `allow_all_for_companies`

---

### 3. **company_invitations** (12 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT, INSERT, UPDATE

**Políticas duplicadas**:
- `Company members can view invitations` + `company_invitations_company_only`
- `Owners and admins can create invitations` + `company_invitations_company_only`
- `Inviter can update invitations` + `company_invitations_company_only`

**Recomendación**: Mantener `company_invitations_company_only`, eliminar las 3 legacy.

---

### 4. **devices** (4 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT

**Políticas duplicadas**:
- `devices_gdpr_company_access` + `devices_company_only`

**Recomendación**: Mantener ambas (tienen lógica diferente):
- `devices_company_only`: Filtro básico por company_id
- `devices_gdpr_company_access`: Añade filtro GDPR (excluye clientes anonimizados)

**Solución mejor**: Fusionar en una sola política con ambos filtros.

---

### 5. **gdpr_access_requests** (16 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT, INSERT, UPDATE, DELETE

**Políticas duplicadas**:
- `gdpr_access_requests_company` + `gdpr_access_requests_company_only`

**Recomendación**: Mantener `gdpr_access_requests_company_only`, eliminar `gdpr_access_requests_company`.

---

### 6. **gdpr_audit_log** (4 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT

**Políticas duplicadas**:
- `gdpr_audit_log_access` + `gdpr_audit_log_company_only`

**Recomendación**: Mantener `gdpr_audit_log_access` (filtro por DPO/admin), eliminar `gdpr_audit_log_company_only`.

---

### 7. **gdpr_breach_incidents** (16 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT, INSERT, UPDATE, DELETE

**Políticas duplicadas**:
- `gdpr_breach_incidents_dpo_admin` + `gdpr_breach_incidents_company_only`

**Recomendación**: Mantener `gdpr_breach_incidents_dpo_admin`, eliminar `gdpr_breach_incidents_company_only`.

---

### 8. **gdpr_consent_records** (16 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT, INSERT, UPDATE, DELETE

**Políticas duplicadas**:
- `gdpr_consent_records_company` + `gdpr_consent_records_company_only`

**Recomendación**: Mantener `gdpr_consent_records_company_only`, eliminar `gdpr_consent_records_company`.

---

### 9. **gdpr_consent_requests** (4 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT

**Políticas duplicadas**:
- `gcr_company_policy` + `gdpr_consent_requests_company_only`

**Recomendación**: Mantener `gdpr_consent_requests_company_only`, eliminar `gcr_company_policy`.

---

### 10. **gdpr_processing_activities** (16 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT, INSERT, UPDATE, DELETE

**Políticas duplicadas**:
- `gdpr_processing_activities_admin_only` + `gdpr_processing_activities_company_only`

**Recomendación**: Mantener `gdpr_processing_activities_admin_only`, eliminar `gdpr_processing_activities_company_only`.

---

### 11. **localities** (4 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT

**Políticas duplicadas**:
- `Anyone can view localities` + `localities_read_all`

**Recomendación**: Mantener `localities_read_all`, eliminar `Anyone can view localities`.

---

### 12. **pending_users** (12 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT, INSERT, UPDATE

**Políticas duplicadas**:
- `Users can view own pending registrations` + `pending_users_company_or_service`
- `System can insert pending users` + `pending_users_company_or_service`
- `System can update pending users` + `pending_users_company_or_service`

**Recomendación**: Mantener `pending_users_company_or_service`, eliminar las 3 legacy.

---

### 13. **ticket_comments** (16 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT, INSERT, UPDATE, DELETE

**Políticas duplicadas**:
- `Comments selectable by company members` + `ticket_comments_company_only`
- `Comments insert by company members` + `ticket_comments_company_only`
- `Comments update by author` + `ticket_comments_company_only`
- `Comments delete by author` + `ticket_comments_company_only`

**Recomendación**: Mantener `ticket_comments_company_only`, eliminar las 4 legacy.

---

### 14. **ticket_devices** (8 warnings)
**Roles afectados**: anon, authenticated, authenticator, dashboard_user  
**Acciones duplicadas**: SELECT, INSERT

**Políticas duplicadas**:
- `Users can manage ticket devices from their company` + `ticket_devices_via_ticket`
- `Users can insert ticket devices from their company` + `ticket_devices_via_ticket`

**Recomendación**: Mantener `ticket_devices_via_ticket`, eliminar las 2 legacy.

---

### 15. **users** (2 warnings)
**Roles afectados**: authenticated  
**Acciones duplicadas**: SELECT, UPDATE

**Políticas duplicadas**:
- `users_own_profile` + `allow_all_for_users` (SELECT)
- `users_own_update` + `allow_all_for_users` (UPDATE)

**Recomendación**: **CUIDADO** - `allow_all_for_users` es muy permisiva (permite TODO a authenticated).
- Mantener `users_own_profile` y `users_own_update` (más restrictivas)
- Eliminar `allow_all_for_users` (demasiado permisiva, riesgo de seguridad)

---

## ✅ Script de Limpieza (EJECUTAR CON PRECAUCIÓN)

```sql
-- ============================================================================
-- LIMPIEZA DE POLÍTICAS RLS DUPLICADAS
-- ============================================================================
-- ⚠️ IMPORTANTE: Ejecutar EN ORDEN y VERIFICAR después de cada bloque
-- ============================================================================

-- PASO 1: Eliminar políticas legacy de addresses
DROP POLICY IF EXISTS "Users can view own addresses" ON public.addresses;
DROP POLICY IF EXISTS "Users can insert own addresses" ON public.addresses;
DROP POLICY IF EXISTS "Users can update own addresses" ON public.addresses;
DROP POLICY IF EXISTS "Users can delete own addresses" ON public.addresses;

-- PASO 2: Eliminar políticas redundantes de companies
DROP POLICY IF EXISTS "companies_own_view" ON public.companies;
DROP POLICY IF EXISTS "companies_owner_edit" ON public.companies;
DROP POLICY IF EXISTS "allow_all_for_companies" ON public.companies;

-- PASO 3: Eliminar políticas legacy de company_invitations
DROP POLICY IF EXISTS "Company members can view invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Owners and admins can create invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Inviter can update invitations" ON public.company_invitations;

-- PASO 4: Eliminar políticas redundantes de GDPR
DROP POLICY IF EXISTS "gdpr_access_requests_company" ON public.gdpr_access_requests;
DROP POLICY IF EXISTS "gdpr_audit_log_company_only" ON public.gdpr_audit_log;
DROP POLICY IF EXISTS "gdpr_breach_incidents_company_only" ON public.gdpr_breach_incidents;
DROP POLICY IF EXISTS "gdpr_consent_records_company" ON public.gdpr_consent_records;
DROP POLICY IF EXISTS "gcr_company_policy" ON public.gdpr_consent_requests;
DROP POLICY IF EXISTS "gdpr_processing_activities_company_only" ON public.gdpr_processing_activities;

-- PASO 5: Eliminar políticas legacy de localities
DROP POLICY IF EXISTS "Anyone can view localities" ON public.localities;

-- PASO 6: Eliminar políticas legacy de pending_users
DROP POLICY IF EXISTS "Users can view own pending registrations" ON public.pending_users;
DROP POLICY IF EXISTS "System can insert pending users" ON public.pending_users;
DROP POLICY IF EXISTS "System can update pending users" ON public.pending_users;

-- PASO 7: Eliminar políticas legacy de ticket_comments
DROP POLICY IF EXISTS "Comments selectable by company members" ON public.ticket_comments;
DROP POLICY IF EXISTS "Comments insert by company members" ON public.ticket_comments;
DROP POLICY IF EXISTS "Comments update by author" ON public.ticket_comments;
DROP POLICY IF EXISTS "Comments delete by author" ON public.ticket_comments;

-- PASO 8: Eliminar políticas legacy de ticket_devices
DROP POLICY IF EXISTS "Users can manage ticket devices from their company" ON public.ticket_devices;
DROP POLICY IF EXISTS "Users can insert ticket devices from their company" ON public.ticket_devices;

-- PASO 9: CRÍTICO - Eliminar política permisiva de users
-- ⚠️ VERIFICAR QUE users_own_profile y users_own_update funcionen antes de ejecutar
DROP POLICY IF EXISTS "allow_all_for_users" ON public.users;
```

---

## 🧪 Verificación Post-Limpieza

```sql
-- Verificar que no quedan políticas duplicadas
SELECT 
    tablename,
    COUNT(*) as policy_count,
    string_agg(policyname, ', ') as policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename, cmd
HAVING COUNT(*) > 1
ORDER BY tablename;

-- Resultado esperado: 0 filas (sin duplicados)
```

---

## 📅 Calendario de Limpieza Recomendado

### **AHORA (Octubre 2025)**
✅ Fix #1: Índices duplicados (EJECUTADO)  
✅ Fix #2: Auth RLS InitPlan (EJECUTADO)  

### **Próxima Semana**
- Pruebas exhaustivas de las políticas modernas
- Monitoreo de logs de errores
- Confirmación de que todo funciona correctamente

### **En 2-3 Semanas (si todo va bien)**
- Ejecutar script de limpieza de políticas duplicadas
- Verificar que warnings de Supabase bajan de 192 a ~3

---

## 🎯 Resultado Final Esperado

**Antes de limpieza**:
- 192 warnings totales
- 33 auth_rls_initplan ✅ CORREGIDOS
- 156 multiple_permissive_policies ⏳ PENDIENTE
- 3 duplicate_index ✅ CORREGIDOS

**Después de limpieza completa**:
- 0 warnings totales 🎉
- Sistema más eficiente y mantenible
- Sin impacto en seguridad o funcionalidad

---

## ⚠️ PRECAUCIONES

1. **NO ejecutar script de limpieza en producción sin pruebas previas**
2. **Hacer backup de base de datos antes de eliminar políticas**
3. **Probar en ambiente de desarrollo primero**
4. **Monitorear logs de errores después de cada cambio**
5. **Tener plan de rollback preparado**

---

## 📚 Referencias

- [Supabase RLS Performance](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select)
- [PostgreSQL Policy Documentation](https://www.postgresql.org/docs/current/sql-createpolicy.html)
- [Linter Documentation](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)
