# Formación RGPD — Protección de Datos de Salud
### SimplificaCRM — Resumen para el equipo

> Este documento cumple con el requisito **F3-6** del roadmap de seguridad (SECURITY_AUDIT_2026-03-19.md).  
> Debe entregarse o presentarse a TODO el equipo que tenga acceso a la plataforma.  
> **Duración estimada de la formación:** 45–60 minutos

---

## 1. Por qué esto importa más que en cualquier otro CRM

Las notas clínicas que gestionamos son **datos de categoría especial** (Art. 9 RGPD). Esto no es terminología burocrática: las consecuencias de una filtración son:

- Sanción de la AEPD: hasta **20 millones € o 4 % del volumen de negocio global**
- Denuncias penales por revelación de secretos (Art. 197 Código Penal)
- Responsabilidad civil frente al paciente
- Publicación de la infracción en el BOE (sanción reputacional permanente)

Los datos de salud tienen la **máxima protección del ordenamiento jurídico europeo**.

---

## 2. Qué son datos de salud (Art. 9 RGPD)

Son datos de salud (y por tanto categoría especial) **todo lo que revele información sobre el estado físico o mental** de una persona identificable:
- Diagnósticos: "paciente refiere lumbalgia crónica"
- Tratamientos: "sesión de fisioterapia n.º 5"
- Evolución: "mejora del 60 % en rango de movimiento"
- Psicológica: cualquier nota de sesión terapéutica
- Dental: historial de intervenciones
- Medicación prescrita o administrada

**No son datos de salud** (en el contexto de nuestro CRM):
- Nombre, email, teléfono del cliente → datos personales normales
- Fecha de última factura → dato comercial
- Presupuesto de servicio → dato comercial

---

## 3. Qué hace la plataforma para protegerlos

| Medida | Qué significa en la práctica |
|---|---|
| **Cifrado AES-256-GCM en reposo** | Las notas están cifradas en la base de datos. Si alguien accede directamente a la BD sin la clave, solo ve bytes sin sentido. |
| **Clave en Supabase Vault** | La clave de cifrado no está en el código ni en variables visibles. Solo los sistemas autorizados la usan. |
| **RLS (Row Level Security)** | Cada empresa solo ve sus propios datos. Es imposible "colarte" en los datos de otra empresa. |
| **Blur por defecto** | Las notas aparecen borrosas hasta que el profesional hace clic deliberadamente. Evita exposición accidental en pantalla. |
| **Registro de auditoría** | Cada acceso a notas clínicas queda registrado: quién, cuándo, desde qué IP. |
| **TLS 1.3** | Todo el tráfico entre el navegador y los servidores va cifrado. |

---

## 4. Lo que el equipo NUNCA debe hacer

### ❌ Compartir credenciales
- Nunca dar tu usuario/contraseña a un compañero, aunque sea "un momento"
- Si necesitas acceso temporal para cubrir a alguien, el admin crea una cuenta nueva
- Las sesiones no se comparten

### ❌ Exportar datos clínicos sin autorización expresa
- No copias en Excel ni Word con contenido de notas clínicas
- No capturas de pantalla de historiales compartidas por WhatsApp, email o Slack
- No descargas masivas de la base de datos sin protocolo documentado

### ❌ Acceder desde redes no seguras
- No acceder desde WiFi pública sin VPN
- No usar dispositivos compartidos (ordenadores de hotel, cibercafés)

### ❌ Ignorar alertas de seguridad
- Si el sistema te avisa de un acceso inusual o una anomalía, notifícalo inmediatamente
- No asumas que "es un bug" y lo ignores

### ❌ Revelar información a terceros
- No confirmar ni desmentir si alguien (incluido un familiar del paciente) pregunta si tiene historial en el sistema sin consentimiento del paciente
- "No puedo confirmar si esa persona es cliente nuestro"

---

## 5. Los derechos del paciente — y cómo atenderlos

Cuando un **paciente o cliente final** contacte ejerciendo sus derechos RGPD, tienes **1 mes** para responder (Art. 12.3). Nunca se niegan sin justificación legal válida.

| Derecho | Qué pide el paciente | Cómo se tramita en la plataforma |
|---|---|---|
| **Acceso** (Art. 15) | "Quiero saber qué datos tenéis míos" | Ir a Clientes → perfil → Exportar datos RGPD (función `gdpr_export_client_data`) |
| **Rectificación** (Art. 16) | "Ese dato está mal, quiero que lo corrijan" | Editar el perfil del cliente. Las notas clínicas son inmutables por integridad; se puede añadir nota aclaratoria |
| **Supresión** (Art. 17) | "Quiero que borréis todo" | Herramienta de anonimización RGPD (no borra físicamente, anonimiza conforme a la ley) |
| **Portabilidad** (Art. 20) | "Quiero mis datos para llevarlos a otro profesional" | Exportación en JSON estructurado desde el perfil |
| **Limitación** (Art. 18) | "No quiero que uséis mis datos pero tampoco que los borréis" | Marcar cliente como "tratamiento limitado" en el panel RGPD |
| **Oposición** (Art. 21) | "No quiero que uséis mis datos para marketing" | Retirar consentimientos de marketing desde el perfil |

**Si tienes dudas:** escala siempre al DPO (dpo@simplificacrm.es) antes de responder.

---

## 6. Qué hacer si sospechas un incidente

Un incidente de seguridad es **cualquier** acceso, pérdida, modificación, o divulgación no autorizada de datos personales. Incluye:
- Ordenador perdido o robado con sesión activa
- Email enviado a la persona equivocada con datos de un paciente
- Alguien vio tu pantalla con notas clínicas abiertas
- Credenciales posiblemente comprometidas ("crees que alguien sabe tu contraseña")
- Error en la aplicación que muestra datos de otro paciente

### Protocolo de respuesta

```
1. NO lo resuelvas solo ni lo tapes
2. Documenta qué pasó (fecha, hora, qué viste, qué hiciste)
3. Notifica IN MEDIATA MENTE al DPO: dpo@simplificacrm.es
4. No comuniques el incidente al exterior ni al paciente afectado SIN consenso del DPO
   (El DPO decide si hay que notificar a la AEPD en 72h y al interesado)
5. Colabora con la investigación
```

> ⚠️ La AEPD tiene competencia para investigar si la notificación se hizo en plazo o no. Un incidente ocultado puede multiplicar la sanción x10.

---

## 7. Política de contraseñas y MFA

- **Mínimo 12 caracteres**: mayúscula + minúscula + número + símbolo
- **MFA obligatorio** para cuentas Admin, Owner y DPO
- **No reutilizar contraseñas**: usa un gestor (Bitwarden, 1Password)
- **Cambio inmediato** si sospechas compromiso
- **No uses la cuenta corporativa** para registrarte en servicios externos

---

## 8. Lo que el equipo SÍ puede hacer (y es obligatorio)

- ✅ Reportar cualquier anomalía o comportamiento extraño de la aplicación
- ✅ Solicitar formación adicional si necesitas entender mejor algo
- ✅ Preguntar al DPO si tienes dudas antes de actuar
- ✅ Proponer mejoras de seguridad o procesos
- ✅ Negarte a ejecutar instrucciones que creas que violan la privacidad del paciente

---

## 9. Preguntas de verificación (post-formación)

Tras leer este documento, el responsable de formación debe comprobar que cada miembro del equipo puede responder:

1. ¿Qué es un dato de salud? Da un ejemplo de nuestro CRM.
2. ¿Qué haces si un paciente te pide sus datos por email?
3. ¿Qué haces si crees que tu contraseña ha sido comprometida?
4. ¿Puedes compartir una captura de pantalla de notas clínicas por WhatsApp?
5. ¿Cuánto tiempo tienes para responder a una solicitud de acceso RGPD?
6. ¿A quién notificas si sospechas un incidente?

---

## 10. Registro de formación

| Nombre | Cargo | Fecha de lectura | Firma |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

> **Conservar este registro firmado durante, como mínimo, 5 años (Art. 5.2 RGPD — responsabilidad proactiva).**

---

*Documento elaborado conforme al ítem F3-6 del SECURITY_AUDIT_2026-03-19.md  
Próxima revisión: marzo 2027 o ante cambios normativos relevantes.*
