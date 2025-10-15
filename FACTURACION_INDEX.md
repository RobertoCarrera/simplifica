# 📚 Módulo de Facturación - Índice de Documentación

## 🎯 **Inicio Rápido**

¿Primera vez? Empieza aquí:

1. 📋 **[FACTURACION_RESUMEN_EJECUTIVO.md](FACTURACION_RESUMEN_EJECUTIVO.md)**
   → Visión general del módulo (5 minutos de lectura)

2. 🚀 **[FACTURACION_QUICK_START.md](FACTURACION_QUICK_START.md)**
   → Guía de implementación rápida (15 minutos)

3. ✅ **[FACTURACION_CHECKLIST.md](FACTURACION_CHECKLIST.md)**
   → Lista de verificación completa

---

## 📖 **Documentación Completa**

### **Planificación y Arquitectura**

| Documento | Descripción | Contenido |
|-----------|-------------|-----------|
| **[FACTURACION_PLAN_COMPLETO.md](FACTURACION_PLAN_COMPLETO.md)** | Plan de implementación completo | Arquitectura, modelo de datos, fases, estructura de archivos |

### **Cumplimiento Legal**

| Documento | Descripción | Contenido |
|-----------|-------------|-----------|
| **[FACTURACION_GDPR_COMPLIANCE.md](FACTURACION_GDPR_COMPLIANCE.md)** | Cumplimiento GDPR detallado | Requisitos, derechos, medidas de seguridad, documentación RAT |
| **[FACTURACION_PLANTILLAS_GDPR.md](FACTURACION_PLANTILLAS_GDPR.md)** | Plantillas de respuesta | 6 plantillas listas para usar: Acceso, Rectificación, Supresión, etc. |

### **Veri*Factu**

| Documento | Descripción | Contenido |
|-----------|-------------|-----------|
| **[Veri-Factu_Descripcion_SWeb.pdf](Veri-Factu_Descripcion_SWeb.pdf)** | Especificación oficial | Documentación AEAT adjunta |
| **Servicio Veri*Factu** | Implementación en código | `src/app/services/verifactu.service.ts` |

---

## 💾 **Base de Datos**

### **Scripts SQL**

| Archivo | Descripción | Tamaño | Tablas |
|---------|-------------|--------|--------|
| **[supabase/migrations/20251015_invoicing_complete_system.sql](supabase/migrations/20251015_invoicing_complete_system.sql)** | Script SQL completo | ~500 líneas | 5 tablas + triggers + funciones + RLS |

### **Tablas Creadas**

1. `invoice_series` → Series de facturación
2. `invoices` → Facturas emitidas
3. `invoice_items` → Líneas de factura
4. `invoice_payments` → Pagos recibidos
5. `invoice_templates` → Plantillas de diseño

### **Funciones SQL**

- `get_next_invoice_number()` → Numeración automática
- `calculate_invoice_totals()` → Cálculo de totales
- `anonymize_invoice_data()` → Anonimización GDPR
- `generate_verifactu_hash()` → Hash Veri*Factu

---

## 💻 **Código TypeScript**

### **Modelos**

| Archivo | Descripción | Exports |
|---------|-------------|---------|
| **[src/app/models/invoice.model.ts](src/app/models/invoice.model.ts)** | Modelos de facturación | 15+ interfaces, 3 enums, utilidades |

**Interfaces principales:**
- `Invoice` → Factura completa
- `InvoiceItem` → Línea de factura
- `InvoicePayment` → Pago
- `InvoiceSeries` → Serie
- `CreateInvoiceDTO` → DTO de creación
- `InvoiceFilters` → Filtros de búsqueda
- `InvoiceStats` → Estadísticas

**Enums:**
- `InvoiceStatus` → Estado de factura
- `PaymentMethod` → Método de pago
- `InvoiceType` → Tipo de factura

### **Servicios**

| Archivo | Descripción | Métodos |
|---------|-------------|---------|
| **[src/app/services/supabase-invoices.service.ts](src/app/services/supabase-invoices.service.ts)** | CRUD de facturas | 25+ métodos |
| **[src/app/services/verifactu.service.ts](src/app/services/verifactu.service.ts)** | Veri*Factu | Hash, QR, XML, firma |

**Métodos principales del servicio:**

#### Series
- `getInvoiceSeries()` → Listar series
- `getDefaultSeries()` → Serie por defecto
- `createInvoiceSeries()` → Crear serie

#### Facturas
- `getInvoices(filters?)` → Listar con filtros
- `getInvoice(id)` → Obtener una
- `createInvoice(dto)` → Crear nueva
- `updateInvoice(id, dto)` → Actualizar
- `deleteInvoice(id)` → Eliminar (soft delete)

#### Líneas
- `addInvoiceItem()` → Añadir línea
- `updateInvoiceItem()` → Actualizar línea
- `deleteInvoiceItem()` → Eliminar línea

#### Pagos
- `createPayment()` → Registrar pago
- `deletePayment()` → Eliminar pago

#### Estados
- `markAsSent()` → Marcar enviada
- `cancelInvoice()` → Cancelar
- `changeInvoiceStatus()` → Cambiar estado

#### Analytics
- `getInvoiceStats()` → Estadísticas completas

---

## 🎨 **UI/UX (Pendiente de crear)**

### **Componentes a Crear**

```
src/app/modules/invoicing/
├── components/
│   ├── invoice-list/          → Listado de facturas
│   ├── invoice-form/          → Crear/editar factura
│   ├── invoice-detail/        → Detalle de factura
│   ├── invoice-pdf/           → Visualizar PDF
│   ├── invoice-dashboard/     → Dashboard analytics
│   └── invoice-payment-form/  → Registrar pago
├── services/
│   └── invoice-pdf.service.ts → Generación de PDF
└── invoicing.module.ts
```

### **Rutas Sugeridas**

```
/invoices              → Lista de facturas
/invoices/new          → Nueva factura
/invoices/:id          → Detalle de factura
/invoices/:id/edit     → Editar factura
/invoices/:id/pdf      → Ver PDF
/invoices/dashboard    → Dashboard analytics
```

---

## 📊 **Flujos de Trabajo**

### **1. Crear Factura**

```
Usuario → Formulario → Servicio → Supabase
                ↓
         Trigger SQL calcula totales
                ↓
         Numeración automática
                ↓
         Retorna factura completa
```

### **2. Registrar Pago**

```
Usuario → Formulario → createPayment()
                ↓
         Trigger recalcula paid_amount
                ↓
         Actualiza estado automáticamente
         (partial → paid si total cubierto)
```

### **3. Anonimización GDPR**

```
Cron diario → Verifica retention_until
                ↓
         Trigger anonimiza notas
                ↓
         Conserva datos fiscales
                ↓
         Marca anonymized_at
```

---

## 🔒 **Seguridad**

### **RLS Policies**

Cada tabla tiene 4 políticas:
1. `SELECT` → Ver solo de tu empresa
2. `INSERT` → Crear solo en tu empresa
3. `UPDATE` → Modificar solo de tu empresa
4. `DELETE` → Eliminar solo de tu empresa

### **Función de Seguridad**

```sql
get_user_company_id() → UUID
```

Retorna el `company_id` del usuario autenticado.

---

## 📋 **Ejemplos de Uso**

### **Ejemplo 1: Listar Facturas**

```typescript
this.invoiceService.getInvoices().subscribe({
  next: (invoices) => console.log(invoices),
  error: (err) => console.error(err)
});
```

### **Ejemplo 2: Crear Factura**

```typescript
const dto: CreateInvoiceDTO = {
  client_id: 'uuid-del-cliente',
  items: [
    {
      description: 'Consultoría',
      quantity: 10,
      unit_price: 50.00,
      tax_rate: 21
    }
  ]
};

this.invoiceService.createInvoice(dto).subscribe({
  next: (invoice) => console.log('Creada:', invoice.full_invoice_number)
});
```

### **Ejemplo 3: Registrar Pago**

```typescript
this.invoiceService.createPayment({
  invoice_id: 'uuid-factura',
  payment_date: '2025-10-20',
  amount: 500.00,
  payment_method: PaymentMethod.BANK_TRANSFER,
  reference: 'TRANSFER-123'
}).subscribe();
```

### **Ejemplo 4: Estadísticas**

```typescript
this.invoiceService.getInvoiceStats().subscribe({
  next: (stats) => {
    console.log('Total:', stats.total_amount);
    console.log('Pagado:', stats.paid_amount);
    console.log('Pendiente:', stats.pending_amount);
  }
});
```

---

## 🧪 **Testing**

### **Tests SQL (Supabase)**

```sql
-- Verificar tablas
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' AND tablename LIKE 'invoice%';

-- Verificar RLS
SELECT tablename, policyname FROM pg_policies 
WHERE tablename LIKE 'invoice%';

-- Test de numeración
SELECT get_next_invoice_number('uuid-serie');

-- Test de cálculo
SELECT * FROM calculate_invoice_totals('uuid-factura');
```

### **Tests Angular (Pendiente)**

```bash
ng test
ng e2e
```

---

## 📦 **Dependencias NPM**

### **Requeridas**

```json
{
  "crypto-js": "^4.x.x",      // Hash SHA-256
  "qrcode": "^1.x.x"          // QR codes
}
```

### **Dev Dependencies**

```json
{
  "@types/qrcode": "^1.x.x"   // TypeScript types
}
```

### **Opcionales (Futuro)**

```json
{
  "node-forge": "^1.x.x",     // Firma digital
  "chart.js": "^4.x.x",       // Gráficos
  "ng2-charts": "^5.x.x",     // Wrapper Angular
  "jspdf": "^2.x.x",          // Generación PDF
  "html2canvas": "^1.x.x"     // HTML to Canvas
}
```

---

## 🎯 **Roadmap**

### **✅ Completado (Backend)**

- [x] Tablas SQL con RLS
- [x] Triggers automáticos
- [x] Funciones auxiliares
- [x] Modelos TypeScript
- [x] Servicios CRUD
- [x] GDPR compliance
- [x] Veri*Factu preparado (80%)

### **⏳ En Curso**

- [ ] Componentes UI
- [ ] Generación PDF
- [ ] Dashboard analytics

### **🚧 Futuro**

- [ ] Certificado digital
- [ ] Firma PKCS#7
- [ ] API AEAT
- [ ] Facturación recurrente
- [ ] Multi-moneda
- [ ] Exportar a contabilidad

---

## 📞 **Soporte**

### **Documentación Técnica**

- Supabase: https://supabase.com/docs
- GDPR: https://gdpr.eu
- AEAT: https://www.agenciatributaria.es

### **Contactos Útiles**

- **AEPD**: https://www.aepd.es (GDPR)
- **FNMT**: https://www.sede.fnmt.gob.es (Certificados)
- **Supabase Support**: https://supabase.com/support

---

## 📊 **Métricas del Proyecto**

```
Archivos creados:           11
Líneas de código SQL:       ~500
Líneas de código TS:        ~1,200
Documentación (páginas):    ~50
Tablas de BD:               5
Funciones SQL:              4
Triggers:                   8
RLS Policies:               20
Interfaces TypeScript:      15+
Métodos de servicio:        25+
```

---

## ✅ **Estado Final**

```
┌─────────────────────────────────────────────────────────────┐
│  MÓDULO DE FACTURACIÓN - ESTADO GLOBAL                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📊 Backend (SQL)              ████████████████████ 100%   │
│  💻 Modelos (TS)               ████████████████████ 100%   │
│  🔧 Servicios (TS)             ████████████████████ 100%   │
│  🔒 GDPR                       ████████████████████ 100%   │
│  📜 Veri*Factu                 ████████████████░░░░  80%   │
│  🎨 UI/UX                      ░░░░░░░░░░░░░░░░░░░░   0%   │
│  📄 Generación PDF             ░░░░░░░░░░░░░░░░░░░░   0%   │
│  📊 Dashboard                  ░░░░░░░░░░░░░░░░░░░░   0%   │
│                                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  PROGRESO TOTAL:               ████████████░░░░░░░░  60%   │
│                                                             │
│  ✅ Backend listo para producción                          │
│  ⏳ Falta implementar UI                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎉 **¡Listo para Empezar!**

**Siguiente paso:**

1. Ejecuta el script SQL → `supabase/migrations/20251015_invoicing_complete_system.sql`
2. Instala dependencias → `npm install crypto-js qrcode`
3. Empieza a crear UI → Lee `FACTURACION_QUICK_START.md`

**¿Dudas?** Consulta `FACTURACION_RESUMEN_EJECUTIVO.md`

---

**Creado:** 15 de octubre de 2025  
**Autor:** GitHub Copilot + Roberto Carrera  
**Versión:** 1.0.0  
**Licencia:** Uso interno - Simplifica - DigitalizamosTuPyme

---

¡Feliz facturación! 🧾💰🚀
