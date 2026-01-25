# Auditoría de Seguridad - Junio 2026

**Fecha:** 16 de Junio, 2026
**Auditor:** Jules (Security Engineer)
**Scope:** RLS, Edge Functions, Logic Security

## Resumen Ejecutivo

Se han detectado vulnerabilidades críticas y de alto riesgo relacionadas con la implementación de multi-tenancy y control de acceso. La principal causa raíz es la dependencia de columnas deprecadas (`users.company_id`) en lugar de la tabla de relación autoritativa (`company_members`), y posibles fallos en políticas RLS debido a discrepancias entre UUIDs de autenticación y de dominio público.

## Hallazgos

### 1. [CRÍTICO] Discrepancia de IDs en Políticas RLS (`company_members`)
- **Descripción:** La política RLS `Users can view own memberships` en `public.company_members` compara `user_id` (FK a `public.users.id`) directamente con `auth.uid()` (Auth User ID). Dado que estos UUIDs son distintos, la política probablemente falla por defecto, impidiendo acceso legítimo o, peor, permitiendo acceso incorrecto si hay colisiones.
- **Archivo:** `supabase/migrations/20260107020000_create_company_members.sql`
- **Impacto:** Denegación de servicio o fuga de datos.
- **Recomendación:** Actualizar la política para mapear el ID: `user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())`.

### 2. [ALTO] Autorización Débil en Edge Functions
- **Descripción:** Las funciones `payment-integrations-test` y `verifactu-dispatcher` utilizan `users.company_id` para verificar pertenencia a una empresa. Esta columna está marcada como deprecada y no soporta correctamente escenarios multi-usuario/multi-empresa, pudiendo llevar a elevación de privilegios o acceso cruzado.
- **Archivos:**
  - `supabase/functions/payment-integrations-test/index.ts`
  - `supabase/functions/verifactu-dispatcher/index.ts`
- **Impacto:** IDOR, acceso no autorizado a integraciones de pago o registros fiscales de otras empresas.
- **Recomendación:** Implementar lookup vía `company_members` usando la cadena: `auth.uid()` -> `public.users(auth_user_id)` -> `company_members`.

### 3. [ALTO] Bypass de RLS en Generación de PDFs
- **Descripción:** La función `invoices-pdf` implementa un fallback al cliente `admin` (service role) si la consulta RLS devuelve pocos items. Esto enmascara problemas subyacentes de RLS en `invoice_items` y expone datos que deberían estar protegidos.
- **Archivo:** `supabase/functions/invoices-pdf/index.ts`
- **Impacto:** Posible exposición de ítems de factura no autorizados.
- **Recomendación:** Corregir las políticas RLS de `invoice_items` y eliminar el fallback a `admin`.

### 4. [ALTO] Funcionalidad Stub en `booking-manager`
- **Descripción:** La función `booking-manager` es un stub sin implementación real de seguridad o lógica. Si se despliega como "activa", puede dar una falsa sensación de funcionalidad o seguridad.
- **Archivo:** `supabase/functions/booking-manager/index.ts`
- **Impacto:** Riesgo de implementación incompleta expuesta públicamente.

## Plan de Acción Inmediato (PRs)

1. **Fix Edge Functions Authorization:** Corregir `payment-integrations-test` y `verifactu-dispatcher` para usar `company_members`.
