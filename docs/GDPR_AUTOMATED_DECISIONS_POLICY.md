# Política de Decisiones Automatizadas y Elaboración de Perfiles

**Referencia:** RGPD Art. 22 — Decisiones individuales automatizadas, incluida la elaboración de perfiles

**Versión:** 1.0  
**Fecha de elaboración:** 2026-04-06  
**Responsable del tratamiento:** [Razón social de la empresa]  
**DPO / Punto de contacto:** [email del DPD o contacto RGPD]

---

## 1. Objeto y ámbito de aplicación

Este documento describe las decisiones o procesos automatizados implementados en **Simplifica CRM** que puedan tener efectos jurídicos o que afecten significativamente a los interesados, conforme a lo establecido en el **artículo 22 del RGPD**.

A efectos de este documento se consideran «decisiones automatizadas» aquellas adoptadas exclusivamente mediante tratamiento automatizado, sin intervención humana significativa, y que produzcan efectos jurídicos o incidan de manera análoga y significativa en la persona interesada.

---

## 2. Inventario de procesos automatizados

### 2.1. Validación de consentimiento en la creación de reservas

| Campo                  | Detalle |
|------------------------|---------|
| **Proceso**            | Trigger PostgreSQL `trg_validate_booking_consent` en `public.bookings` |
| **¿Decisión Art. 22?** | **No** — acción no bloqueante; registra aviso en `gdpr_audit_log` y aplica base legal alternativa Art. 6.1.b |
| **Efecto**             | Registro de auditoría; la reserva se crea igualmente |
| **Fundamento**         | Art. 6.1.b (ejecución de contrato) como base de fallback |
| **Revisión humana**    | No aplica (proceso no bloquea) |
| **Fichero**            | `supabase/migrations/20260406000002_booking_consent_trigger.sql` |

### 2.2. Detección automática de anomalías de seguridad

| Campo                  | Detalle |
|------------------------|---------|
| **Proceso**            | Función `gdpr_detect_anomalies()` — ejecución cada 30 minutos vía `pg_cron` |
| **¿Decisión Art. 22?** | **No** — genera alertas internas para revisión; no adopta decisiones sobre interesados |
| **Efecto sobre interesados** | Ninguno directo; el DPD/responsable recibe una alerta por email para revisión manual |
| **Tipo de anomalías detectadas** | Exportaciones masivas, acceso en horario fuera de oficina, ausencia de consentimiento, reintentos de autenticación fallidos |
| **Fundamento**         | Art. 6.1.f (interés legítimo — seguridad de los sistemas) |
| **Revisión humana**    | **Sí** — toda alerta requiere revisión y decisión por el DPD o responsable de seguridad antes de tomar ninguna acción |
| **Fichero**            | `supabase/migrations/20260320200001_f3_anomaly_detection.sql`, `supabase/functions/security-anomaly-alerts/` |

### 2.3. Alertas por solicitudes ARCO vencidas

| Campo                  | Detalle |
|------------------------|---------|
| **Proceso**            | Función `detect_overdue_arco_requests()` — ejecución diaria a las 08h00 UTC |
| **¿Decisión Art. 22?** | **No** — genera registros de anomalía y alerta; el DPD decide la acción |
| **Efecto sobre interesados** | Ninguno directo; el DPD recibe notificación para dar respuesta a la solicitud en plazo |
| **Fundamento**         | Art. 6.1.c (obligación legal — Art. 12(3) RGPD) |
| **Revisión humana**    | **Sí** — el DPD revisa y actúa sobre cada solicitud individualmente |
| **Fichero**            | `supabase/migrations/20260406000004_arco_overdue_dpo_alerts.sql` |

---

## 3. Ausencia de decisiones plenamente automatizadas con efectos significativos

A la fecha de este documento, **Simplifica CRM no implementa ninguna decisión plenamente automatizada** (Art. 22.1 RGPD) que:

- Produzca efectos jurídicos sobre los interesados (p.ej., denegación de un servicio, crédito o acceso); o
- Les afecte de manera significativa y similar (p.ej., perfilado comercial, scoring de riesgo).

Si en el futuro se introdujera algún proceso de este tipo, se deberá:

1. Realizar una **Evaluación de Impacto de Protección de Datos (EIPD/DPIA)** previa.
2. Implementar una de las excepciones del Art. 22.2:
   - Consentimiento explícito del interesado; o
   - Necesidad de celebrar/ejecutar un contrato; o
   - Autorización legal expresa.
3. Garantizar el **derecho de intervención humana**, a impugnar la decisión y a expresar el punto de vista del interesado.
4. Actualizar este documento y el Registro de Actividades de Tratamiento.

---

## 4. Derechos relacionados con el tratamiento automatizado

Los interesados cuyos datos sean objeto de cualquiera de los procesos descritos en el §2 tienen derecho a:

| Derecho           | Base legal | Cómo ejercerlo |
|-------------------|------------|----------------|
| Acceso (Art. 15)  | RGPD       | Sección "Mis datos" en el portal cliente, o email al DPD |
| Rectificación (Art. 16) | RGPD | Sección "Mis datos" o email al DPD |
| Supresión (Art. 17) | RGPD    | Sección "Mis datos" o email al DPD |
| Limitación (Art. 18) | RGPD   | Email al DPD |
| Portabilidad (Art. 20) | RGPD | Sección "Mis datos" → "Descargar copia de mis datos" |
| Oposición (Art. 21) | RGPD    | Email al DPD indicando el fundamento de la oposición |

---

## 5. Responsabilidades

| Rol | Responsabilidad |
|-----|-----------------|
| DPD (Data Protection Officer) | Revisar alertas de anomalías y solicitudes ARCO; actualizar este documento ante nuevos procesos |
| Equipo de desarrollo | Notificar al DPD antes de implementar cualquier lógica que pueda clasificarse como Art. 22 |
| Responsable del tratamiento | Aprobar y firmar cualquier DPIA asociada a procesos automatizados |

---

## 6. Historial de revisiones

| Versión | Fecha      | Cambio |
|---------|------------|--------|
| 1.0     | 2026-04-06 | Documento inicial — inventario de tres procesos automatizados no-Art.22 |

---

*Este documento forma parte del **Registro de Actividades de Tratamiento** (Art. 30 RGPD) y debe mantenerse actualizado ante cualquier cambio en los procesos de tratamiento automatizado.*
