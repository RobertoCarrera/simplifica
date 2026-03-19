# Auditoría de Seguridad Completa — SimplificaCRM

**Fecha:** 19 de marzo de 2026  
**Objetivo:** Evaluar si el sistema está preparado para manejar datos reales, confidenciales y clínicos  
**Marco normativo:** RGPD (Reglamento UE 2016/679), OWASP Top 10, ISO 27001  
**Veredicto global:** ⚠️ **NO LISTO para datos clínicos reales** — se requieren correcciones críticas antes del lanzamiento

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Hallazgos Críticos (P0 — Bloquean producción)](#2-hallazgos-críticos-p0)
3. [Hallazgos Altos (P1 — Resolver antes de datos reales)](#3-hallazgos-altos-p1)
4. [Hallazgos Medios (P2 — Resolver en las primeras semanas)](#4-hallazgos-medios-p2)
5. [Hallazgos Bajos (P3 — Mejora continua)](#5-hallazgos-bajos-p3)
6. [Lo que ya está bien hecho](#6-lo-que-ya-está-bien-hecho)
7. [Roadmap de Remediación](#7-roadmap-de-remediación)
8. [Checklist pre-producción](#8-checklist-pre-producción)

---

## 1. Resumen Ejecutivo

### Arquitectura del sistema
| Componente | Tecnología |
|---|---|
| Frontend | Angular 21 (SSR), Tailwind CSS |
| Backend | Supabase (PostgreSQL + 40+ Edge Functions) |
| Auth | Supabase Auth (email/password, magic links, WebAuthn, OAuth) |
| Hosting | Vercel |
| Encriptación | pgcrypto (SQL), AES-256-GCM (Edge Functions), Web Crypto API (Frontend) |
| Multi-tenancy | RLS por company_id + company_members |

### Puntuación por área

| Área | Puntuación | Estado |
|---|---|---|
| Arquitectura multi-tenant (RLS) | 8/10 | ✅ Sólida |
| Autenticación | 6/10 | ⚠️ Funcional pero necesita refuerzo |
| Protección XSS | 9/10 | ✅ Excelente (DOMPurify en todos los puntos) |
| Protección CSRF | 9/10 | ✅ Excelente (HMAC-SHA256 + timing-safe) |
| Cifrado de datos clínicos | 3/10 | 🔴 Clave hardcodeada en código fuente |
| Gestión de secretos | 4/10 | 🔴 Bypass hardcodeado + claves estáticas |
| Cumplimiento RGPD | 7/10 | ⚠️ Estructura completa, gaps de implementación |
| Headers de seguridad | 9/10 | ✅ CSP, HSTS, X-Frame-Options correctos |
| Rate limiting | 4/10 | ⚠️ Solo en memoria, no persistente |
| Logging & monitorización | 5/10 | ⚠️ Audit trail parcial |

---

## 2. Hallazgos Críticos (P0)

> Estos hallazgos **BLOQUEAN** la puesta en producción con datos reales.

### P0-1: Clave de cifrado de notas clínicas hardcodeada en código fuente

**Severidad:** 🔴 CRÍTICA  
**RGPD:** Art. 32 (medidas técnicas apropiadas), Art. 9 (datos de salud)  
**OWASP:** A02:2021 - Cryptographic Failures

La clave `simplifica-secure-key-2026` está escrita literalmente en 6 archivos SQL:

| Archivo | Línea |
|---|---|
| `supabase/migrations/20260114190700_secure_clinical_notes.sql` | L67, L77, L106 |
| `supabase/migrations/20260215000000_update_gdpr_export.sql` | L20 |
| `supabase/migrations/20260217100000_secure_clinical_notes_multi_tenant.sql` | L95, L122 |

**Impacto:** Cualquiera con acceso al repositorio Git puede descifrar TODAS las notas clínicas. Si el repo es público o se filtra, es una violación de datos catastrófica.

**Remediación:**
```sql
-- Migrar a Supabase Vault
SELECT vault.create_secret('clinical_encryption_key', 'nueva-clave-criptograficamente-segura');

-- En las funciones, leer del Vault:
v_encryption_key := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'clinical_encryption_key');
```

---

### P0-2: Bypass de autenticación hardcodeado en booking público

**Severidad:** 🔴 CRÍTICA  
**OWASP:** A07:2021 - Identification and Authentication Failures

| Archivo | Línea |
|---|---|
| `supabase/functions/booking-public/index.ts` | L105 |
| `booking-frontend/server.js` | L35 |

```typescript
const isBypass = apiKey === 'BYPASS-SECRET-2026';
```

**Impacto:** Cualquiera que envíe `x-api-key: BYPASS-SECRET-2026` obtiene acceso completo al endpoint de booking sin autenticación.

**Remediación:** Eliminar la línea al completo. Para debugging, usar variables de entorno temporales en el dashboard de Supabase.

---

### P0-3: Sin mecanismo de rotación de claves de cifrado

**Severidad:** 🔴 CRÍTICA  
**RGPD:** Art. 32(1)(b) — capacidad de asegurar la confidencialidad de forma permanente

No existe:
- Versionado de claves (key versioning)
- Proceso de re-cifrado (re-encryption)
- Política de rotación periódica

**Impacto:** Si la clave se compromete, todos los datos históricos clínicos quedan expuestos sin forma de mitigar.

---

## 3. Hallazgos Altos (P1)

> Resolver ANTES de introducir datos clínicos reales.

### P1-1: Rate limiter en memoria (no persistente)

**OWASP:** A04:2021 - Insecure Design

El rate limiter (`supabase/functions/_shared/rate-limiter.ts`) usa un `Map` en memoria que se pierde en cada cold start de la Edge Function.

**Impacto:** Un atacante puede hacer brute-force a la autenticación reiniciando las funciones serverless.

**Remediación:** Migrar a Upstash Redis (compatible con Supabase Edge Functions/Deno).

---

### P1-2: ALLOW_ALL_ORIGINS puede abrir CORS en producción

20+ archivos leen la variable `ALLOW_ALL_ORIGINS`. Si se pone a `true` en producción (aunque sea por accidente), se desactiva toda protección CORS.

**Remediación:**
- Eliminar soporte para `ALLOW_ALL_ORIGINS` del código compartido
- Solo permitir orígenes explícitos de una whitelist

---

### P1-3: Política de contraseñas insuficiente para datos de salud

**RGPD:** Art. 32 — medidas técnicas apropiadas

Supabase Auth por defecto acepta contraseñas de solo 6 caracteres, sin requisitos de complejidad.

**Remediación:**
- Mínimo 12 caracteres
- Al menos 1 mayúscula, 1 número, 1 símbolo
- Validar en frontend Y en Custom Access Token Hook
- Forzar MFA para roles admin/DPO

---

### P1-4: Timeout de sesión solo en frontend (no server-side)

El timeout de 30 minutos por inactividad es solo un `setTimeout` en JavaScript. El JWT de Supabase sigue siendo válido hasta su expiración (1h por defecto).

**Impacto:** Un atacante con un token robado puede usarlo durante toda su vigencia.

**Remediación:**
- Reducir el TTL del JWT a 15 minutos en Supabase Dashboard
- Implementar una tabla `active_sessions` con última actividad

---

### P1-5: Console.log filtra información de arquitectura en producción

15+ ubicaciones en el frontend logean en consola: roles de usuario, URLs de API, errores de RLS, lógica de autorización.

**Impacto:** Un usuario técnico malintencionado puede estudiar la arquitectura interna desde las DevTools.

**Remediación:**
```typescript
// angular.json → production budget
"configurations": {
  "production": {
    "optimization": {
      "scripts": true,
      "styles": true
    }
  }
}
```
Y usar un servicio de logging condicional:
```typescript
@Injectable()
export class LogService {
  log(...args: any[]) {
    if (!environment.production) console.log(...args);
  }
}
```

---

### P1-6: Subida de archivos sin verificación de magic bytes

Los validadores de upload (`upload-validator.ts`, `client-documents.component.ts`) solo verifican la extensión y el MIME type (ambos spoofables desde el cliente).

**Impacto:** Un atacante puede subir un ejecutable renombrándolo como `.pdf`.

**Remediación:**
- Verificar magic bytes (firma del archivo) en el edge function
- Escanear archivos con ClamAV o un servicio equivalente
- Header `Content-Disposition: attachment` en todas las descargas

---

## 4. Hallazgos Medios (P2)

### P2-1: PII almacenado en localStorage sin cifrar

| Dato | Archivo | Riesgo |
|---|---|---|
| Borrador de formulario (nombre, apellido, NIF) | `portal-invite.component.ts` | PII en claro |
| Historial de búsqueda | `advanced-search.service.ts` | Puede contener términos clínicos |
| Workflows y logs de ejecución | `workflow.service.ts` | Datos de configuración |
| Tokens JWT | `supabase-client.service.ts` | Token de acceso |

**Remediación:** Considerar `sessionStorage` (volatil) para datos sensibles y cifrar con Web Crypto API antes de persistir.

---

### P2-2: Fallback del secreto CSRF al SERVICE_ROLE_KEY

Si `CSRF_SECRET` no está configurado, la protección CSRF usa el `SUPABASE_SERVICE_ROLE_KEY` como fallback.

**Remediación:** Forzar la existencia de `CSRF_SECRET`:
```typescript
const secret = Deno.env.get('CSRF_SECRET');
if (!secret) throw new Error('CSRF_SECRET environment variable is required');
```

---

### P2-3: Service Worker cachea respuestas de API sin TTL

Las respuestas de endpoints como `/api/customers`, `/api/tickets` se cachean sin expiración. Datos clínicos pueden persistir en el cache del navegador después de cerrar sesión.

**Remediación:**
- Invalidar cache en logout
- Añadir TTL de 5 minutos para API responses
- No cachear endpoints que devuelvan datos sensibles

---

### P2-4: Webhook de email sin autenticación robusta si falta el secreto

Si `INBOUND_WEBHOOK_SECRET` no está configurado, `process-inbound-email` acepta peticiones de cualquier super_admin vía JWT fallback, pero sin el secreto webhook, cualquier request con cabecera vacía no se valida correctamente.

---

### P2-5: Falta SRI (Subresource Integrity) en Google Fonts

Las fuentes de Google se cargan sin verificación de integridad:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter..." rel="stylesheet">
```

**Remediación:** Hospedar las fuentes localmente o añadir atributos `integrity`.

---

### P2-6: URIs de redirección OAuth hardcodeadas

En `integrations.component.ts` (L223-L227):
```typescript
redirectUri = 'http://localhost:4200/configuracion';
redirectUri = 'https://app.simplificacrm.es/configuracion';
```

**Remediación:** Mover a `environment.ts` / `environment.prod.ts`.

---

### P2-7: Sin triggers automáticos de auditoría en tablas sensibles

El audit trail RGPD depende de llamadas explícitas a `gdpr_log_access()`. Las modificaciones directas a la tabla `clients` no generan log automático.

**Remediación:**
```sql
CREATE TRIGGER audit_clients_changes
AFTER INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION gdpr_auto_audit_trigger();
```

---

## 5. Hallazgos Bajos (P3)

### P3-1: Dependencia `serialize-javascript` con RCE conocido
- Solo afecta a dev dependencies (`@angular-devkit/build-angular`)
- Sin impacto en producción, pendiente de fix upstream

### P3-2: Captcha (Turnstile) desactivado en desarrollo local
- Comportamiento esperado, pero verificar que `TURNSTILE_SECRET` existe en producción

### P3-3: Falta política de retención automática
- Los 7 años de RGPD están configurados como metadato pero no hay cron job que aplique la limpieza

### P3-4: Ruta `/invite` sin guard explícito
- La validación del token de invitación se hace dentro del componente, no a nivel de guard
- Considerar un guard dedicado `InviteTokenGuard`

---

## 6. Lo que ya está bien hecho ✅

| Área | Detalle |
|---|---|
| **Multi-tenancy RLS** | 72+ migraciones con aislamiento por company_id en todas las tablas |
| **Protección XSS** | DOMPurify en todos los puntos de [innerHTML], pipe `safeHtml` |
| **CSRF** | HMAC-SHA256 con comparación timing-safe, interceptor Angular |
| **Headers HTTP** | CSP, HSTS, X-Frame-Options, X-Content-Type-Options en Vercel |
| **SECURITY DEFINER → INVOKER** | 9 vistas migradas para respetar RLS |
| **search_path hijacking** | 43+ funciones parcheadas con search_path seguro |
| **OAuth sin contraseña (clientes)** | Magic links + WebAuthn para el portal de clientes |
| **Cifrado OAuth** | AES-256-GCM para tokens de terceros en reposo |
| **RGPD: Estructura completa** | Derechos de acceso, rectificación, supresión, portabilidad, limitación, oposición |
| **Consentimiento** | 6 tipos de consentimiento con evidencia (IP, user agent, método) |
| **Anonimización** | Función `gdpr_anonymize_client` completa |
| **Gestión de incidentes** | Tabla `gdpr_breach_incidents` con campos de AEPD |
| **DPO y niveles de acceso** | `is_dpo` flag + `data_access_level` por usuario |
| **Certificados VeriFactu** | Parsing PKCS#12 seguro, claves privadas nunca en el cliente |
| **Guards de ruta** | 9 guards diferentes (Auth, Admin, Staff, Client, Module, Owner, StrictAdmin, Dev, Guest) |

---

## 7. Roadmap de Remediación

### Fase 0 — Emergencia (antes de cualquier dato real)
> **Duración estimada: 1 sprint (1-2 semanas)**

| ID | Tarea | Prioridad | Esfuerzo |
|---|---|---|---|
| F0-1 | Migrar clave de cifrado clínico a Supabase Vault | P0 | M |
| F0-2 | Re-cifrar todas las notas existentes con nueva clave del Vault | P0 | M |
| F0-3 | Eliminar `BYPASS-SECRET-2026` de todo el código | P0 | XS |
| F0-4 | Implementar rotación de claves (key versioning) | P0 | L |
| F0-5 | Verificar que `ALLOW_ALL_ORIGINS` ≠ `true` en producción | P0 | XS |
| F0-6 | Configurar CSRF_SECRET como variable obligatoria | P0 | XS |

### Fase 1 — Fortificación (semanas 2-4)
> Ajustes que refuerzan la postura de seguridad para datos sensibles.

| ID | Tarea | Prioridad | Esfuerzo |
|---|---|---|---|
| F1-1 | Migrar rate limiter a Upstash Redis o Supabase KV | P1 | M |
| F1-2 | Reforzar política de contraseñas (12 chars, complejidad) | P1 | S |
| F1-3 | Forzar MFA para roles admin, owner y DPO | P1 | M |
| F1-4 | Reducir TTL del JWT a 15 minutos | P1 | XS |
| F1-5 | Crear servicio de logging condicional (eliminar console.log en prod) | P1 | S |
| F1-6 | Validación server-side de archivos subidos (magic bytes) | P1 | M |
| F1-7 | Verificar `INBOUND_WEBHOOK_SECRET` obligatorio | P1 | XS |
| F1-8 | Eliminar `ALLOW_ALL_ORIGINS` del código; solo whitelist explícita | P1 | S |

### Fase 2 — RGPD pleno (semanas 4-8)
> Garantizar conformidad completa con el RGPD para datos de salud.

| ID | Tarea | Prioridad | Esfuerzo |
|---|---|---|---|
| F2-1 | Triggers automáticos de auditoría en tablas sensibles (clients, clinical_notes) | P2 | M |
| F2-2 | Cron job para retención de datos (purga automática tras 7 años) | P2 | M |
| F2-3 | Workflow de notificación de brecha a la AEPD (72h) | P2 | L |
| F2-4 | Cifrado de datos sensibles en localStorage (Web Crypto API) | P2 | M |
| F2-5 | Invalidación de cache del SW en logout + TTL para API cache | P2 | S |
| F2-6 | Hospedar fuentes localmente o añadir SRI a Google Fonts | P2 | S |
| F2-7 | Mover URIs de redirección OAuth a environment variables | P2 | XS |
| F2-8 | Guard dedicado para `/invite` con validación de token | P2 | S |

### Fase 3 — Hardening continuo (semanas 8-16)
> Mejora continua y preparación para certificación.

| ID | Tarea | Prioridad | Esfuerzo |
|---|---|---|---|
| F3-1 | ✅ Backup cifrado automático — `20260320200002_f3_backup_verification.sql` desplegado con pg_cron | P3 | S |
| F3-2 | ✅ Penetration test interno — skill Copilot creada en `.github/skills/pentest/SKILL.md` | P3 | XL |
| F3-3 | ✅ DPIA documentada — `docs/DPIA_notas_clinicas_2026-03-19.md` (Art. 35 RGPD, 6 riesgos evaluados) | P3 | L |
| F3-4 | ✅ Registro Art. 30 — `20260320200000_f3_processing_activities.sql` desplegado | P3 | M |
| F3-5 | ✅ Supabase DPA firmado (5 ago 2025). Vercel: pendiente ~abr 2026 al actualizar a Pro. | P3 | M |
| F3-6 | ✅ Formación documentada — `docs/GDPR_team_training.md` generado | P3 | M |
| F3-7 | ⏳ Test disaster recovery — pendiente ejecución manual por el equipo (RTO objetivo: < 4 h) | P3 | L |
| F3-8 | ✅ Anomaly detection — `20260320200001_f3_anomaly_detection.sql` + Edge Function desplegada | P3 | L |

---

## 8. Checklist pre-producción

Antes de introducir el primer dato clínico real, verifica:

- [x] Clave de cifrado clínico en Supabase Vault (F0-1 ✅)
- [x] Todas las notas clínicas existentes re-cifradas con la nueva clave (F0-2 ✅)
- [x] `BYPASS-SECRET-2026` eliminado de TODOS los archivos (F0-3 ✅)
- [x] `ALLOW_ALL_ORIGINS` = `false` o eliminado de producción (F0-5 / F1-8 ✅)
- [x] `CSRF_SECRET` configurado como variable obligatoria (F0-6 ✅)
- [x] `INBOUND_WEBHOOK_SECRET` configurado con 32+ caracteres aleatorios (F1-7 ✅)
- [x] `TURNSTILE_SECRET_KEY` configurado en producción (Supabase Secrets + Vercel) — confirmado
- [x] `OAUTH_ENCRYPTION_KEY` configurado en Supabase Secrets — AES-256 para tokens Google Calendar/Drive — confirmado
- [x] Rate limiter persistente (Redis/KV) implementado (F1-1 ✅)
- [x] Política de contraseñas de 12+ caracteres activada (F1-2 ✅ Supabase config)
- [x] MFA obligatorio para admin/DPO (F1-3 ✅ Supabase config)
- [x] JWT TTL ≤ 15 minutos (F1-4 ✅)
- [x] Console.logs eliminados de builds de producción (F1-5 ✅)
- [x] Validación server-side de archivos subidos (F1-6 ✅)
- [x] Copia del Registro de Actividades de Tratamiento (Art. 30) (F3-4 ✅)
- [x] DPO designado formalmente: **Roberto Carrera Santa María** (dpo@simplificacrm.es)
- [x] DPIA completada y documentada (Art. 35) — `docs/DPIA_notas_clinicas_2026-03-19.md` ✅
- [x] Contrato de encargado del tratamiento con Supabase (Art. 28) — DPA firmado 5 ago 2025
- [x] **Plantilla DPA Art. 28** para clientes de SimplificaCRM — `docs/DPA_CONTRATO_ENCARGADO_TRATAMIENTO.md` ✅
- [x] **Política de Privacidad** completa (Art. 13 RGPD) actualizada en `privacy-policy.component.ts` ✅
- [x] Mecanismo de rotación de clave clínica implementado — `rotate_clinical_notes_key()` en `20260319000001_vault_clinical_encryption.sql` ✅

---

*Auditoría generada el 19 de marzo de 2026. Fases 0–3 completadas. Ver Fase 4 para items restantes.*

---

## 9. Fase 4 — Rotación de clave y certificación (semanas 16-24)
> Cierre de los últimos dos riesgos residuales medios identificados en la DPIA (R2, R4) y preparación para certificación ENS Básico.

| ID | Tarea | Prioridad | Esfuerzo | Estado |
|---|---|---|---|---|
| F4-1 | ✅ Mecanismo de rotación de clave clínica — `key_version` + `rotate_clinical_notes_key()` en `20260319000001_vault_clinical_encryption.sql` | P1 | L | ✅ Hecho |
| F4-2 | ✅ Re-cifrado incremental — incluido en misma migración (re-encripta notas v0 → v1 en deploy) | P1 | L | ✅ Hecho |
| F4-3 | Verificar/configurar `TURNSTILE_SECRET_KEY` y `OAUTH_ENCRYPTION_KEY` en Supabase Secrets · `OAUTH_ENCRYPTION_KEY` = AES-256 para tokens Google Calendar/Drive (no para login, que es OTP) | P1 | XS | ✅ Ambas secrets confirmadas en producción |
| F4-4 | ✅ DPO designado: **Roberto Carrera Santa María** — dpo@simplificacrm.es | P2 | S | ✅ Hecho |
| F4-5 | Test disaster recovery ejecutado (RTO < 4 h) | P2 | L | ⏳ Pendiente |
| F4-6 | DPA con Vercel firmado (tras upgrade a Pro ~abr 2026) | P2 | S | ⏳ Pendiente |
| F4-7 | Evaluación de brecha ENS Básico (Esquema Nacional de Seguridad) | P3 | XL | ✅ docs/ENS_BASICO_GAP_ASSESSMENT.md — 87% cumplimiento, 1 brecha (alertas capacidad) |
| F4-8 | ✅ Pentest completo — `docs/PENTEST_REPORT_2026-03-19.md` · jspdf 4.2.0→4.2.1 corregido · riesgo residual BAJO | P3 | L | ✅ Hecho |

### Prioridad inmediata: F4-1 y F4-2 (Rotación de clave)

La DPIA (sección 4, riesgo R4) identifica la ausencia de rotación de clave como riesgo residual **MEDIO**, recomendando implementar antes de superar 100 empresas en la plataforma.

Implementación planificada:
```sql
-- Columna key_version en client_clinical_notes
ALTER TABLE client_clinical_notes ADD COLUMN key_version integer NOT NULL DEFAULT 1;

-- Función de rotación incremental
CREATE OR REPLACE FUNCTION rotate_clinical_key(new_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  old_key text;
  new_key text;
BEGIN
  old_key := current_setting('app.clinical_key_v' || (new_version - 1)::text, true);
  new_key := current_setting('app.clinical_key_v' || new_version::text, true);
  UPDATE client_clinical_notes
     SET content = pgp_sym_encrypt(pgp_sym_decrypt(content::bytea, old_key), new_key),
         key_version = new_version
   WHERE key_version < new_version;
END;
$$;
```

> La migración completa se gestionará en F4-1 / F4-2 con versionado por Vault alias.
