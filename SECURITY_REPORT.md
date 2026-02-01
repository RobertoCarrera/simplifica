# Security Audit Report - Simplifica

**Fecha:** 5 de Marzo, 2026
**Auditor:** Jules (Security Engineer)
**Prioridad:** CRÍTICA

## Resumen Ejecutivo

Se han detectado vulnerabilidades críticas en la capa de datos (RLS) y en las Edge Functions que permiten el acceso cruzado entre tenants (empresas) y la exposición de información sensible.

## Hallazgos

### 1. Fuga de Datos en `payment_integrations` (CRÍTICO)

*   **Descripción:** Las políticas RLS actuales permiten a cualquier usuario con rol de 'admin' (de cualquier empresa) ver las integraciones de pago de *todas* las empresas.
*   **Archivo afectado:** `supabase/migrations/20260111130000_remove_legacy_role_column.sql` (definición actual).
*   **Impacto:** Un administrador malicioso de la Empresa A puede obtener credenciales de pago (API Keys) de la Empresa B.
*   **Corrección:** Modificar la política RLS para filtrar explícitamente por `company_id`.

### 2. Falta de RLS y IDOR en `item_tags` (CRÍTICO)

*   **Descripción:** La tabla `item_tags` (etiquetas polimórficas) no tiene columna `company_id` y sus políticas RLS son `TO authenticated USING (true)`.
*   **Archivo afectado:** `supabase/migrations/20260106110000_unified_tags_schema.sql`.
*   **Impacto:** Cualquier usuario autenticado puede leer, crear, modificar o eliminar etiquetas asociadas a clientes, tickets o servicios de cualquier otra empresa.
*   **Corrección:** Añadir columna `company_id`, backfill de datos existentes, y aplicar RLS estricto.

### 3. Exposición de Entorno y Debugging en `verifactu-dispatcher` (ALTO)

*   **Descripción:** La Edge Function `verifactu-dispatcher` expone endpoints de depuración (`debug-env`, `debug-aeat-process`, etc.) que permiten ver variables de entorno sensibles (claves de encriptación) y manipular estados de facturación sin validar que el usuario pertenezca a la empresa objetivo.
*   **Archivo afectado:** `supabase/functions/verifactu-dispatcher/index.ts`.
*   **Impacto:** Un atacante puede obtener claves de cifrado de certificados o alterar el estado de facturación electrónica de otra empresa.
*   **Corrección:** Implementar validación estricta de `company_id` contra el token del usuario (`requireCompanyAccess`).

## Plan de Acción

1.  **Inmediato:** Crear migración para corregir RLS en `payment_integrations` y `item_tags`.
2.  **Inmediato:** Parchear `verifactu-dispatcher` para asegurar endpoints de depuración.
