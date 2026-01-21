# Reporte de Seguridad - Simplifica CRM

**Fecha:** 1 de Febrero, 2026
**Auditor:** Jules (AI Security Engineer)

## Resumen Ejecutivo
Se ha realizado una auditoría de seguridad enfocada en RLS, Multi-tenancy y Edge Functions. Se han detectado inconsistencias críticas en las políticas de seguridad (RLS) relacionadas con la gestión de identidades (diferencia entre `auth.uid()` y `public.users.id`), lo que provoca fallos de acceso en funcionalidades clave como invitaciones. Además, se ha identificado una fuga de privacidad en la generación de QRs.

## Hallazgos

### 1. [CRÍTICO] Bloqueo de Acceso y Fallo de Seguridad en Invitaciones (RLS)
- **Archivos afectados:** `supabase/migrations/20260111020000_fix_invitations_permissions.sql`, tabla `company_invitations`.
- **Descripción:** Las políticas RLS actuales comparan directamente `auth.uid()` (UUID de Supabase Auth) con columnas `user_id` (UUID de `public.users`). Debido a que estos IDs son diferentes en este sistema, las comparaciones siempre fallan.
- **Impacto:**
  - **Denegación de Servicio:** Los miembros de la empresa no pueden ver las invitaciones existentes.
  - **Fallo de Funcionalidad:** Los administradores/dueños no pueden crear, editar o eliminar invitaciones porque las políticas `WITH CHECK` fallan.
- **Mitigación:** Actualizar las políticas para usar la función `public.get_my_public_id()` o una subconsulta correcta que mapee la identidad de Auth a Public.

### 2. [ALTO] Fuga de Datos en Generación de QR (Privacidad)
- **Archivos afectados:** `supabase/functions/invoices-pdf/index.ts`
- **Descripción:** La función Edge para generar PDFs de facturas utiliza un servicio de terceros (`api.qrserver.com`) para generar el código QR de VeriFactu.
- **Impacto:** Se envían datos sensibles (NIF del emisor, Fecha, Importe Total, Huella digital) a un servidor externo no controlado. Esto viola principios de privacidad y potencialmente normativas GDPR/fiscale.
- **Mitigación:** Implementar una librería de generación de QR local (ej: `qrcode` o `qrcode-generator` ejecutado en el backend) para no enviar datos fuera de la infraestructura.

### 3. [MEDIO] Dependencia de Cliente Admin en Edge Functions
- **Archivos afectados:** `supabase/functions/invoices-pdf/index.ts`
- **Descripción:** Se utiliza `SUPABASE_SERVICE_ROLE_KEY` para acceder a `storage` y metadatos `verifactu`. Aunque el acceso inicial se valida mediante RLS en la tabla `invoices`, el código asume que si tienes acceso a la factura, tienes acceso a todos sus adjuntos y metadatos sin validación granular adicional.
- **Impacto:** Si la validación de `invoices` falla o tiene brechas, un atacante podría acceder a documentos sensibles.
- **Mitigación:** Reforzar las políticas RLS en `storage.objects` y esquemas auxiliares, o asegurar que el código Edge Function replique exactamente las restricciones de negocio antes de usar el cliente Admin.

## Plan de Acción Inmediato
1. Corregir las políticas RLS de `company_invitations` (Prioridad Inmediata).
2. Planificar la sustitución del generador de QR por una solución interna.
