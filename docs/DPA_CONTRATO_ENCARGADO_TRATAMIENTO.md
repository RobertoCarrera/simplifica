# Contrato de Encargado del Tratamiento
### (Acuerdo de Procesamiento de Datos — Art. 28 RGPD)

**Versión:** 1.1 — 6 de abril de 2026  
**Plataforma:** SimplificaCRM (simplificacrm.es)

---

## PARTES

**EL RESPONSABLE DEL TRATAMIENTO** (en adelante, "el Cliente"):

- **Nombre / Razón social:** ___________________________________
- **NIF / CIF:** ___________________________________
- **Domicilio social:** ___________________________________
- **Representante legal:** ___________________________________
- **Correo electrónico:** ___________________________________

**EL ENCARGADO DEL TRATAMIENTO** (en adelante, "SimplificaCRM"):

- **Nombre:** Roberto Carrera Santa María
- **NIF:** 45127276B
- **Domicilio:** C/Pisuerga 32, Bajo 1.ª, 43882 Segur de Calafell, Tarragona, España
- **DPO:** Roberto Carrera Santa María — dpo@simplificacrm.es

---

## EXPONEN

**I.** Que el Cliente desea contratar los servicios de la plataforma **SimplificaCRM**, software de gestión de relaciones con clientes (CRM), facturación, calendario, comunicaciones y funcionalidades relacionadas.

**II.** Que para la prestación de dichos servicios, SimplificaCRM accede y trata datos personales de los que el Cliente es Responsable del Tratamiento, actuando SimplificaCRM como Encargado del Tratamiento en los términos del artículo 28 del Reglamento (UE) 2016/679 (RGPD) y de la Ley Orgánica 3/2018 (LOPDGDD).

**III.** Que ambas partes reconocen la necesidad de suscribir el presente Contrato de Encargado del Tratamiento (en adelante, "el Contrato") como requisito legal previo al inicio del tratamiento de datos.

Por lo expuesto, ambas partes **ACUERDAN** las siguientes:

---

## CLÁUSULAS

### Cláusula 1 — Objeto y ámbito del tratamiento

1.1. SimplificaCRM tratará los datos personales facilitados por el Cliente **única y exclusivamente** para la prestación de los servicios contratados descritos en las Condiciones Generales de Servicio de SimplificaCRM (en adelante, los "Servicios").

1.2. **Naturaleza del tratamiento:** recopilación, registro, almacenamiento, consulta, conservación, modificación, extracción, difusión a usuarios autorizados por el Cliente, y supresión de datos.

1.3. **Finalidad del tratamiento:** gestión de clientes, facturación, comunicaciones, citas y funcionalidades adicionales contratadas por el Cliente.

1.4. **Tipos de datos personales tratados:**
- Datos identificativos: nombre, apellidos, dirección, teléfono, correo electrónico, NIF/DNI.
- Datos económicos: datos de facturación y de pago de los clientes finales del Cliente.
- Datos de comunicaciones: mensajes, correos y notificaciones gestionados a través de la plataforma.
- **Datos de categoría especial** (solo si el Cliente activa el módulo clínico): datos de salud de los pacientes o clientes finales del Cliente, cifrados con AES-256. La activación de este módulo implica la aceptación expresa de las condiciones adicionales del Anexo I.

1.5. **Categorías de interesados:** clientes finales del Cliente, empleados del Cliente, proveedores o cualquier persona física cuyos datos el Cliente introduzca en la plataforma.

1.6. **Duración:** la vigencia del presente Contrato coincide con la vigencia del contrato de servicio entre las partes. A su finalización, se aplicará la Cláusula 10.

---

### Cláusula 2 — Instrucciones del Responsable

2.1. SimplificaCRM tratará los datos personales **conforme a las instrucciones documentadas del Cliente**. Las instrucciones generales se reflejan en el propio funcionamiento de la plataforma conforme a su documentación.

2.2. Si SimplificaCRM considera que una instrucción del Cliente infringe el RGPD u otra normativa aplicable, lo notificará al Cliente de inmediato.

2.3. SimplificaCRM no tratará los datos para fines propios ni los cederá a terceros, salvo los sub-encargados autorizados en la Cláusula 6.

---

### Cláusula 3 — Confidencialidad

3.1. SimplificaCRM garantiza que las personas autorizadas para tratar los datos personales del Cliente se han comprometido a guardar confidencialidad, ya sea por obligación contractual o por obligación legal de naturaleza estatutaria.

3.2. Esta obligación de confidencialidad subsistirá tras la extinción del presente Contrato.

---

### Cláusula 4 — Medidas de Seguridad (Art. 32 RGPD)

SimplificaCRM implementa y mantiene las siguientes medidas técnicas y organizativas:

**Técnicas:**
- Cifrado en tránsito: TLS 1.2+ en todas las comunicaciones (HTTPS forzado con HSTS).
- Cifrado en reposo: datos de salud cifrados con AES-256-GCM mediante Supabase Vault.
- Control de acceso: seguridad a nivel de fila (Row Level Security) en la base de datos, garantizando aislamiento de datos entre clientes.
- Autenticación: OTP (sin contraseñas almacenadas) + MFA obligatorio para roles de administrador.
- Auditoría: registro inmutable de accesos y modificaciones durante 10 años.
- Anomaly detection: sistema automatizado de detección de accesos anómalos.

**Organizativas:**
- DPO designado formalmente.
- DPIA elaborada para el módulo de datos clínicos.
- Pentest y auditoría de seguridad documentada (SECURITY_AUDIT_2026-03-19).
- Plan de continuidad y backups diarios con RPO de 24h y RTO de 4h.
- Procedimiento de gestión de brechas de seguridad con notificación en 72h a la AEPD.

---

### Cláusula 5 — Asistencia en el ejercicio de derechos de los interesados

5.1. SimplificaCRM asistirá al Cliente en la medida de lo posible para que pueda responder a las solicitudes de ejercicio de derechos (acceso, rectificación, supresión, portabilidad, limitación, oposición) de los interesados finales.

5.2. Las funcionalidades técnicas de exportación (`gdpr_export_client_data`) y anonimización (`gdpr_anonymize_client`) están disponibles en la plataforma para que el Cliente pueda responder a dichas solicitudes de forma autónoma.

5.3. En caso de que un interesado dirija su solicitud directamente a SimplificaCRM, éste la redirigirá al Cliente en el plazo de 5 días hábiles.

---

### Cláusula 6 — Sub-encargados del tratamiento

6.1. El Cliente **autoriza expresamente** a SimplificaCRM a subcontratar los tratamientos indicados a continuación a los siguientes sub-encargados:

| Sub-encargado | Servicio | País | Garantía RGPD |
|---|---|---|---|
| Supabase Ltd (Irlanda) | Almacenamiento, base de datos, auth | Irlanda (UE) | DPA firmado, datos en UE |
| Amazon Web Services (SES) | Correo electrónico transaccional | EE.UU. | Cláusulas Contractuales Tipo |
| Vercel Inc. | Alojamiento de la aplicación web | EE.UU. | Cláusulas Contractuales Tipo |
| Stripe Inc. / PayPal S.à r.l. | Pasarela de pago (si se activa) | EE.UU./Luxemburgo | CCT / UE |
| Google LLC | Sincronización Calendar/Drive (si se activa) | EE.UU. | Cláusulas Contractuales Tipo |
| Docplanner Tech S.L. (Doctoralia) | Sincronización de disponibilidad de agenda y reservas desde Docplanner/Doctoralia (si el Cliente activa la integración) | España (UE) | DPA firmado; datos tratados en la UE (Art. 46 RGPD) |

6.2. SimplificaCRM notificará al Cliente con un mínimo de **30 días de antelación** cualquier incorporación o sustitución de sub-encargados. El Cliente podrá objetar mediante comunicación escrita. Si no se alcanza acuerdo, cualquiera de las partes podrá resolver el contrato sin penalización.

6.3. Los sub-encargados están sujetos a las mismas obligaciones de protección de datos que las establecidas en el presente Contrato.

---

### Cláusula 7 — Notificación de brechas de seguridad

7.1. SimplificaCRM notificará al Cliente **sin dilación indebida y en todo caso antes de 24 horas** desde que tenga conocimiento de una brecha de seguridad que afecte a los datos del Cliente.

7.2. La notificación incluirá, en la medida de lo posible: naturaleza de la brecha, categorías y número aproximado de interesados afectados, probable consecuencia y medidas adoptadas o propuestas.

7.3. El Cliente, como Responsable del Tratamiento, es quien tiene la obligación de notificar la brecha a la AEPD en el plazo de **72 horas** (Art. 33 RGPD) y, si procede, a los interesados (Art. 34 RGPD).

---

### Cláusula 8 — Evaluaciones de Impacto y consulta previa

8.1. SimplificaCRM asistirá al Cliente en la elaboración de eventuales Evaluaciones de Impacto relativas a la Protección de Datos (DPIA) que sean necesarias por los tratamientos realizados a través de la plataforma.

8.2. SimplificaCRM pone a disposición del Cliente las DPIA elaboradas:
- Módulo clínico (notas de salud): `docs/DPIA_notas_clinicas_2026-03-19.md`
- Integración Docplanner/Doctoralia: `docs/DPIA_Docplanner_Integration_2026-04-06.md` (aplicable si el Cliente activa dicha integración).

---

### Cláusula 9 — Auditoría

9.1. El Cliente (o un auditor designado por éste) podrá realizar auditorías de cumplimiento con un preaviso de **30 días**, no más de una vez al año, en horario ordinario de trabajo y sin interferir en las operaciones de SimplificaCRM.

9.2. Los costes de la auditoría serán asumidos por el Cliente, salvo que la auditoría revele un incumplimiento material imputable a SimplificaCRM.

9.3. Como alternativa a la auditoría in situ, SimplificaCRM podrá facilitar al Cliente la documentación acreditativa de sus medidas de seguridad (pentest, certificaciones, auditorías externas) para satisfacer el requisito de auditoría.

---

### Cláusula 10 — Supresión o devolución de datos al finalizar el contrato

10.1. A la terminación del contrato de servicios por cualquier causa, SimplificaCRM pondrá a disposición del Cliente todos sus datos personales en formato exportable (CSV/JSON) durante un período de **30 días** desde la fecha de finalización.

10.2. Transcurrido dicho período, SimplificaCRM procederá a la **eliminación segura e irreversible** de todos los datos del Cliente de sus sistemas, incluyendo las copias de seguridad, en un plazo máximo de 90 días.

10.3. A petición del Cliente, SimplificaCRM emitirá un certificado de destrucción de datos.

10.4. Lo anterior se entiende sin perjuicio de la obligación de conservación derivada de normativa legal aplicable, en cuyo caso los datos se mantendrán bloqueados y solo accesibles para atender requerimientos de autoridades competentes.

---

### Cláusula 11 — Responsabilidad

11.1. SimplificaCRM será responsable de los daños y perjuicios causados al tratamiento cuando haya actuado al margen o en contra de las instrucciones lícitas del Cliente, o cuando haya incumplido las obligaciones del RGPD que le corresponden como Encargado.

11.2. Nada de lo estipulado en este Contrato limita la responsabilidad de ninguna de las partes frente a los interesados por el incumplimiento de sus respectivas obligaciones conforme al RGPD.

---

### Cláusula 12 — Vigencia y resolución

12.1. El presente Contrato entra en vigor en la fecha de su firma y permanecerá vigente mientras dure la relación contractual de servicios entre las partes.

12.2. La terminación del contrato de servicios implicará automáticamente la terminación de este Contrato, con los efectos previstos en la Cláusula 10.

12.3. Las obligaciones de confidencialidad (Cláusula 3) y las relativas a la conservación/supresión de datos (Cláusula 10) sobrevivirán a la terminación.

---

### Cláusula 13 — Ley aplicable y resolución de conflictos

13.1. El presente Contrato se rige por el Reglamento (UE) 2016/679 (RGPD), la Ley Orgánica 3/2018 (LOPDGDD) y demás normativa española aplicable.

13.2. Cualquier controversia derivada de este Contrato se someterá a los Juzgados y Tribunales españoles competentes, renunciando las partes a cualquier otro fuero que pudiera corresponderles.

---

## FIRMAS

En ________________________, a ____ de ____________ de 20____.

&nbsp;

**Por el Responsable del Tratamiento (El Cliente):**

Nombre: ___________________________________  
Cargo: ___________________________________  
Firma: ___________________________________  
Fecha: ___________________________________

&nbsp;

**Por el Encargado del Tratamiento (SimplificaCRM):**

Nombre: Roberto Carrera Santa María  
NIF: 45127276B  
Firma: ___________________________________  
Fecha: ___________________________________

---

## ANEXO I — Tratamiento de datos de categoría especial (datos de salud)

Este Anexo es aplicable **únicamente** cuando el Cliente activa y utiliza el módulo de notas clínicas o historial de salud de SimplificaCRM.

**A.1.** El Cliente declara y garantiza que:
- Cuenta con la base jurídica apropiada para tratar datos de salud de sus pacientes/clientes (Art. 9.2 RGPD), ya sea en virtud de prestación de asistencia sanitaria (Art. 9.2.h) o consentimiento explícito del interesado (Art. 9.2.a).
- Ha informado a sus pacientes/clientes de que sus datos clínicos son tratados a través de la plataforma SimplificaCRM.
- Cumple con la Ley 41/2002 básica reguladora de la autonomía del paciente en lo que respecta a la historia clínica.

**A.2.** Medidas adicionales de SimplificaCRM para datos de salud:
- Cifrado de doble capa: AES-256-GCM a nivel de base de datos (además del TLS en tránsito).
- Acceso restringido: solo usuarios con rol específico asignado por el Cliente pueden acceder a las notas clínicas.
- Auditoría reforzada: cada acceso, creación, modificación o visualización de datos clínicos queda registrado con marca temporal, usuario e IP.
- DPIA específica elaborada conforme al Art. 35 RGPD: `docs/DPIA_notas_clinicas_2026-03-19.md`.

**A.3.** El Cliente es el único responsable de la licitud del tratamiento de los datos de salud de sus pacientes. SimplificaCRM actúa en calidad de encargado y no tiene criterio ni responsabilidad sobre el contenido de dichos datos.

---

*Versión 1.1 — SimplificaCRM — dpo@simplificacrm.es*

**Historial de revisiones:**
| Versión | Fecha | Cambio |
|---------|-------|--------|
| 1.0 | 19/03/2026 | Versión inicial |
| 1.1 | 06/04/2026 | Añadido Docplanner Tech S.L. como sub-encargado (Cláusula 6); referencia a DPIA integración Docplanner (Cláusula 8.2) |
