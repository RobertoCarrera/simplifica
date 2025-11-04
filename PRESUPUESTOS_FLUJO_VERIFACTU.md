# PRESUPUESTOS → FACTURAS: Flujo Veri*Factu

## 📌 RESUMEN

Este documento explica cómo funciona el sistema de presupuestos y su conversión a facturas cumpliendo con la normativa **Veri*Factu** de la AEAT.

---

## 🔄 FLUJO COMPLETO

### ETAPA 1: Presupuesto (Quote)

```
┌─────────────────────────────────────────────────────┐
│  EMPRESA crea PRESUPUESTO                           │
│  ├─ Cliente: Juan Pérez                             │
│  ├─ Concepto: Desarrollo web                        │
│  ├─ Importe: 1.000€ + IVA = 1.210€                  │
│  ├─ Válido hasta: 2025-11-15                        │
│  └─ Estado: DRAFT                                   │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  EMPRESA envía a CLIENTE                            │
│  └─ Estado: SENT                                    │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  CLIENTE visualiza presupuesto                      │
│  ├─ URL: /quotes/client/abc-123/token-xyz          │
│  ├─ Tracking: IP, User-Agent, Fecha                │
│  └─ Estado: VIEWED                                  │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  CLIENTE acepta presupuesto                         │
│  ├─ Botón: "Aceptar Presupuesto"                   │
│  ├─ Fecha aceptación guardada                      │
│  └─ Estado: ACCEPTED ✅                             │
└─────────────────────────────────────────────────────┘
```

### ETAPA 2: Conversión a Factura

```
┌─────────────────────────────────────────────────────┐
│  EMPRESA convierte a FACTURA                        │
│  ├─ Botón: "Convertir a Factura"                   │
│  └─ Llama: convertToInvoice(quote_id)              │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  FUNCIÓN SQL: convert_quote_to_invoice()            │
│  ├─ 1. Valida estado = ACCEPTED                    │
│  ├─ 2. Obtiene serie de factura                    │
│  ├─ 3. Genera número: 2025-F-00042                 │
│  ├─ 4. Crea registro en tabla invoices             │
│  ├─ 5. Copia items con precios exactos             │
│  ├─ 6. Actualiza quote: status=INVOICED            │
│  └─ 7. Guarda invoice_id en quote                  │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  TRIGGERS AUTOMÁTICOS (Factura)                     │
│  ├─ calculate_invoice_totals()                     │
│  ├─ generate_verifactu_hash()                      │
│  └─ update_invoice_status()                        │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  FACTURA REGISTRADA                                 │
│  ├─ Número: 2025-F-00042                           │
│  ├─ Hash Veri*Factu: SHA-256(...)                  │
│  ├─ Estado: DRAFT                                   │
│  ├─ Referencia: "Desde presupuesto 2025-P-00015"  │
│  └─ Quote: invoice_id = abc-factura-123            │
└─────────────────────────────────────────────────────┘
```

### ETAPA 3: Registro Veri*Factu

```
┌─────────────────────────────────────────────────────┐
│  EMPRESA finaliza FACTURA                           │
│  ├─ Cambia estado: DRAFT → SENT                    │
│  └─ Trigger: generate_verifactu_hash()             │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  SISTEMA VERI*FACTU                                 │
│  ├─ Hash SHA-256 calculado                         │
│  ├─ Blockchain: hash anterior + datos              │
│  ├─ QR generado: Base64 del XML                    │
│  ├─ XML estructurado (formato AEAT)                │
│  └─ ⏳ Firma digital (pendiente certificado)       │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  FACTURA REGISTRADA EN BLOCKCHAIN                   │
│  ├─ Inmutable                                       │
│  ├─ Verificable                                     │
│  ├─ Auditable                                       │
│  └─ Cumple Veri*Factu ✅                            │
└─────────────────────────────────────────────────────┘
```

---

## ⚖️ MARCO LEGAL

### ¿Por qué presupuestos NO van a Veri*Factu?

**Veri*Factu** es un sistema de **verificación de facturas** (Real Decreto 1007/2023).

- ✅ **Facturas**: Documentos fiscales obligatorios → **SÍ se registran**
- ❌ **Presupuestos**: Documentos comerciales previos → **NO se registran**
- ✅ **Conversión**: Presupuesto aceptado → Factura → **Entonces SÍ se registra**

### Normativa aplicable

| Documento | Normativa | Obligación |
|-----------|-----------|------------|
| Presupuesto | Código de Comercio | Conservar 6 años |
| Factura | Ley General Tributaria | Conservar 4 años + Veri*Factu |
| Datos personales | GDPR | Anonimizar tras 7 años |

---

## 🔐 INTEGRIDAD DE DATOS

### Garantías del sistema

1. **Trazabilidad completa**
   - Quote ID → Invoice ID (bidireccional)
   - Historial de estados
   - Auditoría de cambios

2. **Inmutabilidad**
   - Presupuesto aceptado → No se puede editar
   - Factura generada → Enlazada permanentemente
   - Items copiados → Precios congelados

3. **Verificación**
   - Hash Veri*Factu → Blockchain
   - QR code → Verificación cliente
   - Firma digital → Autenticidad (futuro)

---

## 💡 CASOS DE USO

### Caso 1: Cliente acepta presupuesto

```typescript
// 1. Cliente ve presupuesto público
GET /quotes/client/abc-123/token-xyz

// 2. Sistema registra visualización
quotesService.markQuoteAsViewed(id, ip, userAgent);

// 3. Cliente acepta
quotesService.acceptQuote(id);

// 4. Empresa convierte
quotesService.convertToInvoice(quoteId).subscribe(result => {
  console.log('Factura creada:', result.invoice_id);
  // Resultado: { invoice_id: '...', success: true }
});

// 5. Factura entra en Veri*Factu automáticamente
```

### Caso 2: Presupuesto expira

```typescript
// Job diario (cron)
quotesService.markExpiredQuotes().subscribe(count => {
  console.log(`${count} presupuestos marcados como expirados`);
});

// SQL automático
UPDATE quotes
SET status = 'expired'
WHERE status IN ('draft', 'sent', 'viewed')
  AND valid_until < CURRENT_DATE;
```

### Caso 3: Cliente rechaza

```typescript
// Cliente rechaza presupuesto
quotesService.rejectQuote(id);

// Quote status: REJECTED
// No se puede convertir a factura
// Se conserva para histórico
```

---

## 📊 DATOS CONSERVADOS

### En el Presupuesto (Quote)

```sql
SELECT 
  full_quote_number,        -- 2025-P-00015
  client_id,                -- Referencia cliente
  status,                   -- INVOICED
  accepted_at,              -- 2025-10-20T10:30:00Z
  invoice_id,               -- abc-factura-123
  total_amount,             -- 1210.00
  retention_until           -- 2032-10-15 (7 años)
FROM quotes
WHERE id = 'abc-quote-123';
```

### En la Factura (Invoice)

```sql
SELECT 
  full_invoice_number,      -- 2025-F-00042
  client_id,                -- Mismo cliente
  notes,                    -- "Generada desde presupuesto 2025-P-00015"
  total_amount,             -- 1210.00 (mismo importe)
  verifactu_hash,           -- SHA-256(...)
  verifactu_qr_code,        -- Base64(...)
  created_at                -- 2025-10-20T10:35:00Z
FROM invoices
WHERE id = 'abc-factura-123';
```

### En los Items

**Quote Items** (Presupuesto):
```sql
SELECT description, quantity, unit_price, tax_rate, total
FROM quote_items
WHERE quote_id = 'abc-quote-123';
```

**Invoice Items** (Factura):
```sql
SELECT description, quantity, unit_price, tax_rate, total
FROM invoice_items
WHERE invoice_id = 'abc-factura-123';
```

**Resultado**: Items idénticos, precios congelados ✅

---

## 🚨 VALIDACIONES

### Al convertir presupuesto

```typescript
// Función SQL: convert_quote_to_invoice()

// ❌ ERROR: Estado incorrecto
IF v_quote.status != 'accepted' THEN
  RAISE EXCEPTION 'Solo se pueden convertir presupuestos aceptados';
END IF;

// ❌ ERROR: Ya convertido
IF v_quote.invoice_id IS NOT NULL THEN
  RAISE EXCEPTION 'Este presupuesto ya fue convertido a factura';
END IF;

// ❌ ERROR: Sin serie de factura
IF p_invoice_series_id IS NULL THEN
  RAISE EXCEPTION 'No hay serie de factura por defecto configurada';
END IF;

// ✅ OK: Proceder a crear factura
```

### En el frontend

```typescript
canConvertToInvoice(quote: Quote): boolean {
  return quote.status === QuoteStatus.ACCEPTED && !quote.invoice_id;
}

// UI: Botón deshabilitado si no cumple condiciones
```

---

## 🔄 ESTADOS Y TRANSICIONES

### Diagrama de estados

```
DRAFT ──────────────────────> SENT
  │                             │
  │                             ▼
  │                          VIEWED
  │                             │
  │                      ┌──────┴──────┐
  │                      ▼             ▼
  ▼                   ACCEPTED      REJECTED
CANCELLED               │             │
                        ▼             │
                    INVOICED          │
                                      │
                    ┌─────────────────┘
                    ▼
                 EXPIRED
```

### Reglas de transición

| Desde | Hacia | Acción | Reversible |
|-------|-------|--------|------------|
| DRAFT | SENT | `sendQuote()` | ❌ |
| SENT | VIEWED | `markQuoteAsViewed()` | ❌ |
| VIEWED | ACCEPTED | `acceptQuote()` | ❌ |
| VIEWED | REJECTED | `rejectQuote()` | ❌ |
| ACCEPTED | INVOICED | `convertToInvoice()` | ❌ |
| * | CANCELLED | Usuario cancela | ❌ |
| DRAFT/SENT/VIEWED | EXPIRED | Job automático | ❌ |

**Importante**: ❌ Ninguna transición es reversible (inmutabilidad)

---

## 📱 VISTA PÚBLICA PARA CLIENTES

### URL compartible

```
https://tuapp.com/quotes/client/{quote_id}/{security_token}
```

**Características**:
- ✅ No requiere login
- ✅ Token de seguridad único
- ✅ Branding de tu empresa
- ✅ Botones: Aceptar / Rechazar
- ✅ Tracking automático
- ✅ Responsive (mobile-friendly)

### Implementación

```typescript
@Component({
  selector: 'app-quote-client-view',
  template: `
    <div class="public-quote">
      <img [src]="company.logo_url" />
      <h1>Presupuesto {{ quote.full_quote_number }}</h1>
      
      <div class="quote-details">
        <!-- Items, totales, condiciones -->
      </div>

      @if (canAccept()) {
        <div class="actions">
          <button (click)="accept()">✅ Aceptar Presupuesto</button>
          <button (click)="reject()">❌ Rechazar</button>
        </div>
      }

      @if (quote.status === 'accepted') {
        <div class="success">
          ✅ Presupuesto aceptado el {{ quote.accepted_at }}
        </div>
      }
    </div>
  `
})
export class QuoteClientViewComponent {
  // Carga quote sin autenticación
  // Valida token de seguridad
  // Permite aceptar/rechazar
}
```

---

## 🎯 VENTAJAS DEL SISTEMA

### Para la Empresa

- ✅ **Automatización**: Conversión automática presupuesto → factura
- ✅ **Cumplimiento**: Veri*Factu automático en facturas
- ✅ **Trazabilidad**: Historial completo del proceso
- ✅ **Eficiencia**: No duplicar datos, copiar de presupuesto
- ✅ **Legal**: Cumple GDPR y normativa fiscal

### Para el Cliente

- ✅ **Transparencia**: Ve presupuesto profesional
- ✅ **Facilidad**: Aceptar/rechazar con un clic
- ✅ **Seguridad**: URL con token único
- ✅ **Mobile**: Funciona en cualquier dispositivo
- ✅ **Confianza**: Branding de empresa conocida

### Para Auditorías

- ✅ **Inmutable**: No se pueden alterar datos
- ✅ **Verificable**: Hash blockchain Veri*Factu
- ✅ **Completo**: Todos los estados registrados
- ✅ **Conforme**: Cumple todas las normativas

---

## 🔮 PRÓXIMAS FUNCIONALIDADES

1. **Generación automática de PDF**
   - Plantillas personalizables
   - Logo y branding
   - Envío por email

2. **Notificaciones**
   - Email cuando cliente ve presupuesto
   - Email cuando acepta/rechaza
   - Recordatorio de expiración

3. **Plantillas**
   - Presupuestos predefinidos
   - Items recurrentes
   - Términos y condiciones

4. **Estadísticas**
   - Tasa de aceptación
   - Tiempo medio de respuesta
   - Valor medio de presupuestos

---

## ✅ CHECKLIST IMPLEMENTACIÓN

- [x] SQL migración ejecutada
- [x] Modelos TypeScript creados
- [x] Servicio Angular creado
- [ ] Componente lista implementado
- [ ] Componente formulario implementado
- [ ] Componente vista cliente implementado
- [ ] Routing configurado
- [ ] Prueba crear presupuesto
- [ ] Prueba conversión a factura
- [ ] Verificar hash Veri*Factu

---

**Fecha**: 2025-10-15  
**Sistema**: Presupuestos → Facturas con Veri*Factu  
**Estado**: ✅ Backend completo, UI en progreso

