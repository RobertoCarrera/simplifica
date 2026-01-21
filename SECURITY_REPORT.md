# Reporte de Auditoría de Seguridad - Simplifica CRM

**Fecha:** 30 de Enero de 2026
**Auditor:** Jules (Security Engineer Agent)
**Versión:** 1.0

## Resumen Ejecutivo

Se ha realizado una auditoría estática del código fuente y definiciones de base de datos. Se han detectado **2 Hallazgos Críticos** y **1 Hallazgo Alto** que comprometen la privacidad de los datos financieros y la integridad del control de acceso.

El hallazgo más urgente es la **exposición de datos financieros** (NIF, Importes, Fechas) a un servicio de terceros no autorizado (`api.qrserver.com`) durante la generación de facturas PDF, violando normativas de privacidad (GDPR).

## Tabla de Hallazgos

| ID | Severidad | Categoría | Componente | Descripción Corta |
|----|-----------|-----------|------------|-------------------|
| S01 | **CRÍTICO** | Privacidad | `invoices-pdf` (Edge Function) | Exposición de datos en generación de QR externo. |
| S02 | **CRÍTICO** | RLS / IDOR | `invoices` (Database) | Política de SELECT posiblemente rota o insegura por mismatch de User IDs. |
| S03 | **ALTO** | Lógica | `invoices-pdf` (Edge Function) | Fallback a permisos de administrador (Service Role) si RLS falla. |

---

## Detalle de Hallazgos

### S01: Exposición de Datos Financieros en QR (Privacidad)

- **Archivo Afectado:** `supabase/functions/invoices-pdf/index.ts`
- **Descripción:** La función `generateQRDataURL` construye una URL GET hacia `https://api.qrserver.com` incluyendo datos sensibles como el NIF del emisor, fecha, importe total y huella digital en los parámetros de la URL.
- **Impacto:** **Fuga de Información.** Estos datos son almacenados en los logs de un servidor de terceros no controlado por la organización. Viola el principio de minimización de datos y el Reglamento General de Protección de Datos (GDPR). Además, incumple la directriz de arquitectura de generar QRs localmente.
- **Remediación:** Implementar la generación del QR localmente utilizando la librería `qrcode-generator` ya importada en el proyecto.

### S02: Inconsistencia en Políticas RLS de Facturas (Broken Access Control)

- **Archivo Afectado:** `supabase/migrations/20260107022000_update_rls_invoices_quotes.sql`
- **Descripción:** La política `invoices_select_policy` compara directamente `company_members.user_id` con `auth.uid()`.
  - Migraciones posteriores (`20260111...`) confirman que `company_members.user_id` referencia a `public.users.id`, no a `auth.users.id`.
  - Existe una discrepancia entre UUIDs.
- **Impacto:** **Denegación de Servicio (DoS) o Fuga.**
  - Si los IDs son distintos, ningún usuario puede ver sus facturas (DoS).
  - Si en algún entorno coinciden por error, podría dar acceso incorrecto.
- **Remediación:** Alinear la política SELECT con la lógica usada en las políticas INSERT/UPDATE más recientes:
  `cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())`

### S03: Evasión de RLS en Generación de PDF (Privilege Escalation)

- **Archivo Afectado:** `supabase/functions/invoices-pdf/index.ts`
- **Descripción:** La función intenta leer `invoice_items` con el cliente del usuario (`user`). Si retorna 0 o 1 ítems, ejecuta automáticamente una consulta con el cliente administrador (`admin`, Service Role) para obtener los ítems.
- **Impacto:** **Bypass de Seguridad.** Si las políticas RLS restringieran legítimamente el acceso a los ítems (pero no a la cabecera), esta función saltaría esa restricción, exponiendo datos que el usuario no debería ver.
- **Remediación:** Eliminar el bloque de fallback. Si el usuario no tiene acceso por RLS, la función no debe mostrar los datos.

---

## Próximos Pasos

Se procederá a remediar inmediatamente el hallazgo **S01** (QR Externo) y **S03** (Fallback Admin) en una única intervención sobre la Edge Function `invoices-pdf`, ya que ambos residen en el mismo archivo y afectan a la misma funcionalidad.
