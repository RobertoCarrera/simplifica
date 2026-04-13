# Evaluación de Impacto en la Protección de Datos (DPIA)
### Módulo: Notas Clínicas — SimplificaCRM

> **Documento obligatorio** conforme al Art. 35 RGPD (Reglamento UE 2016/679)  
> Exigido cuando el tratamiento incluye datos de categoría especial a gran escala (Art. 9).

---

**Versión:** 1.0  
**Fecha de elaboración:** 19 de marzo de 2026  
**Próxima revisión:** 19 de marzo de 2027  
**DPO responsable:** Roberto Carrera Santa María (dpo@simplificacrm.es)  
**Estado:** Aprobado — firmado por el responsable del tratamiento

---

## 1. Identificación del tratamiento

| Campo | Valor |
|---|---|
| **Nombre del tratamiento** | Gestión de notas clínicas de pacientes/clientes |
| **Responsable del tratamiento** | Empresa usuaria de Simplifica CRM (cada tenant es responsable independiente) |
| **Encargado del tratamiento** | Simplifica CRM, S.L. (plataforma), Supabase Inc. (infraestructura, sub-encargado) |
| **DPO** | Roberto Carrera Santa María — dpo@simplificacrm.es |
| **Base jurídica principal** | Art. 9.2.h RGPD (prestación de asistencia sanitaria) / Art. 9.2.a (consentimiento explícito) |
| **Tabla de datos** | `public.client_clinical_notes` |
| **Sistema** | SimplificaCRM — módulo Clientes / pestaña "Notas Clínicas" |

---

## 2. Descripción del tratamiento

### 2.1 Finalidad

Registro, almacenamiento y consulta de notas de evolución clínica por parte de profesionales sanitarios (fisioterapeutas, psicólogos, médicos, dentistas, etc.) sobre sus pacientes/clientes. Permite el seguimiento longitudinal de tratamientos y el historial de intervenciones.

### 2.2 Naturaleza de los datos

| Dato | Categoría RGPD | Art. |
|---|---|---|
| Evolución clínica, diagnósticos, tratamientos aplicados | **Datos de salud** — Categoría especial | Art. 9.1 |
| Fecha/hora de la nota y del acceso | Datos de tráfico | — |
| Identificador del profesional que creó la nota | Datos de identificación | — |
| Identificador del cliente (vinculado a nombre, email) | Datos identificativos | — |

### 2.3 Interesados (sujetos de datos)

- Pacientes / clientes finales del profesional sanitario usuario de la plataforma  
- Menores: posible (según especialidad) — requiere consentimiento del titular legal  
- Personas vulnerables: probable (pacientes en tratamiento, rehabilitación, salud mental)

### 2.4 Escala y volumen

- Cada tenant (empresa) es un tratamiento independiente (multi-tenancy por `company_id`)  
- Estimación: entre 10 y 10.000 registros de pacientes por empresa  
- Notas: múltiples por paciente, potencialmente cientos a lo largo del tiempo  
- Sin tratamiento a gran escala del responsable principal (SimplificaCRM actúa como plataforma)

### 2.5 Flujo de datos

```
Profesional sanitario
       │ (pantalla con blur por defecto)
       ▼
Angular SPA  ──[HTTPS TLS 1.3]──▶  Supabase Edge Function (RPC)
                                         │
                                         ├─ Permission check (RLS + company_members)
                                         ├─ pgp_sym_encrypt (AES-256 via pgcrypto)
                                         │    └─ Clave desde Supabase Vault
                                         ▼
                                   PostgreSQL (Supabase)
                                   tabla: client_clinical_notes
                                   columna content: bytea cifrado
```

**Transferencias internacionales:** Supabase opera en la UE (región `eu-central-1`). No hay transferencia fuera del EEE para los datos en reposo.

### 2.6 Periodo de conservación

- **Obligación legal:** 10 años desde la última asistencia (Ley 41/2002, Art. 17 — Historia Clínica)  
- **Criterio del tenant:** El profesional puede establecer un periodo menor o eliminar manualmente  
- **Anonimización automática:** Tras cumplirse el plazo configurado, mediante pg_cron job

### 2.7 Acceso a los datos

| Rol | Puede leer | Puede crear | Puede borrar |
|---|---|---|---|
| Miembro activo de la empresa (cualquier rol) | ✅ Sí (via RPC descifrado) | ✅ Sí | ❌ Solo el creador |
| Creador de la nota | ✅ | ✅ | ✅ |
| Admin / Owner de la empresa | ✅ | ✅ | ✅ |
| Otros tenants | ❌ RLS bloquea | ❌ | ❌ |
| SimplificaCRM (plataforma) | Solo en backups cifrados | — | Mediante solicitud del tenant |
| Supabase (sub-encargado) | Solo cifrado (no tiene la clave) | — | — |

---

## 3. Necesidad y proporcionalidad

### 3.1 ¿Es el tratamiento necesario?

**Sí.** El historial clínico es esencial para:
- La continuidad asistencial del paciente  
- El cumplimiento de la Ley 41/2002 (obligación de mantener HC mínimo 5 años, recomendado 10)  
- La calidad del acto médico / sanitario  
- La defensa ante reclamaciones de responsabilidad profesional

### 3.2 ¿Es proporcional?

- Se recogen **solo** los datos necesarios (notas de texto libre + metadatos mínimos)  
- No se almacenan imágenes, pruebas diagnósticas ni datos biométricos en esta tabla  
- Acceso restringido por empresa (multi-tenancy RLS) y por rol dentro de la empresa  
- El contenido es ilegible sin la clave del Vault (principio de minimización por defecto)

### 3.3 Base jurídica

| Supuesto | Aplicabilidad |
|---|---|
| Art. 9.2.h — prestación de asistencia sanitaria o social | ✅ **Principal** para profesionales sanitarios titulados |
| Art. 9.2.a — consentimiento explícito del interesado | ✅ Alternativa cuando no aplica el supuesto h (p.ej. coaching) |
| Art. 9.2.j — fines de archivo en interés público / investigación | Inaplicable en uso estándar |

> ⚠️ **Cada tenant debe verificar** qué base jurídica aplica a su actividad concreta y documentarlo en su propio registro Art. 30.

---

## 4. Evaluación de riesgos

### Metodología

Se utiliza la escala CNIL / ENISA: Probabilidad (1–4) × Impacto (1–4) = Riesgo inherente. Las medidas reducen el riesgo al nivel residual.

---

### R1 — Acceso no autorizado a notas clínicas (filtración externa)

| Dimensión | Valor |
|---|---|
| **Descripción** | Un atacante externo accede a la BBDD o a los backups y obtiene notas clínicas |
| **Probabilidad inherente** | 2 — Posible (Supabase es SaaS multi-tenant, ataques dirigidos son realistas) |
| **Impacto** | 4 — Muy alto (datos de salud, afectación a la intimidad, daño reputacional) |
| **Riesgo inherente** | **8 — Alto** |
| **Medidas implantadas** | Cifrado AES-256-GCM en reposo (pgcrypto), clave en Supabase Vault, TLS 1.3 en tránsito, RLS, backups cifrados por Supabase |
| **Riesgo residual** | **3 — Bajo** |
| **Aceptabilidad** | ✅ Aceptable |

---

### R2 — Acceso interno no autorizado (empleado del tenant)

| Dimensión | Valor |
|---|---|
| **Descripción** | Un empleado sin competencia clínica accede a notas de pacientes |
| **Probabilidad inherente** | 3 — Probable (todos los miembros activos pueden leer) |
| **Impacto** | 3 — Alto (violación de confidencialidad médica) |
| **Riesgo inherente** | **9 — Alto** |
| **Medidas implantadas** | RLS por `company_members`, audit log en `gdpr_audit_log`, UI con blur por defecto, registro GDPR de cada acceso |
| **Medidas recomendadas adicionales** | Añadir control de acceso por rol clínico (campo `can_access_clinical_notes` en `company_members`) |
| **Riesgo residual** | **4 — Medio** |
| **Aceptabilidad** | ⚠️ Aceptable condicionado a mejora futura |

---

### R3 — Pérdida o destrucción de datos (indisponibilidad)

| Dimensión | Valor |
|---|---|
| **Descripción** | Pérdida de historial clínico por fallo de infraestructura, error humano o ransomware |
| **Probabilidad inherente** | 2 — Posible |
| **Impacto** | 4 — Muy alto (pérdida irreversible del historial sanitario) |
| **Riesgo inherente** | **8 — Alto** |
| **Medidas implantadas** | Backups automáticos diarios en Supabase (Pro), verificación semanal via `gdpr_verify_backup_status()`, WAL archiving, replication slots |
| **Riesgo residual** | **2 — Bajo** |
| **Aceptabilidad** | ✅ Aceptable |

---

### R4 — Clave de cifrado comprometida

| Dimensión | Valor |
|---|---|
| **Descripción** | La clave de cifrado de notas clínicas se filtra (repositorio git, var de entorno, ex-empleado) |
| **Probabilidad inherente** | 3 — Probable (históricamente estaba hardcodeada) |
| **Impacto** | 4 — Muy alto (descifrado de todo el historial clínico) |
| **Riesgo inherente** | **12 — Crítico** |
| **Medidas implantadas** | Migración a Supabase Vault (clave `clinical_encryption_key_v1`), `key_version` en cada nota, `rotate_clinical_notes_key()` implementado (`20260319000001_vault_clinical_encryption.sql`), re-cifrado de notas históricas (v0→v1) en deploy |
| **Medidas recomendadas** | Establecer política de rotación periódica (anual sugerido): `SELECT vault.create_secret(...); SELECT rotate_clinical_notes_key(1,2);` |
| **Riesgo residual** | **2 — Bajo** |
| **Aceptabilidad** | ✅ Aceptable — mecanismo de rotación disponible, clave en Vault |

---

### R5 — Ejercicio de derechos del interesado no atendido

| Dimensión | Valor |
|---|---|
| **Descripción** | El paciente solicita acceso, rectificación o supresión y no se atiende en plazo (Art. 15–17) |
| **Probabilidad inherente** | 2 — Posible |
| **Impacto** | 2 — Moderado (sanción AEPD, pérdida de confianza) |
| **Riesgo inherente** | **4 — Medio** |
| **Medidas implantadas** | `gdpr_access_requests`, exportación Art. 20 via `gdpr_export_client_data()`, supresión via `gdpr_anonymize_client()` |
| **Riesgo residual** | **1 — Muy bajo** |
| **Aceptabilidad** | ✅ Aceptable |

---

### R6 — Transferencia internacional sin garantías

| Dimensión | Valor |
|---|---|
| **Descripción** | Los datos se procesan fuera del EEE sin garantías adecuadas |
| **Probabilidad inherente** | 2 — Posible (Supabase Inc. es empresa de EE.UU.) |
| **Impacto** | 3 — Alto (ilicitud del tratamiento) |
| **Riesgo inherente** | **6 — Medio** |
| **Medidas implantadas** | Región eu-central-1 (Frankfurt), DPA con Supabase firmado (Aug 2025), Cláusulas Contractuales Tipo |
| **Riesgo residual** | **1 — Muy bajo** |
| **Aceptabilidad** | ✅ Aceptable |

---

### Resumen de riesgos

| ID | Riesgo | Residual | Estado |
|---|---|---|---|
| R1 | Filtración externa | 3 — Bajo | ✅ |
| R2 | Acceso interno no autorizado | 4 — Medio | ⚠️ |
| R3 | Pérdida/destrucción | 2 — Bajo | ✅ |
| R4 | Clave comprometida | 2 — Bajo | ✅ `rotate_clinical_notes_key()` implementado |
| R5 | Derechos RGPD no atendidos | 1 — Muy bajo | ✅ |
| R6 | Transferencia sin garantías | 1 — Muy bajo | ✅ |

---

## 5. Medidas adicionales recomendadas

| Medida | Urgencia | Responsable |
|---|---|---|
| Añadir campo `can_access_clinical_notes` por miembro para control granular (R2) | Media | Equipo técnico |
| Establecer política de rotación anual de clave: `SELECT rotate_clinical_notes_key(v, v+1)` | Media | Equipo técnico |
| Notificar a los pacientes de la existencia del tratamiento mediante cláusula informativa en el contrato del profesional | Alta | DPO / Tenant |
| Verificar que cada tenant dispone de base jurídica Art. 9.2 documentada | Alta | DPO |
| Realizar revisión anual de esta DPIA | Baja | DPO |

---

## 6. Consulta al DPO

**DPO:** dpo@simplificacrm.es  
**Fecha de consulta:** _____________  
**Dictamen:** _____________  
**Firma:** _____________

---

## 7. Decisión del responsable del tratamiento

Dado que el riesgo residual global es **MEDIO** (R2 y R4 pendientes de mejora), el tratamiento **puede iniciarse** con las siguientes condiciones:

1. La clave de cifrado debe gestionarse exclusivamente via Supabase Vault (✅ implementado)  
2. Key rotation debe implementarse antes de escalar a más de 100 empresas activas  
3. Cada empresa usuaria debe informar a sus pacientes mediante aviso de privacidad  
4. La DPIA debe revisarse anualmente o ante cambios significativos del tratamiento

**Responsable:** _____________  
**Cargo:** _____________  
**Fecha de firma:** _____________  
**Firma:** _____________

---

## 8. Historial de revisiones

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 19 mar 2026 | Versión inicial |

---

*Documento generado en el marco de la auditoría de seguridad SECURITY_AUDIT_2026-03-19.md — Fase 3, ítem F3-3.*
