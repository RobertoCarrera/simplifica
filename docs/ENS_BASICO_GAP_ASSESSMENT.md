# Evaluación de Brecha ENS Básico — SimplificaCRM
**Referencia:** F4-7 / SECURITY_AUDIT_2026-03-19  
**Normativa:** Real Decreto 311/2022 (ENS) · CCN-STIC 808 · CCN-TIC 028  
**Categoría objetivo:** **Básica** (datos de carácter personal no especialmente protegidos + datos de salud en módulo clínico)  
**Fecha de evaluación:** 19 de marzo de 2026  
**Responsable:** Roberto Carrera Santa María — dpo@simplificacrm.es  
**Estado:** Evaluación completada — con plan de cierre de brechas

> **Nota de aplicabilidad:** El ENS es de obligado cumplimiento para entidades del sector público
> español y sus encargados de tratamiento. Si SimplificaCRM procesa datos para clientes del sector
> público (ayuntamientos, centros sanitarios públicos, etc.) debe acreditarse. Para clientes
> privados, el ENS actúa como **marco de referencia de buenas prácticas** y diferenciador comercial.

---

## Resumen ejecutivo

| Dominio ENS | Controles evaluados | Cumple | Parcial | Brecha |
|---|:-:|:-:|:-:|:-:|
| Marco organizativo (org) | 4 | 3 | 1 | 0 |
| Marco operacional — planificación (op.pl) | 4 | 3 | 0 | 1 |
| Marco operacional — control acceso (op.acc) | 5 | 5 | 0 | 0 |
| Marco operacional — explotación (op.exp) | 6 | 5 | 1 | 0 |
| Marco operacional — continuidad (op.cont) | 2 | 1 | 1 | 0 |
| Medidas de protección — datos (mp.info) | 4 | 4 | 0 | 0 |
| Medidas de protección — servicios (mp.s) | 3 | 3 | 0 | 0 |
| Medidas de protección — comunicaciones (mp.com) | 3 | 3 | 0 | 0 |
| **TOTAL** | **31** | **27** | **3** | **1** |

**Resultado global: 87% de controles cumplidos. 1 brecha abierta (F-ENS-B1). 3 controles parciales.**

---

## 1. Marco organizativo

### org.1 — Política de seguridad
**Estado: ✅ CUMPLE**  
- `SECURITY_AUDIT_2026-03-19.md` constituye la política de seguridad documentada.
- `docs/GDPR_team_training.md` documenta obligaciones del personal.
- Responsable de seguridad identificado (Roberto Carrera Santa María).

### org.2 — Normativa de seguridad
**Estado: ✅ CUMPLE**  
- Normas de uso aceptable implícitas en términos de servicio de la plataforma.
- Política de contraseñas: OTP (sin contraseña almacenada) + MFA obligatorio para roles admin/owner.
- **Recomendación:** formalizar en un documento breve de "Normas de uso" que los clientes firmen.

### org.3 — Procedimientos de seguridad
**Estado: ✅ CUMPLE**  
- Procedimiento de gestión de brechas: `gdpr_breach_incidents` + trigger de notificación automática.
- Procedimiento de backup: `20260320200002_f3_backup_verification.sql`.
- Procedimiento de rotación de claves: `rotate_clinical_notes_key()`.

### org.4 — Proceso de autorización
**Estado: 🟡 PARCIAL**  
- Sistema de roles implementado (`app_roles`, `is_super_admin`, `is_dpo`).
- RLS multi-tenant en PostgreSQL.
- **Brecha parcial:** No existe un proceso formal documentado de alta/baja de accesos (cuando un empleado de un cliente deja la organización, ¿existe un SLA para revocar acceso?). La revocación técnica funciona, falta el procedimiento.
- **Acción:** Añadir en los términos de servicio la obligación del cliente de notificar bajas de personal en <24h.

---

## 2. Marco operacional — Planificación (op.pl)

### op.pl.1 — Análisis de riesgos
**Estado: ✅ CUMPLE**  
- DPIA Art.35 RGPD en `docs/DPIA_notas_clinicas_2026-03-19.md` cubre el módulo de mayor riesgo.
- Riesgos R1–R6 identificados, con probabilidad, impacto y medidas residuales.

### op.pl.2 — Arquitectura de seguridad
**Estado: ✅ CUMPLE**  
- Separación frontend (Vercel) / BFF (Edge Functions Deno) / base de datos (Supabase).
- Cifrado en tránsito (TLS 1.2+ forzado por Vercel y Supabase).
- Cifrado en reposo para datos clínicos (AES-GCM via `pgp_sym_encrypt` + Vault).

### op.pl.3 — Adquisición de nuevos componentes
**Estado: ✅ CUMPLE**  
- Gestión de dependencias por `pnpm` con auditoría (`pnpm audit`).
- Pentest automatizado con skill Copilot antes de cada release mayor.
- jsPDF actualizado a 4.2.1 tras detección de CVE crítico.

### op.pl.5 — Gestión de capacidades
**Estado: ❌ BRECHA — F-ENS-B1**  
- No existe documentación formal de límites de capacidad ni alertas de uso.
- Supabase tiene límites de Plan (storage, conexiones, invocaciones Edge Function).
- **Acción requerida:** Configurar alertas en Supabase Dashboard (Usage > Alerts) para:
  - Almacenamiento DB > 80%
  - Edge Function invocations > 80% del plan
  - Storage bucket > 80%
  - Configurar `CHECK_INTERVAL` en el cron de anomaly detection (`20260320200001`) para alertar también sobre volumen anómalo de operaciones.

---

## 3. Marco operacional — Control de acceso (op.acc)

### op.acc.1 — Identificación
**Estado: ✅ CUMPLE**  
- Autenticación via Supabase Auth (OTP por email) — sin contraseñas almacenadas.
- Cada usuario tiene UUID único en `auth.users`.

### op.acc.2 — Requisitos de acceso
**Estado: ✅ CUMPLE**  
- RLS en PostgreSQL garantiza que cada tenant solo accede a sus datos.
- `company_members` como tabla pivot de autorización.
- `app_roles` con roles definidos (owner, admin, member, viewer).

### op.acc.3 — Segregación de funciones
**Estado: ✅ CUMPLE**  
- `is_super_admin` requerido para operaciones de rotación de clave.
- `is_dpo` requerido para exportación de datos clínicos.
- SECURITY DEFINER en funciones sensibles.

### op.acc.4 — Proceso de gestión de derechos de acceso
**Estado: ✅ CUMPLE**  
- Invitaciones por token firmado (`send-client-consent-invite`).
- Revocación inmediata al eliminar de `company_members`.

### op.acc.5 — Mecanismo de autenticación
**Estado: ✅ CUMPLE**  
- OTP (magic link por email) — NIST SP 800-63B nivel AAL1.
- MFA obligatorio para roles admin/owner — nivel AAL2.
- Rate limiting en Edge Functions (Deno KV, ventana deslizante).
- CSRF tokens HMAC para mutaciones.

---

## 4. Marco operacional — Explotación (op.exp)

### op.exp.1 — Inventario de activos
**Estado: ✅ CUMPLE**  
- Registro de actividades de tratamiento: `processing_activities` (Art. 30 RGPD).
- Tablas de datos catalogadas implícitamente en `20260320200000_f3_processing_activities.sql`.

### op.exp.2 — Configuración de seguridad
**Estado: ✅ CUMPLE**  
- Variables de entorno en Supabase Secrets (nunca en código fuente).
- CSP, HSTS, X-Frame-Options en `vercel.json`.
- CORS restringido a orígenes autorizados en producción.

### op.exp.3 — Gestión de la configuración
**Estado: ✅ CUMPLE**  
- Migraciones SQL versionadas y ordenadas por timestamp.
- `pnpm-lock.yaml` fija versiones exactas de dependencias.
- `deno.land/std@0.168.0` con pin de versión completo en algunas funciones.

### op.exp.4 — Mantenimiento y actualizaciones
**Estado: 🟡 PARCIAL**  
- `pnpm audit` ejecutado en pentest; CVE crítico de jsPDF corregido el mismo día.
- **Parcial:** No hay un proceso automatizado de alerta de CVEs en CI/CD.
- **Acción recomendada:** Añadir `pnpm audit --audit-level high` como paso de CI en GitHub Actions y que falle el build si hay vulnerabilidades high/critical.

### op.exp.7 — Gestión de incidentes
**Estado: ✅ CUMPLE**  
- `gdpr_breach_incidents` con deadline de notificación AEPD automático.
- Anomaly detection activo (`gdpr_anomaly_detection_trigger`).
- Logs de auditoría en `gdpr_audit_log` con retención 10 años.

### op.exp.10 — Protección frente a código malicioso
**Estado: ✅ CUMPLE**  
- DOMPurify en todos los `[innerHTML]` del frontend Angular.
- CSP sin `unsafe-inline` para scripts.
- Validación de entrada con Zod en Edge Functions públicas.

---

## 5. Marco operacional — Continuidad (op.cont)

### op.cont.1 — Análisis de impacto
**Estado: 🟡 PARCIAL**  
- RTO objetivo: <4h (mencionado en auditoría, no documentado formalmente).
- RPO objetivo: no documentado.
- **Acción:** Documentar RTO/RPO formalmente. Sugerencia: RTO 4h, RPO 24h (backup diario Supabase).

### op.cont.2 — Plan de continuidad
**Estado: ✅ CUMPLE (estructura)**  
- Backup automático diario por Supabase (Point-in-Time Recovery disponible).
- Función `verify_backup_integrity()` en `20260320200002_f3_backup_verification.sql`.
- **Pendiente (usuario):** Ejecutar el drill F4-5 para validar RTO real.

---

## 6. Medidas de protección — Datos (mp.info)

### mp.info.1 — Datos de carácter personal
**Estado: ✅ CUMPLE**  
- DPIA elaborada y aprobada.
- Funciones de derechos del interesado: acceso, rectificación, supresión, portabilidad.
- Registro de tratamiento Art. 30 RGPD implementado.

### mp.info.3 — Cifrado
**Estado: ✅ CUMPLE**  
- Notas clínicas: `pgp_sym_encrypt` AES-256 + Vault (`clinical_encryption_key_v1`).
- Tokens Google Calendar/Drive: AES-256-GCM via `crypto-utils.ts` + `OAUTH_ENCRYPTION_KEY`.
- Datos en tránsito: TLS 1.2+ (Vercel + Supabase).
- localStorage sensible: AES-GCM (Web Crypto API), clave en sessionStorage.

### mp.info.4 — Firma electrónica
**Estado: ✅ CUMPLE (nivel requerido)**  
- CSRF tokens HMAC-SHA256 para integridad de peticiones.
- JWT Supabase firmados (RS256) para autenticación.

### mp.info.6 — Limpieza de información
**Estado: ✅ CUMPLE**  
- `gdpr_anonymize_client()` borra/anonimiza datos personales.
- `gdpr_enforce_retention()` purga datos según plazos legales.
- Notas clínicas eliminadas en anonimización (no sólo anonimizadas, dada sensibilidad Art. 9).

---

## 7. Medidas de protección — Servicios (mp.s)

### mp.s.1 — Protección del correo electrónico
**Estado: ✅ CUMPLE**  
- Email transaccional via AWS SES.
- SPF/DKIM gestionados por AWS SES (implícito en configuración de dominio).
- No almacenamiento de contenido de emails en base de datos (sólo metadatos de envío).

### mp.s.2 — Protección de servicios y aplicaciones web
**Estado: ✅ CUMPLE**  
- WAF implícito en Vercel (Edge Network).
- Rate limiting en Edge Functions críticas.
- Validación de entrada (Zod) en endpoints públicos.
- Cabeceras de seguridad completas.

### mp.s.8 — Protección frente a denegación de servicio
**Estado: ✅ CUMPLE**  
- Deno KV rate limiter resistente a cold starts.
- Cloudflare Turnstile en booking público.
- Supabase maneja escalado automático de conexiones.

---

## 8. Medidas de protección — Comunicaciones (mp.com)

### mp.com.1 — Uso de redes inseguras
**Estado: ✅ CUMPLE**  
- 0 llamadas `fetch('http://...')` en Edge Functions (verificado en pentest).
- HSTS `max-age=31536000; includeSubDomains` forzado por Vercel.

### mp.com.2 — Protección de la confidencialidad
**Estado: ✅ CUMPLE**  
- TLS extremo a extremo.
- Datos clínicos cifrados en la capa de base de datos (doble cifrado: TLS + AES-256).

### mp.com.3 — Protección de la autenticidad y la integridad
**Estado: ✅ CUMPLE**  
- JWT firmados (RS256) para todas las sesiones.
- CSRF tokens HMAC para mutaciones de estado.
- Verificación de webhook PayPal con firma HMAC.

---

## 9. Brecha abierta

### F-ENS-B1 — Alertas de capacidad no configuradas (op.pl.5)
**Normativa:** CCN-STIC 808 Anexo II · op.pl.5  
**Impacto:** Sin alertas de capacidad, el servicio podría degradarse o caer sin previo aviso al agotar cuotas del plan Supabase, afectando disponibilidad (dimensión de seguridad D del ENS).  
**Remediación:**

1. En Supabase Dashboard → Settings → Billing → Usage alerts: configurar alertas al 80% en DB, storage y Edge Function invocations.
2. Habilitar notificaciones por email a `dpo@simplificacrm.es` y al email de infraestructura.
3. Revisar mensualmente en el cron de anomaly detection el volumen de `gdpr_audit_log` para detectar ataques de scraping.

**Esfuerzo estimado:** 30 minutos (configuración de alertas en dashboard).  
**Plazo recomendado:** Antes de aceptar clientes del sector público.

---

## 10. Controles parciales — Plan de cierre

| Control | Gap parcial | Acción | Plazo |
|---|---|---|---|
| org.4 — Proceso de autorización | Procedimiento de baja de usuarios no formalizado | Añadir SLA de baja (<24h) a términos de servicio | Q2 2026 |
| op.exp.4 — Actualizaciones | Sin `pnpm audit` en CI/CD | Añadir paso en GitHub Actions | Q2 2026 |
| op.cont.1 — Análisis de impacto | RTO/RPO no documentados | Documentar RTO=4h, RPO=24h en política de continuidad | Q2 2026 |

---

## 11. Declaración de adecuación

Con los controles implementados a fecha 19 de marzo de 2026, SimplificaCRM cumple **27 de 31
controles ENS Básico** evaluados (87%). La única brecha abierta (F-ENS-B1 — alertas de
capacidad) es de bajo impacto operativo y no compromete la confidencialidad ni la integridad
de los datos.

La plataforma está **en condiciones de iniciar el proceso de certificación ENS Básico** ante
un organismo de certificación acreditado (ENAC), condicionado al cierre de F-ENS-B1 y a la
ejecución del drill de disaster recovery (F4-5).

**Firmado:** Roberto Carrera Santa María  
**Cargo:** Delegado de Protección de Datos / Responsable de Seguridad  
**Email:** dpo@simplificacrm.es  
**Fecha:** 19 de marzo de 2026
