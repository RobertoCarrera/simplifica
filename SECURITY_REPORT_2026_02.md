# Auditoría de Seguridad - Simplifica CRM
**Fecha:** 2026-02-01
**Auditor:** Jules (Senior Security Engineer)

## Resumen Ejecutivo
Se ha realizado una auditoría de seguridad recurrente centrada en RLS, Edge Functions y Lógica Financiera. Se han identificado **2 hallazgos CRÍTICOS** y **3 de prioridad ALTA** que comprometen la seguridad multi-tenant y la integridad de los datos financieros.

## Hallazgos

### 1. IDOR en Endpoints de Debug (`verifactu-dispatcher`) - CRÍTICO
- **Descripción**: Los endpoints de depuración (`debug-test-update`, `debug-last-event`, `debug-aeat-process`, `test-cert`) aceptan un `company_id` en el cuerpo de la petición y ejecutan consultas usando el cliente `admin` (Service Role) sin verificar si el usuario que hace la petición pertenece a dicha empresa.
- **Impacto**: Un usuario autenticado malintencionado podría ver eventos, probar certificados y manipular estados de VeriFactu de CUALQUIER otra empresa simplemente conociendo o adivinando su UUID.
- **Archivo**: `supabase/functions/verifactu-dispatcher/index.ts`

### 2. RLS Mismatch en Facturas y Presupuestos - ALTA
- **Descripción**: Las políticas RLS de `SELECT` y `DELETE` en `invoices` y todas las políticas en `quotes` comparan incorrectamente `auth.uid()` (UUID de Auth) con `company_members.user_id` (UUID de Public Users). Debido a que estos UUIDs son diferentes en la arquitectura actual, las políticas evalúan a `false`, bloqueando el acceso legítimo o, en el peor de los casos, permitiendo acceso incorrecto si hubiera colisiones (improbable).
- **Impacto**: Denegación de servicio para usuarios legítimos (no ven sus datos) o inconsistencia en la aplicación de seguridad.
- **Archivos**: Migraciones anteriores (`20260107022000`).

### 3. Lógica Deprecada en Conversión de Presupuestos - ALTA
- **Descripción**: La función de base de datos `convert_quote_to_invoice` utiliza la columna deprecada `public.users.company_id` para validar permisos. Esta columna no soporta el modelo multi-tenant actual (muchos a muchos en `company_members`).
- **Impacto**: Fallo en la autorización para usuarios que son miembros de múltiples empresas o para aquellos donde la columna `company_id` ya ha sido eliminada/nulificada.
- **Archivo**: `public.convert_quote_to_invoice` (DB Function).

### 4. RLS Faltante en Items de Facturas/Presupuestos - ALTA
- **Descripción**: No se han confirmado políticas RLS explícitas para las tablas hijas `invoice_items` y `quote_items`.
- **Impacto**: Si RLS está habilitado pero sin políticas, los datos son inaccesibles. Si RLS no está habilitado, los datos son públicos para cualquier usuario autenticado, permitiendo fuga de información de detalles de facturación.

### 5. Uso de Patrones Deprecados en Edge Functions - MEDIA
- **Descripción**: El endpoint `list-registry` en `verifactu-dispatcher` también confía en `public.users.company_id` en lugar de consultar `company_members`.
- **Impacto**: Inconsistencia en la experiencia de usuario y potenciales fallos de acceso.

## Plan de Acción
1. **Fix Inmediato (Edge Functions)**: Implementar `requireCompanyAccess` en `verifactu-dispatcher` y corregir `list-registry`.
2. **Fix Inmediato (RLS/DB)**: Nueva migración para corregir políticas de `invoices`/`quotes`, asegurar `items` y reescribir `convert_quote_to_invoice`.
