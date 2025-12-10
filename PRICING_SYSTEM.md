# Sistema de Precios e Impuestos - Simplifica CRM

## Resumen Ejecutivo

El sistema soporta dos modos de trabajo:

| Configuración | El usuario introduce | Se muestra como "Total" |
|---------------|---------------------|-------------------------|
| `prices_include_tax = TRUE` | 150€ (IVA incluido) | **150€** |
| `prices_include_tax = FALSE` | 150€ (sin IVA) | **181,50€** |

## Glosario de Términos

| Campo | Descripción |
|-------|-------------|
| `unit_price` | El precio que introduce el usuario (tal cual) |
| `subtotal` | Base imponible (precio neto, sin IVA) |
| `tax_amount` | Importe del IVA |
| `irpf_amount` | Retención IRPF (se resta del total) |
| `total` | **Lo que paga el cliente** = subtotal + IVA - IRPF |

## Cómo Funciona

### Cuando `prices_include_tax = TRUE` (IVA incluido)

El usuario trabaja con precios finales. Cuando introduce 150€, ese es el precio que ve el cliente.

```
Usuario introduce: 150€ (precio con IVA incluido)

Cálculos internos:
├── subtotal   = 150 / 1.21 = 123,97€  (base imponible extraída)
├── tax_amount = 150 - 123,97 = 26,03€ (IVA implícito)
└── total      = 150€                   (lo que paga el cliente)

En pantalla:
├── Precio unitario: 150,00€ (IVA inc.)
├── Subtotal: 123,97€
├── IVA (21%): 26,03€
└── Total: 150,00€ ✓
```

### Cuando `prices_include_tax = FALSE` (IVA no incluido)

El usuario trabaja con precios netos. Cuando introduce 150€, se añade el IVA encima.

```
Usuario introduce: 150€ (precio sin IVA)

Cálculos internos:
├── subtotal   = 150€           (base imponible directa)
├── tax_amount = 150 × 0.21 = 31,50€
└── total      = 150 + 31,50 = 181,50€

En pantalla:
├── Precio unitario: 150,00€ (sin IVA)
├── Subtotal: 150,00€
├── IVA (21%): 31,50€
└── Total: 181,50€ ✓
```

## Reglas de Visualización

### ⚠️ IMPORTANTE: El "Total" SIEMPRE es lo que paga el cliente

No importa la configuración de `prices_include_tax`:
- **Total = subtotal + tax_amount - irpf_amount**
- Es el importe final que aparece en la factura
- Es lo que se cobra al cliente

### Lo que cambia según configuración

| Configuración | Etiqueta en UI | Valor mostrado |
|--------------|----------------|----------------|
| `prices_include_tax = TRUE` | "Precio Unit. (IVA inc.)" | unit_price directamente |
| `prices_include_tax = FALSE` | "Precio Unit. (sin IVA)" | unit_price directamente |

## Tablas de Base de Datos

### Campos en `quotes` / `invoices`

```sql
subtotal     -- Base imponible total (suma de subtotales de items)
tax_amount   -- IVA total
total / total_amount -- Lo que paga el cliente
```

### Campos en `quote_items` / `invoice_items`

```sql
unit_price       -- El precio que introduce el usuario
quantity         -- Cantidad
discount_percent -- Descuento en porcentaje
tax_rate         -- Tipo de IVA (0, 4, 10, 21)
subtotal         -- Base imponible del item
tax_amount       -- IVA del item
total            -- Total del item (subtotal + IVA)
```

## Configuración

### ⚠️ Jerarquía de Configuración (IMPORTANTE)

La configuración de impuestos sigue esta jerarquía de prioridad:

```
1. company_settings (configuración específica de la empresa) - MÁXIMA PRIORIDAD
       ↓ si es NULL
2. app_settings (configuración global por defecto)
       ↓ si es NULL  
3. false (valor por defecto del sistema)
```

**Patrón de código correcto:**
```typescript
// Frontend (TypeScript)
const effective = (company?.prices_include_tax ?? null) ?? (app?.default_prices_include_tax ?? false);

// Backend (SQL)
SELECT COALESCE(
  (SELECT prices_include_tax FROM company_settings WHERE company_id = $1),
  (SELECT default_prices_include_tax FROM app_settings WHERE company_id = $1),
  false
) INTO v_prices_include_tax;
```

### Tablas de Configuración

1. **`app_settings`** (valores globales por defecto)
   - `default_prices_include_tax`
   - `default_iva_enabled`
   - `default_iva_rate`
   - `default_irpf_enabled`
   - `default_irpf_rate`

2. **`company_settings`** (override por empresa)
   - `prices_include_tax`
   - `iva_enabled`
   - `iva_rate`
   - `irpf_enabled`
   - `irpf_rate`

## Trigger de Base de Datos

El trigger `calculate_quote_item_totals()` calcula automáticamente los valores al insertar/actualizar items:

```sql
-- Si prices_include_tax = TRUE:
total := quantity * unit_price;  -- Total es el precio introducido
subtotal := total / (1 + tax_rate/100);  -- Extraer base imponible
tax_amount := total - subtotal;  -- IVA implícito

-- Si prices_include_tax = FALSE:
subtotal := quantity * unit_price;  -- Subtotal es el precio introducido
tax_amount := subtotal * (tax_rate/100);  -- Calcular IVA
total := subtotal + tax_amount;  -- Total = base + IVA
```

## Archivos Clave

| Archivo | Descripción |
|---------|-------------|
| `src/app/shared/utils/pricing.utils.ts` | Utilidades de cálculo centralizadas |
| `supabase/migrations/20251122_fix_quote_item_trigger_v2.sql` | Trigger de BD |
| `src/app/modules/quotes/quote-form/quote-form.component.ts` | Formulario de presupuestos |
| `src/app/modules/quotes/quote-detail/quote-detail.component.ts` | Detalle de presupuestos |
| `src/app/modules/invoices/invoice-detail/invoice-detail.component.ts` | Detalle de facturas |

## Errores Comunes a Evitar

1. ❌ **Mostrar `subtotal` como "Total"** cuando `prices_include_tax = TRUE`
   - El usuario espera ver 150€, no 123,97€

2. ❌ **Calcular IVA dos veces**
   - Si el precio ya incluye IVA, no añadir más

3. ❌ **Confundir `displayTotal()` con `subtotal()`**
   - `displayTotal()` SIEMPRE debe devolver el `total` real

## Testing

Para verificar que el sistema funciona:

1. Crear presupuesto con servicio de 150€
2. Verificar en UI que muestra "Total: 150€" (si IVA incluido)
3. Verificar en BD que `total = 150`, `subtotal = 123.97`, `tax_amount = 26.03`
4. Convertir a factura y verificar mismos valores
5. Verificar enlace de pago muestra 150€
