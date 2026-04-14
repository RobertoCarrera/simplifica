# Evaluación de Impacto en la Protección de Datos (DPIA)
### Módulo: Integración con Docplanner / Doctoralia — SimplificaCRM

> **Documento elaborado** conforme al Art. 35 RGPD (Reglamento UE 2016/679)  
> Justificación: el tratamiento implica sincronización de datos de agenda y reservas de salud con un tercero (Art. 35.3.b RGPD aplica si la especialidad del profesional revela datos de salud del paciente; se evalúa el riesgo de inferencia).

---

**Versión:** 1.0  
**Fecha de elaboración:** 6 de abril de 2026  
**Próxima revisión:** 6 de abril de 2027  
**DPO responsable:** Roberto Carrera Santa María (dpo@simplificacrm.es)  
**Estado:** Aprobado — firmado por el responsable del tratamiento

---

## 1. Identificación del tratamiento

| Campo | Valor |
|---|---|
| **Nombre del tratamiento** | Sincronización de agenda y reservas con Docplanner / Doctoralia |
| **Responsable del tratamiento** | Empresa usuaria de Simplifica CRM que activa la integración (cada tenant) |
| **Encargado del tratamiento** | Simplifica CRM (plataforma) — actúa como intermediario técnico |
| **Sub-encargado involucrado** | Docplanner Tech S.L. (Doctoralia) — receptor/emisor de los datos de disponibilidad |
| **DPO** | Roberto Carrera Santa María — dpo@simplificacrm.es |
| **Base jurídica principal** | Art. 6.1.b RGPD — ejecución del contrato de servicio con el usuario profesional |
| **Sistema** | SimplificaCRM — módulo Reservas / configuración de integración externa |

---

## 2. Descripción del tratamiento

### 2.1 Finalidad

Permitir que los profesionales de salud usuarios de SimplificaCRM sincronicen su disponibilidad de agenda (franjas horarias libres, duración de citas, especialidades) con Docplanner/Doctoralia para que los pacientes puedan reservar citas desde el portal público de Doctoralia. Las reservas confirmadas en Doctoralia se reflejan en el calendario de SimplificaCRM.

### 2.2 Naturaleza de los datos

| Dato sincronizado | Dirección | Categoría RGPD | Notas |
|---|---|---|---|
| Nombre y apellidos del profesional | SimplificaCRM → Docplanner | Datos identificativos | Datos del usuario profesional |
| Especialidad médica o terapéutica del profesional | SimplificaCRM → Docplanner | Datos identificativos (del profesional) | **Riesgo de inferencia de salud** si es visible para el paciente |
| Franjas horarias disponibles | SimplificaCRM ↔ Docplanner | Datos de disponibilidad | No datos de categoría especial por sí solos |
| Tipo de cita / servicio ofrecido | SimplificaCRM → Docplanner | Datos de disponibilidad | Puede revelar la especialidad/patología tratada |
| Nombre del paciente que reserva | Docplanner → SimplificaCRM | Datos identificativos del paciente | Tratado solo para registrar la cita |
| Email / teléfono del paciente (si facilitado) | Docplanner → SimplificaCRM | Datos de contacto del paciente | Opcional según configuración del formulario de reserva |
| Fecha y hora de la reserva | Docplanner → SimplificaCRM | Metadatos de la cita | Combinado con especialidad puede inferir dato de salud |

### 2.3 Interesados (sujetos de datos)

- **Profesionales sanitarios** (usuarios de SimplificaCRM que activan la integración voluntariamente)
- **Pacientes** que reservan a través de Docplanner/Doctoralia y cuya reserva es transferida a SimplificaCRM

> ℹ️ Los pacientes ya han prestado su consentimiento directamente a Doctoralia al crear su cuenta en dicha plataforma. SimplificaCRM recibe únicamente los datos estrictamente necesarios para registrar la cita.

### 2.4 Escala y volumen

- La integración es **opcional**: solo activa si el profesional la habilita explícitamente
- Volumen estimado: 0–200 citas/mes por profesional activo con la integración
- Sin tratamiento a gran escala (cada tenant actúa de forma independiente)

### 2.5 Flujo de datos

```
SimplificaCRM
(Admin activa integración)
       │
       │ Credenciales API almacenadas cifradas en Supabase Vault
       ▼
Supabase Edge Function
       │
       ├─[HTTPS TLS 1.3]─▶  API Docplanner Tech S.L.
       │                         │
       │                         ├─ Envía disponibilidad (slots)
       │                         ├─ Envía tipo de servicio / especialidad
       │                         └─ Devuelve reservas confirmadas
       │
       ▼
PostgreSQL (Supabase, EU)
       ├─ tabla: appointments / calendar_events
       └─ Reserva registrada con datos mínimos del paciente
```

**Transferencias internacionales:** Docplanner Tech S.L. opera en la UE (sede en España). Los servidores de Doctoralia están en la UE. No hay transferencia fuera del EEE.

### 2.6 Periodo de conservación

- Las reservas sincronizadas se conservan durante el período acordado en el DPA entre Simplifica y el cliente profesional
- Disponibilidad en SimplificaCRM: mientras el profesional mantenga su cuenta activa
- Credenciales API: eliminadas inmediatamente si el usuario desactiva la integración

---

## 3. Necesidad y proporcionalidad

### 3.1 Licitud de la base jurídica

| Sujeto | Base jurídica | Justificación |
|---|---|---|
| Profesional (usuario SimplificaCRM) | Art. 6.1.b — ejecución del contrato | El profesional contrata el servicio de integración; la sincronización es esencial para la funcionalidad solicitada |
| Paciente (reserva desde Doctoralia) | Art. 6.1.b — ejecución del contrato (relación profesional-paciente) | La transferencia de la reserva es necesaria para que la cita quede registrada. Doctoralia gestiona el consentimiento propio del paciente |

### 3.2 Minimización de datos (Art. 5.1.c)

- Solo se sincronizan los datos necesarios para registrar la reserva: nombre, contacto básico, fecha y hora
- El tipo de servicio/especialidad se incluye únicamente si es imprescindible para la lógica de la agenda
- El historial clínico del paciente **nunca** es enviado a Docplanner

### 3.3 Limitación de la finalidad (Art. 5.1.b)

- Los datos recibidos de Docplanner se usan exclusivamente para crear la entrada de cita en SimplificaCRM
- No se usan para perfilado, marketing ni análisis cruzado con otros datos del paciente

### 3.4 Exactitud y conservación

- Los datos se actualizan en cada sincronización
- Criterios de retención definidos en el DPA con cada cliente (típicamente 5–10 años según la legislación sanitaria aplicable)

---

## 4. Identificación y evaluación de riesgos

| # | Riesgo | Probabilidad | Impacto | Nivel |
|---|---|---|---|---|
| R1 | **Inferencia de datos de salud**: la especialidad del profesional (p. ej., "psicólogo", "oncólogo") combinada con el nombre del paciente y la fecha de la cita puede revelar un dato de salud | Media | Alto | **MEDIO** |
| R2 | **Acceso no autorizado a credenciales API de Docplanner**: si las credenciales API son comprometidas, un atacante podría acceder a la disponibilidad del profesional | Baja | Medio | **BAJO** |
| R3 | **Desvío de finalidad por parte de Docplanner**: Docplanner podría usar los datos de disponibilidad para fines propios (publicidad, análisis de mercado) | Baja | Alto | **MEDIO** |
| R4 | **Pérdida de integridad de reservas**: un error de sincronización podría provocar citas duplicadas o no registradas, con consecuencias para el paciente | Media | Medio | **MEDIO** |
| R5 | **Transmisión de datos del paciente fuera del EEE** si Docplanner cambia su infraestructura | Muy baja | Alto | **BAJO** |

---

## 5. Medidas para afrontar los riesgos

| Riesgo | Medida adoptada | Estado |
|---|---|---|
| R1 — Inferencia de salud | La integración no envía diagnósticos ni notas clínicas. El tipo de servicio se aplica minimización: se envía solo si el profesional lo configura explícitamente. Documentar en la política de privacidad que el tipo de cita puede relacionarse con la especialidad del profesional | ✅ Implementado |
| R1 — Inferencia de salud | Se informa al paciente en la política de privacidad del Portal que la reserva puede implicar datos de agenda de un profesional de salud (§5 destinatarios) | ✅ Implementado |
| R2 — Credenciales API | Las credenciales OAuth/API de Docplanner se almacenan cifradas en Supabase Vault (AES-256). Los tokens de acceso se rotan periódicamente. El profesional puede revocarlas en cualquier momento desde la configuración | ✅ Implementado |
| R3 — Desvío de finalidad Docplanner | DPA firmado con Docplanner Tech S.L. (cláusula de sub-encargado) que prohíbe el uso de los datos para fines distintos a la sincronización de agenda | ✅ DPA firmado |
| R4 — Integridad de reservas | La lógica de sincronización implementa idempotencia (referencia única por reserva Docplanner). Los errores de sincronización se registran en el log de auditoría | ✅ Implementado |
| R5 — Transferencia EEE | Monitorización del DPA con Docplanner Tech S.L. para verificar que los datos permanecen en la UE. Clausula de notificación inmediata si hay cambio de infraestructura | ✅ Cláusula incluida en DPA |

### 5.1 Medidas técnicas adicionales

- **TLS 1.3** en todas las comunicaciones API con Docplanner
- **Registro de auditoría** de cada sincronización (quién, cuándo, qué datos)
- **Activación opcional**: el módulo está desactivado por defecto; el profesional debe habilitarlo explícitamente (consentimiento activo de configuración)
- **Desactivación inmediata**: el profesional puede desactivar la integración en cualquier momento, momento en que se eliminan las credenciales API almacenadas

---

## 6. Consulta previa a la Autoridad de Control

**Conclusión:** No se requiere consulta previa a la AEPD (Art. 36 RGPD).

**Justificación:** El riesgo residual es **BAJO-MEDIO**. Los datos sincronizados son principalmente de disponibilidad de agenda y metadatos de reservas. No se tratan datos de salud del paciente directamente; el riesgo de inferencia existe pero se mitiga mediante las medidas de minimización descritas. El tratamiento no encaja en los supuestos del Art. 35.3 RGPD (decisiones automatizadas, datos biométricos, vigilancia sistemática a gran escala) ya que:

1. Los datos de salud directos (notas clínicas, diagnósticos) **no** se envían a Docplanner
2. La escala es limitada (por tenant, no agregada a gran escala por SimplificaCRM)
3. La integración es voluntaria y transparente para el profesional

---

## 7. Aprobación y firma

| Rol | Nombre | Fecha |
|---|---|---|
| Responsable del tratamiento | El cliente profesional (tenant) | Al activar la integración |
| DPO / Encargado (SimplificaCRM) | Roberto Carrera Santa María | 6 de abril de 2026 |

---

## 8. Historial de revisiones

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 06/04/2026 | Versión inicial — integración Docplanner añadida como sub-encargado en DPA v1.1 |
