# Auditoría RGPD Independiente + Roadmap de Securización
**Referencia:** RGPD-AUDIT-2026-04-06  
**Fecha:** 2026-04-06  
**Metodología:** OWASP WSTG 4.2 + RGPD Art. 5-44 + ENS Básico  
**Alcance:** SimplificaCRM (Angular 21 SSR, ~40 Edge Functions Deno, PostgreSQL/Supabase, portales público/agenda)  
**Auditor:** GitHub Copilot (análisis estático completo del código fuente)  
**Contexto:** Auditoría independiente + cross-reference con auditoría externa recibida

---

## Resumen ejecutivo

Se realizó una auditoría RGPD completa de caja blanca cubriendo **19 controles** agrupados en 3 dominios: consentimiento y derechos (7 controles), seguridad técnica (12 controles). La auditoría se cruzó con la auditoría externa proporcionada, identificando **2 errores factuales** en la auditoría externa y **confirmando 4 hallazgos** legítimos.

### Resultado global

| Categoría | Controles | ✅ PASS | ⚠️ PARCIAL | ❌ FAIL |
|-----------|-----------|---------|-------------|---------|
| Consentimiento y Derechos | 7 | 5 | 2 | 0 |
| Seguridad Técnica | 12 | 7 | 2 | 3 |
| **TOTAL** | **19** | **12** | **4** | **3** |

### Hallazgos críticos (P0)

1. **DPA no incluye Docplanner/Doctoralia como sub-encargado** — Art. 28(4) RGPD
2. **`form_responses` en bookings sin cifrar y sin validación de consentimiento** — Art. 32 + Art. 6

---

## Parte 1 — Auditoría Independiente

### DOMINIO A: Consentimiento y Derechos ARCO

#### A1. Granularidad del consentimiento ✅ PASS

**Evidencia:** `gdpr_consent_records` con 5 tipos: `data_processing`, `health_data`, `marketing`, `third_party_sharing`, `clinical_notes`. Cada tipo se registra individualmente con evidencia (IP, user-agent, método).

**Nota:** `marketing_consent` tiene default `false` (opt-in correcto según Art. 7). La auditoría externa puntuó esto como 5.5/10 alegando "consentimiento agrupado por defecto" — **INCORRECTO**, el marketing es opt-in explícito.

#### A2. Registro de consentimiento ✅ PASS

**Evidencia:** Tabla `gdpr_consent_records` con campos: `consent_type`, `granted`, `granted_at`, `evidence_ip`, `evidence_user_agent`, `consent_method`, `withdrawn_at`, `withdrawal_method`, `withdrawal_evidence`, `is_active` (generado). Cumple Art. 7(1) para demostrar consentimiento.

#### A3. Retirada de consentimiento ⚠️ PARCIAL

**Evidencia:** Backend `withdrawConsent()` implementado en `gdpr-customer-manager.component.ts`. Schema soporta `withdrawn_at`, `withdrawal_method`, `withdrawal_evidence`.

**Gap:** Solo accesible desde panel admin. **NO existe UI de autoservicio en el portal del paciente** para retirar consentimiento (Art. 7(3): "será tan fácil retirar el consentimiento como darlo"). La auditoría externa acertó aquí.

#### A4. Derechos ARCO completos ✅ PASS

**Evidencia:**
- **Acceso:** `gdpr_export_client_data(uuid)` — exporta JSON completo
- **Rectificación:** Edición directa en UI de clientes
- **Supresión/Olvido:** `gdpr_anonymize_client(uuid)` — anonimización irreversible
- **Portabilidad:** Exportación JSON incluye todos los datos
- **Limitación:** `restrictProcessing()` en `gdpr-customer-manager`
- **Solicitudes:** `gdpr_access_requests` con tracking de estado y deadlines

#### A5. Portal de autoservicio para titulares ⚠️ PARCIAL

**Gap:** Los derechos ARCO solo son ejercitables por admin. **No existe portal de autoservicio** para que el titular de datos ejerza directamente sus derechos (acceso, descarga, supresión). Riesgo medio-alto: el Art. 12 RGPD requiere "facilitar el ejercicio de derechos".

#### A6. Datos de salud (categoría especial) ✅ PASS

**Evidencia:**
- Notas clínicas cifradas AES-256 vía Supabase Vault (`clinical_encryption_key_v1`)
- Key versionado con columna `key_version` y función `rotate_clinical_notes_key()`
- `ConsentGate` en portal bloquea guardado sin consentimiento explícito `health_data`
- Portal BFF rechaza actualizaciones de `health_data_consent` vía API (solo admin)

#### A7. Retención de datos ✅ PASS

**Evidencia:** `gdpr_enforce_retention()` vía pg_cron mensual:
- Clientes sin actividad > 7 años → anonimización automática
- Audit log > 10 años → purga (mínimo legal Art. 5(1)(e))
- Breach incidents resueltos > 5 años → purga
- La auditoría externa dijo "security_audit_log sin retención" — **INCORRECTO**, existe política de 10 años.

---

### DOMINIO B: Seguridad Técnica (OWASP + Art. 32)

#### B1. Autenticación MFA ⚠️ PARCIAL

**Evidencia:** WebAuthn/Passkey implementado con enrollment, verificación AAL2, backup codes con rate limiting (5 intentos/10 min) y expiración.

**Gap:** MFA es **opcional**. El guard devuelve `true` si no existe nivel MFA. **No hay enforcement por rol** — ni super_admin ni owner están obligados a activarlo.

#### B2. `form_responses` en bookings ❌ FAIL — CRÍTICO

**Evidencia:** Campo `form_responses: Json | null` en tabla `bookings` (migración `20260110210000_create_booking_system.sql`). Tipo `Json` sin cifrar.

**Gaps:**
- Almacenado como JSONB en texto plano (no usa Vault como las notas clínicas)
- Sin trigger ni RLS que valide consentimiento antes de INSERT/UPDATE
- Si se almacenan respuestas de formularios de salud → violación Art. 32 + Art. 9

**Nota:** La auditoría externa acertó en este punto.

#### B3. Docplanner como sub-encargado ❌ FAIL — CRÍTICO (P0)

**Evidencia:** Integración DocPlanner operativa desde 2026-04-05 (OAuth, sync de doctores, citas). `docs/DPA_CONTRATO_ENCARGADO_TRATAMIENTO.md` sección 6 lista sub-encargados: Supabase, Vercel, AWS SES, Google OAuth. **Docplanner/Doctoralia NO aparece.**

**Riesgo legal:** Art. 28(4) RGPD requiere autorización PREVIA por escrito del responsable antes de contratar un nuevo sub-encargado. La integración ya está activa sin esta autorización.

La auditoría externa acertó en este punto.

#### B4. CORS y Security Headers ✅ PASS

**Evidencia:** CORS restrictivo sin wildcard en producción, CSP sin `unsafe-inline`, HSTS con preload, X-Frame-Options: DENY, X-Content-Type-Options: nosniff.

#### B5. Rate Limiting ✅ PASS

**Evidencia:** Upstash Redis (distribuido) con fallback in-memory. Fixed-window, key prefixing, fail-open intencional.

#### B6. CSRF Protection ✅ PASS

**Evidencia:** HMAC-based con timing-safe comparison, token con expiración 1h, `CSRF_SECRET` requerido (error si falta, sin fallback).

#### B7. Service Worker y Caché ✅ PASS

**Evidencia:** TTL 5min en API cache, logout limpia caches, runtime-config excluido (`no-store`), datos clínicos nunca cacheados.

#### B8. Alertas de anomalías de seguridad ⚠️ PARCIAL

**Evidencia:** `security-anomaly-alerts` Edge Function implementada (lee `gdpr_anomalies`, envía email por severidad). Estado de despliegue en producción por verificar.

#### B9. Retención de audit log ✅ PASS

**Evidencia:** 10 años audit log, 7 años clientes, 5 años breaches resueltos. pg_cron mensual automatizado.

#### B10. Decisiones automatizadas ✅ N/A

No se detectó sistema de profiling o decisiones automatizadas. Si se implementa asignación automática de profesionales, necesitará aviso Art. 22.

#### B11. Aviso de privacidad en registro ❌ FAIL

**Evidencia:** No se encontró modal/página de privacidad durante el flujo de registro de usuario. El tracking de consentimiento de marketing existe para **clientes** pero no para **usuarios** del sistema.

**Gap:** Art. 13/14 RGPD requiere informar al titular en el momento de recogida de datos.

#### B12. Secretos hardcoded ✅ PASS

**Evidencia:** Todos los secretos via `Deno.env.get()`. Vault para encryption keys. Key legacy solo en migraciones históricas (reemplazada por Vault en 2026-03-19).

#### B13. RLS en tablas GDPR ✅ PASS

**Evidencia:** RLS habilitado con políticas company-scoped en: `gdpr_audit_log`, `gdpr_consent_records`, `gdpr_breach_incidents`, `gdpr_access_requests`, `client_clinical_notes`.

---

## Parte 2 — Cross-Reference con Auditoría Externa

| Claim de la auditoría externa | Mi hallazgo | Veredicto |
|-------------------------------|-------------|-----------|
| "Consentimiento marketing agrupado por defecto" | `marketing_consent` default `false`, opt-in explícito, 5 tipos granulares | ❌ **INCORRECTO** — el consent es granular y opt-in |
| "Retirada de consentimiento sin UI" | Backend existe pero solo admin UI, no portal de autoservicio | ✅ **CORRECTO** — gap real Art. 7(3) |
| "MFA no obligatorio" | MFA implementado pero opcional, sin enforcement por rol | ✅ **CORRECTO** — gap real |
| "form_responses sin cifrar" | Campo existe en `bookings`, almacenado como JSONB sin cifrar | ✅ **CORRECTO** — gap real Art. 32 |
| "Docplanner no está en DPA" | DPA lista 4 sub-encargados, Docplanner ausente | ✅ **CORRECTO** — gap crítico Art. 28(4) |
| "security_audit_log sin retención" | `gdpr_enforce_retention()` purga > 10 años vía pg_cron | ❌ **INCORRECTO** — retención de 10 años activa |

### Puntuaciones corregidas vs auditoría externa

La auditoría externa (donde visible) subestimó áreas donde Simplifica ya tiene controles robustos:
- **Consentimiento:** La granularidad real (5 tipos, opt-in marketing, withdrawal tracking) es superior a lo que la externa evaluó
- **Retención:** La política automatizada de retención es más madura de lo reportado
- **Cifrado de datos de salud:** La migración a Vault (AES-256 + key rotation) no fue reconocida

---

## Parte 3 — Roadmap de Securización

### Fase 0: Pre-requisitos legales (ANTES de importar pacientes Doctoralia) 🔴

| # | Acción | Artículo | Esfuerzo | Responsable |
|---|--------|----------|----------|-------------|
| 0.1 | **Actualizar DPA** para incluir Docplanner/Doctoralia como sub-encargado | Art. 28(4) | 1 día legal + 1h código | Legal + Dev |
| 0.2 | Notificar a clientes existentes del nuevo sub-encargado (si DPA requiere autorización previa) | Art. 28(2) | 1 día | Legal |
| 0.3 | Obtener firma/aceptación del DPA actualizado | Art. 28(3) | Variable | Legal |

**⛔ BLOQUEANTE:** No importar datos de pacientes de Doctoralia hasta completar 0.1-0.3.

---

### Fase 1: Crítica — Seguridad de datos (Semana 1) 🟠

| # | Acción | Artículo | Esfuerzo | Detalle |
|---|--------|----------|----------|---------|
| 1.1 | **Cifrar `form_responses`** en bookings con Vault | Art. 32 | 4h | Crear función `encrypt_form_responses()` SECURITY DEFINER, trigger on INSERT/UPDATE. Decrypt vía `gdpr_decrypt_booking_form(id)` |
| 1.2 | **Añadir validación de consentimiento** antes de almacenar `form_responses` | Art. 6, Art. 9 | 2h | Trigger que verifica `gdpr_consent_records.data_processing = granted` para el customer |
| 1.3 | **Verificar deployment** de `security-anomaly-alerts` en producción | Art. 32 | 30min | Comprobar función desplegada + `INTERNAL_FUNCTION_SECRET` seteado + cron activo |

---

### Fase 2: Alta prioridad — Compliance gaps (Semanas 2-3) 🟡

| # | Acción | Artículo | Esfuerzo | Detalle |
|---|--------|----------|----------|---------|
| 2.1 | **MFA obligatorio para roles admin/owner/super_admin** | Art. 32 | 4h | Modificar auth guard: si `role ∈ [owner, admin, super_admin]` y `currentLevel !== 'aal2'` → forzar enrollment. Agregar SECURITY DEFINER que rechace operaciones sensibles sin AAL2 |
| 2.2 | **UI de retirada de consentimiento en portal** | Art. 7(3) | 8h | Componente en `simplifica-portal-frontend` que permita al paciente retirar consentimiento individualmente (per-type). Reutilizar `withdrawConsent()` del backend |
| 2.3 | **Aviso de privacidad en registro de usuario** | Art. 13/14 | 4h | Modal en `register.component.ts` con: finalidad, base legal, derechos, identidad del responsable. Tracking de aceptación en `users.privacy_policy_accepted_at` |
| 2.4 | **Alertas automáticas DPO** para solicitudes ARCO vencidas | Art. 12(3) | 3h | pg_cron diario que detecte `gdpr_access_requests` con `deadline < now() AND status = 'pending'` → email al DPO |

---

### Fase 3: Mejoras — Madurez del sistema (Mes 2) 🟢

| # | Acción | Artículo | Esfuerzo | Detalle |
|---|--------|----------|----------|---------|
| 3.1 | **Portal de autoservicio ARCO** para titulares | Art. 12, 15-20 | 20h | Portal donde pacientes pueden: ver sus datos (derecho acceso), descargar (portabilidad), solicitar supresión. En `simplifica-portal-frontend` |
| 3.2 | **Pin de versión parche en imports Deno** | Best practice | 2h | Estandarizar todos los imports de Edge Functions a versión parche exacta (`@2.39.7`), usar `import_map.json` |
| 3.3 | **Documentar política de decisiones automatizadas** | Art. 22 | 2h | Preparar template de aviso para cuando se implemente asignación automática de profesionales |
| 3.4 | **Test E2E de flujos RGPD** | Art. 32 | 8h | Automated tests: consent grant/withdraw, ARCO export, anonymization, breach notification |

---

### Fase 4: Mantenimiento continuo 🔵

| Acción | Frecuencia |
|--------|------------|
| Revisar sub-encargados en DPA ante nuevas integraciones | Cada integración |
| Audit de dependencias (`pnpm audit`) | Semanal |
| Verificar ejecución de pg_cron de retención | Mensual |
| Simulacro de breach response (72h notification) | Trimestral |
| Revisión de consentimientos activos vs. retirados | Trimestral |
| Actualización de privacy policy ante cambios de procesamiento | Ad-hoc |

---

## Resumen de controles

```
✅ PASS (12/19):
   Granularidad consentimiento, Registro consentimiento, Derechos ARCO,
   Datos de salud cifrados, Retención, CORS/Headers, Rate Limiting,
   CSRF, Service Worker, Audit log retention, Secretos, RLS

⚠️ PARCIAL (4/19):
   Retirada consentimiento (sin self-service), Portal autoservicio ARCO,
   MFA (opcional), Alertas anomalías (deployment por verificar)

❌ FAIL (3/19):
   DPA sin Docplanner (P0), form_responses sin cifrar (P1),
   Aviso privacidad en registro (P2)

Errores en auditoría externa: 2/6 claims verificados como incorrectos
   - Consentimiento marketing NO está agrupado (es granular opt-in)
   - Retención de audit log SÍ existe (10 años con pg_cron)
```

---

## Apéndice: Archivos clave referenciados

| Archivo | Relevancia |
|---------|------------|
| `supabase/migrations/20260320100001_f2_data_retention_cron.sql` | Política de retención |
| `supabase/migrations/20260319000001_vault_clinical_encryption.sql` | Cifrado Vault |
| `supabase/migrations/20260322100003_mfa_backup_codes_expiry_and_ratelimit.sql` | MFA backup codes |
| `supabase/migrations/20260110210000_create_booking_system.sql` | form_responses sin cifrar |
| `docs/DPA_CONTRATO_ENCARGADO_TRATAMIENTO.md` | DPA con sub-encargados |
| `supabase/functions/_shared/cors.ts` | CORS restrictivo |
| `supabase/functions/_shared/csrf-protection.ts` | CSRF timing-safe |
| `supabase/functions/_shared/rate-limiter.ts` | Rate limiting Redis |
| `supabase/functions/security-anomaly-alerts/index.ts` | Alertas de seguridad |
| `simplifica-crm/src/app/features/customers/gdpr-customer-manager/` | UI GDPR admin |
