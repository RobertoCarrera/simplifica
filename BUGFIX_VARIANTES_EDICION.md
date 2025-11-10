# Bug Fix: Variantes no se guardaban en modo edición

## 🐛 Problema Identificado

Al editar un presupuesto existente, los campos `variant_id` y `billing_period` **NO se estaban guardando** en la base de datos, aunque sí se capturaban correctamente en el formulario.

## 🔍 Análisis del Flujo

### ✅ Lo que funcionaba correctamente:

1. **FormGroup (createItemFormGroup)**: Los controles `variant_id` y `billing_period` estaban definidos correctamente.

2. **selectVariant()**: El método hacía `patchValue` correctamente con ambos campos al seleccionar una variante.

3. **loadQuote()**: Al cargar un presupuesto existente, sí cargaba `variant_id` y `billing_period` desde la BD (líneas 607-608).

4. **Modo creación**: Usaba `formValue.items as CreateQuoteItemDTO[]` que incluía todos los campos del FormGroup.

5. **Servicio de persistencia (executeCreateQuote)**: El servicio sí incluía `variant_id` y `billing_period` al insertar items (líneas 264-265).

6. **Modelos TypeScript**: `CreateQuoteItemDTO` declaraba correctamente ambos campos opcionales.

### ❌ El bug estaba en:

**Archivo**: `quote-form.component.ts`  
**Método**: `save()` - Bloque de edición (líneas 1121-1132)

```typescript
// ❌ ANTES (incorrecto):
const items = formValue.items.map((item: any, index: number) => ({
  quote_id: this.quoteId()!,
  company_id: companyId,
  line_number: index + 1,
  description: item.description,
  quantity: item.quantity,
  unit_price: item.unit_price,
  tax_rate: item.tax_rate || 21,
  discount_percent: item.discount_percent || 0,
  notes: item.notes || '',
  service_id: item.service_id || null,
  product_id: item.product_id || null
  // ⚠️ FALTABAN variant_id y billing_period
}));
```

## ✅ Solución Aplicada

Se agregaron los campos faltantes al mapeo de items en modo edición:

```typescript
// ✅ DESPUÉS (corregido):
const items = formValue.items.map((item: any, index: number) => ({
  quote_id: this.quoteId()!,
  company_id: companyId,
  line_number: index + 1,
  description: item.description,
  quantity: item.quantity,
  unit_price: item.unit_price,
  tax_rate: item.tax_rate || 21,
  discount_percent: item.discount_percent || 0,
  notes: item.notes || '',
  service_id: item.service_id || null,
  product_id: item.product_id || null,
  variant_id: item.variant_id || null,        // ✅ AÑADIDO
  billing_period: item.billing_period || null // ✅ AÑADIDO
}));
```

## 📋 Impacto

- **Modo creación**: Ya funcionaba correctamente, sin cambios.
- **Modo edición**: Ahora guarda correctamente `variant_id` y `billing_period`.
- **Visualización**: Los badges en `quote-detail` ahora mostrarán correctamente las variantes después de editar.
- **Recurrencia**: La recurrencia automática basada en `billing_period` ahora persistirá correctamente.

## 🧪 Pruebas Recomendadas

1. **Crear presupuesto nuevo con variante**:
   - Seleccionar servicio con variantes
   - Verificar que la primera variante se auto-selecciona
   - Guardar y verificar en BD que `variant_id` y `billing_period` están guardados

2. **Editar presupuesto existente**:
   - Abrir presupuesto con variante
   - Cambiar la variante seleccionada
   - Guardar y verificar en BD que los nuevos valores se persisten

3. **Verificar SQL**:
   ```sql
   SELECT id, description, variant_id, billing_period, service_id
   FROM quote_items
   WHERE quote_id = '<tu_quote_id>'
   ORDER BY line_number;
   ```

## 📅 Fecha

10 de noviembre de 2025

## ✅ Estado

**CORREGIDO** - Un solo cambio en `quote-form.component.ts` líneas 1131-1132.
