# Reporte de Auditoría de Seguridad - Simplifica CRM

**Fecha:** 7 de Marzo de 2026
**Auditor:** Jules (Senior Security Engineer)

## Resumen Ejecutivo

Se han detectado **2 vulnerabilidades CRÍTICAS** y **1 de riesgo ALTO** que comprometen el aislamiento multi-tenant y la integridad de los datos financieros. Se recomienda la corrección inmediata de las políticas RLS y la securización de las Edge Functions.

## Hallazgos

### 1. Fuga de Datos Multi-Tenant en Integraciones de Pago (CRÍTICO)
*   **Archivos afectados:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`, Tabla `public.payment_integrations`
*   **Descripción:** La política RLS `payment_integrations_select` (y write) verifica que el usuario sea `admin` u `owner`, pero **NO verifica que pertenezca a la misma empresa** (`company_id`) que el registro de integración.
*   **Impacto:** Un administrador de la "Empresa A" puede leer y modificar las credenciales de pago (Stripe/PayPal) de la "Empresa B".
*   **Mitigación:** Modificar la política RLS para forzar `u.company_id = payment_integrations.company_id`.

### 2. IDOR y Ejecución Remota en `verifactu-dispatcher` (CRÍTICO)
*   **Archivos afectados:** `supabase/functions/verifactu-dispatcher/index.ts`
*   **Descripción:** Los endpoints de depuración `debug-test-update`, `debug-last-event`, `debug-aeat-process` y `retry` aceptan un `company_id` o `invoice_id` en el cuerpo de la petición y ejecutan acciones usando un cliente `admin` (service_role) sin validar si el usuario que hace la petición pertenece a dicha empresa.
*   **Impacto:** Cualquier usuario autenticado puede manipular el estado de facturación (VeriFactu) de cualquier otra empresa, forzar reintentos o extraer información de eventos.
*   **Mitigación:**
    *   Eliminar endpoints de debug en producción o protegerlos estrictamente.
    *   Usar `requireCompanyAccess` o `requireInvoiceAccess` para validar la propiedad antes de procesar cualquier acción.

### 3. Gestión de Dominios Global insegura (ALTO)
*   **Archivos afectados:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql`, Tabla `public.domains`
*   **Descripción:** La política `Admins can manage all domains` permite a cualquier usuario con rol `admin` (de cualquier empresa) gestionar los dominios de todos los usuarios del sistema.
*   **Impacto:** Un admin malintencionado podría borrar o secuestrar dominios de correo de otros clientes.
*   **Mitigación:** Restringir la gestión de dominios a aquellos asignados a usuarios de la misma empresa.

## Plan de Acción Inmediato

1.  **PR 1 (RLS Fix):** Corregir políticas de `payment_integrations` para incluir chequeo de `company_id`.
2.  **PR 2 (Edge Function Security):** Securizar `verifactu-dispatcher` eliminando o protegiendo endpoints de debug.
