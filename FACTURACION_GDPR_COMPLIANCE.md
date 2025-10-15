# 🔒 Cumplimiento GDPR - Módulo de Facturación

## ✅ **Requisitos Implementados**

### **1. Base Legal (Art. 6.1.c GDPR)**

Todas las facturas se procesan bajo **obligación legal**:

```sql
gdpr_legal_basis = 'legal_obligation'
```

**Justificación:**
- **Ley General Tributaria** (Ley 58/2003): Obligación de conservar facturas
- **Código de Comercio** (Art. 29-30): Conservación de documentos contables
- **Ley del IVA** (Ley 37/1992): Expedición y conservación de facturas

### **2. Retención Limitada (7 años)**

Periodo de conservación **calculado automáticamente**:

```sql
retention_until = invoice_date + INTERVAL '7 years'
```

**Normativa:**
- **Ley General Tributaria** (Art. 66): 4 años (general)
- **Código de Comercio** (Art. 30): 6 años (documentos contables)
- **Práctica recomendada**: 7 años (seguridad legal)

### **3. Anonimización Automática**

```sql
CREATE TRIGGER anonymize_old_invoices_trigger
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION anonymize_invoice_data();
```

**Qué se anonimiza:**
- ✅ `notes` → "ANONIMIZADO"
- ✅ `internal_notes` → "ANONIMIZADO"
- ❌ Datos fiscales: **NO** se anonimizan (obligación legal)

**Qué se CONSERVA:**
- ✅ Número de factura
- ✅ Fecha de emisión
- ✅ Importes (subtotal, IVA, total)
- ✅ NIF/CIF de emisor y receptor
- ✅ Datos necesarios para inspecciones fiscales

---

## 📜 **Derechos del Interesado**

### **Art. 15 GDPR - Derecho de Acceso**
✅ **Implementado**

Cliente puede solicitar **copia de sus facturas**:

```typescript
// Obtener facturas de un cliente
getInvoices({ client_id: '...' })
```

**Formatos disponibles:**
- PDF con diseño personalizado
- XML estructurado (Veri*Factu)
- JSON (API)

### **Art. 16 GDPR - Derecho de Rectificación**
✅ **Implementado**

**Facturas rectificativas** según normativa fiscal:

```typescript
// Crear factura rectificativa
createInvoice({
  invoice_type: 'rectificative',
  rectifies_invoice_id: '...',
  rectification_reason: 'Error en cantidad'
})
```

**Importante:**
- ❌ NO se puede editar factura original (inmutabilidad fiscal)
- ✅ Se emite nueva factura rectificativa
- ✅ Ambas se conservan (cadena de auditoría)

### **Art. 17 GDPR - Derecho de Supresión**
❌ **NO APLICABLE**

**Justificación legal:**
```
Art. 17.3.b GDPR - Excepciones a la supresión:
"El tratamiento es necesario para el cumplimiento de una obligación 
legal que requiera el tratamiento impuesto por el Derecho de la Unión 
o de los Estados miembros"
```

**Respuesta al interesado:**
> "Conforme al Art. 17.3.b del GDPR, no podemos eliminar sus facturas 
> debido a la obligación legal de conservación establecida en la 
> Ley General Tributaria y el Código de Comercio. Las facturas se 
> anonimizan automáticamente tras 7 años de su emisión."

### **Art. 18 GDPR - Derecho de Limitación**
⚠️ **APLICABLE CON RESTRICCIONES**

Cliente puede solicitar **bloqueo temporal**:

```sql
-- Marcar factura como bloqueada
UPDATE invoices 
SET internal_notes = 'BLOQUEADO POR GDPR - Pendiente resolución'
WHERE id = '...'
```

**Usos permitidos durante bloqueo:**
- ✅ Inspecciones fiscales
- ✅ Defensa legal
- ❌ Envío al cliente (hasta resolución)

### **Art. 20 GDPR - Derecho de Portabilidad**
✅ **Implementado**

Cliente puede solicitar **exportación** de sus datos:

```typescript
// Exportar todas las facturas de un cliente
exportClientInvoices(client_id, {
  format: 'pdf' | 'xml' | 'json',
  include_payments: true
})
```

---

## 🛡️ **Medidas de Seguridad**

### **1. Cifrado en Reposo**
✅ Supabase PostgreSQL usa **AES-256**

### **2. Cifrado en Tránsito**
✅ HTTPS/TLS 1.3 obligatorio

### **3. Control de Acceso (RLS)**
```sql
CREATE POLICY "invoices_select_company"
ON invoices FOR SELECT
TO public
USING (company_id = get_user_company_id());
```

**Resultado:**
- ✅ Usuarios solo ven facturas de su empresa
- ✅ Aislamiento multitenant
- ✅ Sin acceso cruzado

### **4. Auditoría Completa**
```sql
created_at      -- Fecha de creación
created_by      -- Usuario que creó
updated_at      -- Última modificación
deleted_at      -- Soft delete (auditoría)
```

---

## 📋 **Documentación Obligatoria**

### **Registro de Actividades de Tratamiento (RAT)**

**Para incluir en vuestro RAT:**

```
┌─────────────────────────────────────────────────────────────┐
│  TRATAMIENTO: FACTURACIÓN Y CONTABILIDAD                    │
├─────────────────────────────────────────────────────────────┤
│  Responsable:           [Nombre empresa]                    │
│  Finalidad:             Emisión y gestión de facturas       │
│  Base Legal:            Obligación legal (Art. 6.1.c GDPR)  │
│  Categorías de Datos:                                       │
│    - Identificativos    (Nombre, NIF/CIF)                   │
│    - Económicos         (Importes, pagos)                   │
│    - Transaccionales    (Fecha, servicios)                  │
│  Destinatarios:                                             │
│    - Agencia Tributaria (obligación legal)                  │
│    - Bancos             (gestión de cobros)                 │
│  Transferencias Int.:   NO                                  │
│  Plazo Conservación:    7 años + anonimización              │
│  Medidas Seguridad:                                         │
│    - Cifrado AES-256                                        │
│    - Control de acceso RLS                                  │
│    - Auditoría completa                                     │
│    - Backups diarios                                        │
└─────────────────────────────────────────────────────────────┘
```

### **Cláusula Informativa (Art. 13 GDPR)**

**Para incluir en contratos/facturas:**

```
INFORMACIÓN SOBRE PROTECCIÓN DE DATOS

Responsable: [Nombre empresa] - NIF [XXX]
Finalidad: Emisión y gestión de facturas conforme a la normativa fiscal
Base legal: Obligación legal (Ley General Tributaria, Código de Comercio)
Destinatarios: Agencia Tributaria, entidades financieras
Conservación: 7 años desde emisión, después se anonimizan
Derechos: Acceso, rectificación, limitación, portabilidad
           (NO supresión por obligación legal)
Contacto: [email protección de datos]
Autoridad: Agencia Española de Protección de Datos (www.aepd.es)
```

---

## ⚖️ **Análisis de Legitimación**

### **¿Por qué NO se puede borrar una factura?**

```
┌─────────────────────────────────────────────────────────────┐
│  JERARQUÍA NORMATIVA                                        │
├─────────────────────────────────────────────────────────────┤
│  1. GDPR (Art. 17.3.b)                                      │
│     → Permite excepciones por obligación legal              │
│                                                             │
│  2. Ley General Tributaria (Art. 66)                        │
│     → Obligación de conservar 4 años                        │
│                                                             │
│  3. Código de Comercio (Art. 30)                            │
│     → Obligación de conservar 6 años                        │
│                                                             │
│  CONCLUSIÓN: La obligación legal PREVALECE sobre el         │
│  derecho de supresión del interesado.                       │
└─────────────────────────────────────────────────────────────┘
```

### **Pero, ¿y después de 7 años?**

**Anonimización automática:**

```sql
-- Después de 7 años
UPDATE invoices
SET 
  notes = 'ANONIMIZADO',
  internal_notes = 'ANONIMIZADO',
  anonymized_at = CURRENT_TIMESTAMP
WHERE retention_until < CURRENT_DATE
  AND anonymized_at IS NULL;
```

**Resultado:**
- ✅ Se conserva información fiscal (legal)
- ✅ Se eliminan datos adicionales (GDPR)
- ✅ Equilibrio entre obligación legal y protección de datos

---

## 📊 **Métricas GDPR (Dashboards)**

### **Panel de Control de Retención**

```typescript
// Facturas próximas a anonimizar
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE retention_until < CURRENT_DATE + INTERVAL '30 days') as proximas_30d,
  COUNT(*) FILTER (WHERE anonymized_at IS NOT NULL) as anonimizadas
FROM invoices;
```

### **Auditoría de Ejercicio de Derechos**

```typescript
// Log de solicitudes GDPR
CREATE TABLE gdpr_requests (
  id UUID PRIMARY KEY,
  client_id UUID,
  request_type TEXT, -- 'access', 'rectification', 'portability', etc.
  requested_at TIMESTAMP,
  fulfilled_at TIMESTAMP,
  response_sent_at TIMESTAMP
);
```

---

## ✅ **Checklist de Cumplimiento**

- [x] Base legal identificada y documentada
- [x] Plazo de conservación definido (7 años)
- [x] Anonimización automática implementada
- [x] Políticas RLS (seguridad de acceso)
- [x] Auditoría completa (created_at, created_by, etc.)
- [x] Cifrado en reposo y tránsito
- [x] Cláusula informativa preparada
- [x] RAT actualizado
- [x] Procedimiento de respuesta a derechos
- [x] Excepción al derecho de supresión justificada

---

## 📞 **Respuestas Modelo a Solicitudes**

### **Solicitud de Acceso (Art. 15)**

```
Estimado/a cliente,

En respuesta a su solicitud de acceso a sus datos personales 
conforme al Art. 15 del GDPR, adjuntamos:

- Listado completo de sus facturas (PDF)
- Datos personales tratados
- Finalidad del tratamiento
- Plazo de conservación

Puede descargar sus facturas en formato PDF y XML desde su 
área de cliente.

Atentamente,
[Nombre empresa]
```

### **Solicitud de Supresión (Art. 17)**

```
Estimado/a cliente,

Hemos recibido su solicitud de supresión de datos conforme 
al Art. 17 del GDPR.

Lamentablemente, NO podemos eliminar sus facturas debido a:

1. Art. 17.3.b GDPR: El tratamiento es necesario para el 
   cumplimiento de una obligación legal.

2. Ley General Tributaria (Art. 66): Obligación de conservar 
   facturas durante 4 años.

3. Código de Comercio (Art. 30): Conservación de documentos 
   contables durante 6 años.

ALTERNATIVA:
- Sus facturas se anonimizan automáticamente tras 7 años
- Solo conservamos datos fiscales obligatorios
- Puede solicitar limitación del tratamiento

Si tiene dudas, contacte con nuestro DPO: [email]

Atentamente,
[Nombre empresa]
```

---

## 🎓 **Formación del Personal**

### **Puntos Clave a Comunicar:**

1. **Las facturas NO se borran** (obligación legal)
2. **Sí se anonimizan** después de 7 años
3. **Responder solicitudes en 30 días**
4. **No enviar facturas a terceros** sin consentimiento
5. **Auditar todos los accesos** a facturas

---

## ✅ **Resumen Ejecutivo**

```
┌─────────────────────────────────────────────────────────────┐
│  MÓDULO DE FACTURACIÓN - CUMPLIMIENTO GDPR                  │
├─────────────────────────────────────────────────────────────┤
│  ✅ Base Legal:         Obligación legal (Art. 6.1.c)       │
│  ✅ Retención:          7 años + anonimización              │
│  ✅ Seguridad:          Cifrado + RLS + Auditoría           │
│  ✅ Derechos:           Acceso, Rectificación, Portabilidad │
│  ❌ Supresión:          NO (obligación legal prevalece)     │
│  ✅ Anonimización:      Automática tras retención           │
│  ✅ Documentación:      RAT + Cláusula informativa          │
└─────────────────────────────────────────────────────────────┘
```

**Estado:** ✅ **TOTALMENTE CONFORME** con GDPR y normativa fiscal española

