# 🧾 Módulo de Facturación - Simplifica
## Con GDPR + Veri*Factu Ready

---

## 📋 **Índice**

1. [Arquitectura del Sistema](#arquitectura)
2. [Modelo de Datos](#modelo-de-datos)
3. [Cumplimiento GDPR](#gdpr)
4. [Preparación Veri*Factu](#verifactu)
5. [Implementación](#implementación)
6. [API y Servicios](#api)
7. [Seguridad y RLS](#seguridad)

---

## 🏗️ **Arquitectura del Sistema**

### **Componentes Principales:**

```
┌─────────────────────────────────────────────────────┐
│                  MÓDULO FACTURACIÓN                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │   Facturas   │  │   Servicios  │  │  Clientes│ │
│  │   Emitidas   │  │   Productos  │  │          │ │
│  └──────────────┘  └──────────────┘  └──────────┘ │
│         │                  │                │      │
│         └──────────────────┴────────────────┘      │
│                        ↓                            │
│         ┌──────────────────────────────┐           │
│         │   Sistema de Numeración      │           │
│         │   Series + Auto-increment    │           │
│         └──────────────────────────────┘           │
│                        ↓                            │
│         ┌──────────────────────────────┐           │
│         │      Veri*Factu              │           │
│         │   - Huella Digital (Hash)    │           │
│         │   - Cadena de bloques        │           │
│         │   - XML Firmado              │           │
│         └──────────────────────────────┘           │
│                        ↓                            │
│         ┌──────────────────────────────┐           │
│         │         GDPR                 │           │
│         │   - Anonimización            │           │
│         │   - Retención limitada       │           │
│         │   - Consentimientos          │           │
│         └──────────────────────────────┘           │
└─────────────────────────────────────────────────────┘
```

---

## 📊 **Modelo de Datos**

### **Tablas Necesarias:**

#### 1. **`invoices` (Facturas)**
```sql
- id (UUID, PK)
- company_id (UUID, FK → companies)
- client_id (UUID, FK → clients)
- invoice_number (TEXT, único por serie)
- invoice_series (TEXT, ej: "2025-A")
- invoice_date (DATE)
- due_date (DATE)
- status (ENUM: draft, sent, paid, overdue, cancelled)
- subtotal (NUMERIC)
- tax_amount (NUMERIC)
- total (NUMERIC)
- currency (TEXT, default: EUR)
- payment_method (TEXT)
- notes (TEXT)
-
- -- Veri*Factu
- verifactu_hash (TEXT) -- SHA-256 de la factura anterior
- verifactu_signature (TEXT) -- Firma digital
- verifactu_timestamp (TIMESTAMP)
- verifactu_qr_code (TEXT)
- verifactu_xml (TEXT) -- XML generado
- 
- -- GDPR
- anonymized_at (TIMESTAMP)
- retention_until (DATE) -- 7 años desde emisión
- gdpr_legal_basis (TEXT, default: 'legal_obligation')
- 
- -- Auditoría
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- created_by (UUID, FK → users)
- deleted_at (TIMESTAMP) -- Soft delete
```

#### 2. **`invoice_items` (Líneas de factura)**
```sql
- id (UUID, PK)
- invoice_id (UUID, FK → invoices)
- description (TEXT)
- quantity (NUMERIC)
- unit_price (NUMERIC)
- tax_rate (NUMERIC, ej: 21.00)
- tax_amount (NUMERIC)
- discount_percent (NUMERIC)
- subtotal (NUMERIC)
- total (NUMERIC)
- product_id (UUID, FK → products) -- Opcional
- service_id (UUID, FK → services) -- Opcional
- 
- -- Auditoría
- created_at (TIMESTAMP)
```

#### 3. **`invoice_series` (Series de facturación)**
```sql
- id (UUID, PK)
- company_id (UUID, FK → companies)
- series_code (TEXT) -- "A", "B", "RECT", etc.
- series_name (TEXT) -- "Serie General", "Rectificativas"
- year (INTEGER) -- 2025
- prefix (TEXT) -- "2025-A-"
- next_number (INTEGER) -- Auto-increment
- is_active (BOOLEAN)
- is_default (BOOLEAN)
- 
- -- Veri*Factu
- verifactu_enabled (BOOLEAN, default: true)
- last_verifactu_hash (TEXT) -- Último hash generado
- 
- -- Auditoría
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### 4. **`invoice_payments` (Pagos)**
```sql
- id (UUID, PK)
- invoice_id (UUID, FK → invoices)
- payment_date (DATE)
- amount (NUMERIC)
- payment_method (TEXT)
- reference (TEXT) -- Número de transferencia, etc.
- notes (TEXT)
- 
- -- Auditoría
- created_at (TIMESTAMP)
- created_by (UUID, FK → users)
```

#### 5. **`invoice_templates` (Plantillas)**
```sql
- id (UUID, PK)
- company_id (UUID, FK → companies)
- name (TEXT)
- html_template (TEXT) -- HTML del diseño
- css_styles (TEXT)
- is_default (BOOLEAN)
- 
- -- Auditoría
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

---

## 🔒 **Cumplimiento GDPR**

### **Requisitos Implementados:**

#### 1. **Retención Limitada**
```sql
-- Las facturas se conservan 7 años (normativa fiscal española)
retention_until = invoice_date + 7 years

-- Después, se anonimizan (NO se borran por ley fiscal)
```

#### 2. **Anonimización Automática**
```sql
-- Trigger que anonimiza facturas antiguas
CREATE TRIGGER anonymize_old_invoices
  AFTER UPDATE ON invoices
  FOR EACH ROW
  WHEN (OLD.retention_until < CURRENT_DATE AND NEW.anonymized_at IS NULL)
  EXECUTE FUNCTION anonymize_invoice_data();
```

#### 3. **Base Legal**
```sql
-- Toda factura tiene base legal
gdpr_legal_basis = 'legal_obligation' -- Art. 6.1.c GDPR
-- (Obligación legal fiscal)
```

#### 4. **Derechos del Cliente**
- ✅ **Acceso**: Cliente puede ver sus facturas
- ✅ **Rectificación**: Facturas rectificativas
- ❌ **Supresión**: NO permitido (obligación fiscal)
- ✅ **Portabilidad**: Exportar a PDF/XML

---

## 📜 **Preparación Veri*Factu**

### **¿Qué es Veri*Factu?**

Sistema de **verificación de facturas** obligatorio en España para:
- Evitar fraude fiscal
- Garantizar inmutabilidad de facturas
- Crear cadena de confianza

### **Requisitos Técnicos:**

#### 1. **Huella Digital (Hash)**
```typescript
// Cada factura incluye hash SHA-256 de la anterior
hash_actual = SHA256(
  hash_anterior +
  numero_factura +
  fecha_emision +
  importe_total +
  cif_emisor +
  cif_receptor
)
```

#### 2. **Cadena de Bloques**
```
Factura 1 → Hash1
            ↓
Factura 2 → Hash2 (incluye Hash1)
            ↓
Factura 3 → Hash3 (incluye Hash2)
```

#### 3. **Firma Digital**
```typescript
// Firma con certificado digital de la empresa
signature = sign_with_certificate(
  invoice_data,
  company_certificate
)
```

#### 4. **Código QR**
```
QR Code → URL verificación AEAT
        → Datos básicos factura
        → Hash para validación
```

#### 5. **XML Estructurado**
```xml
<FacturaVerifactu>
  <Cabecera>
    <NumFactura>2025-A-00001</NumFactura>
    <FechaExpedicion>2025-10-15</FechaExpedicion>
  </Cabecera>
  <Huella>
    <AlgoritmoHuella>SHA-256</AlgoritmoHuella>
    <Huella>abc123...</Huella>
  </Huella>
  <Firma>xyz789...</Firma>
</FacturaVerifactu>
```

---

## 🚀 **Plan de Implementación**

### **Fase 1: Base de Datos** (Ahora)
1. ✅ Crear tablas SQL
2. ✅ Configurar RLS policies
3. ✅ Triggers automáticos
4. ✅ Funciones auxiliares

### **Fase 2: Backend Services** (Siguiente)
1. ✅ Servicio de facturación Angular
2. ✅ Generación de numeración
3. ✅ Cálculos de impuestos
4. ✅ Estado de facturas

### **Fase 3: Veri*Factu** (Preparación)
1. ⏳ Generación de hash
2. ⏳ Cadena de bloques
3. ⏳ Código QR
4. ⏳ XML estructurado
5. ⚠️ Firma digital (requiere certificado)

### **Fase 4: GDPR** (Integrado)
1. ✅ Anonimización automática
2. ✅ Retención 7 años
3. ✅ Auditoría completa
4. ✅ Consentimientos

### **Fase 5: UI/UX** (Última)
1. ⏳ Listado de facturas
2. ⏳ Creación/edición
3. ⏳ Generación PDF
4. ⏳ Dashboard analytics

---

## 📁 **Estructura de Archivos**

```
src/
├── app/
│   ├── modules/
│   │   └── invoicing/
│   │       ├── components/
│   │       │   ├── invoice-list/
│   │       │   ├── invoice-form/
│   │       │   ├── invoice-detail/
│   │       │   └── invoice-pdf/
│   │       ├── services/
│   │       │   ├── invoice.service.ts
│   │       │   ├── invoice-series.service.ts
│   │       │   ├── verifactu.service.ts
│   │       │   └── invoice-pdf.service.ts
│   │       ├── models/
│   │       │   ├── invoice.model.ts
│   │       │   ├── invoice-item.model.ts
│   │       │   └── verifactu.model.ts
│   │       └── invoicing.module.ts
│   │
│   └── services/
│       └── supabase-invoices.service.ts

supabase/
└── migrations/
    ├── 20251015_create_invoices.sql
    ├── 20251015_create_invoice_items.sql
    ├── 20251015_create_invoice_series.sql
    ├── 20251015_create_invoice_payments.sql
    ├── 20251015_create_verifactu_functions.sql
    └── 20251015_create_gdpr_invoice_policies.sql
```

---

## 🎯 **Próximos Pasos**

¿Por dónde empezamos?

1. **Crear base de datos completa** (SQL)
2. **Servicios Angular** (TypeScript)
3. **Componentes UI** (HTML/SCSS)
4. **Integración Veri*Factu** (Avanzado)

**Recomendación**: Empezar por la base de datos (SQL) y servicios básicos, luego avanzar a Veri*Factu.

---

¿Quieres que empiece creando los scripts SQL de la base de datos? 🚀
