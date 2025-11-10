# Implementación de Variantes y Periodicidad en Presupuestos

## 📋 Resumen Ejecutivo

Se ha implementado la funcionalidad completa para capturar, persistir y mostrar información de **variantes de servicio** y **periodicidad de facturación** en los presupuestos. Esta implementación incluye:

- ✅ Esquema de base de datos extendido con campos `variant_id` y `billing_period`
- ✅ Modelos TypeScript actualizados
- ✅ Lógica de captura y normalización en formularios
- ✅ Persistencia completa en base de datos
- ✅ Visualización con badges en vista de detalle
- ✅ Integración con recurrencia automática
- ✅ Auto-selección de primera variante cuando el servicio tiene variantes
- ✅ Validación visual con advertencia cuando falta seleccionar variante
- ✅ Scripts SQL de diagnóstico y reparación

---

## 🗄️ Cambios en Base de Datos

### Migración Creada
**Archivo**: `f:\simplifica\supabase\migrations\20251110_quote_items_variant_billing_period.sql`

**Contenido**:
```sql
-- Add variant_id and billing_period to quote_items
ALTER TABLE quote_items 
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES service_variants(id);

ALTER TABLE quote_items 
  ADD COLUMN IF NOT EXISTS billing_period TEXT;

-- Index for variant lookups
CREATE INDEX IF NOT EXISTS idx_quote_items_variant_id 
  ON quote_items(variant_id);

-- Constraint on billing_period values
ALTER TABLE quote_items 
  ADD CONSTRAINT IF NOT EXISTS chk_quote_items_billing_period_values 
  CHECK (billing_period IS NULL OR billing_period IN (
    'one-time', 'monthly', 'quarterly', 'annually', 'annual', 'yearly', 'custom'
  ));
```

**⚠️ ACCIÓN REQUERIDA**: Esta migración debe ejecutarse en el SQL Editor de Supabase.

---

## 🔧 Cambios en Código

### 1. Modelos TypeScript (`src/app/models/quote.model.ts`)

Se extendieron las siguientes interfaces:

```typescript
export interface QuoteItem {
  // ... campos existentes ...
  variant_id?: string | null;
  billing_period?: string | null;
}

export interface CreateQuoteItemDTO {
  // ... campos existentes ...
  variant_id?: string | null;
  billing_period?: string | null;
}

export interface UpdateQuoteItemDTO {
  // ... campos existentes ...
  variant_id?: string | null;
  billing_period?: string | null;
}
```

---

### 2. Formulario de Presupuestos (`quote-form.component.ts`)

#### Métodos Modificados/Añadidos:

**`createItemFormGroup()`**:
- Añadido control `billing_period: [null]` al FormGroup

**`loadQuote()`**:
- Ahora patchea `variant_id` y `billing_period` al cargar items existentes

**`selectService(service, index)` - AUTO-SELECCIÓN**:
```typescript
// Si el servicio tiene variantes, seleccionar automáticamente la primera activa
if (service.has_variants && service.service_variants?.length > 0) {
  const activeVariants = service.service_variants.filter((v: ServiceVariant) => v.is_active);
  if (activeVariants.length > 0) {
    console.log('Auto-selecting first variant:', activeVariants[0].variant_name);
    this.selectVariant(activeVariants[0], index);
  }
} else {
  // Para servicios sin variantes, establecer billing_period por defecto
  item.patchValue({ billing_period: 'one-time' });
}
```

**`selectVariant(variant, index)` - CAPTURA DE PERIODICIDAD**:
```typescript
// 1. Obtener billing_period del array pricing (preferido) o campo legacy
let billingPeriod = 'one-time';
if (variant.pricing && variant.pricing.length > 0) {
  billingPeriod = variant.pricing[0].billing_period || 'one-time';
} else if (variant.billing_period) {
  billingPeriod = variant.billing_period;
}

// 2. Normalizar valores
const normalizedPeriod = this.normalizeBillingPeriod(billingPeriod);

// 3. Patchear al formulario
item.patchValue({
  variant_id: variant.id,
  billing_period: normalizedPeriod
});

// 4. Actualizar recurrencia automática
this.updateRecurrenceFromVariant(normalizedPeriod);
```

**`normalizeBillingPeriod(period)` - NORMALIZACIÓN**:
```typescript
// Estandariza valores:
// 'one_time' → 'one-time'
// 'annual' → 'annually'
// 'yearly' → 'annually'
```

**`updateRecurrenceFromVariant(billingPeriod)` - RECURRENCIA AUTOMÁTICA**:
```typescript
// Mapea billing_period a recurrence_type:
// 'monthly' → 'monthly'
// 'annually'/'annual' → 'yearly'
// 'one-time' → 'none'

// Bloquea controles de recurrencia si hay variantes con periodicidad mensual/anual
```

**`save()` en modo edición**:
```typescript
items: currentItems.map(item => ({
  // ... campos existentes ...
  variant_id: item.variant_id || null,
  billing_period: item.billing_period || null
}))
```

---

### 3. Servicio de Presupuestos (`supabase-quotes.service.ts`)

**Todos los métodos de persistencia actualizados**:

- `executeCreateQuote()`: itemsToInsert incluye `variant_id` y `billing_period`
- `executeAddQuoteItem()`: objeto insert incluye nuevos campos
- `executeUpdateQuoteItem()`: actualización usa DTO que contiene nuevos campos

---

### 4. Vista de Detalle (`quote-detail.component.ts`)

#### Métodos Añadidos:

**`getBillingPeriodLabel(period: string): string`**:
```typescript
// Traduce billing_period a español:
// 'one-time' → 'Pago único'
// 'monthly' → 'Mensual'
// 'quarterly' → 'Trimestral'
// 'annually' → 'Anual'
// 'custom' → 'Personalizado'
```

**`extractVariantName(description: string): string | null`**:
```typescript
// Extrae nombre de variante de la descripción
// "Mantenimiento Web - Founders - Descripción" → "Founders"
```

**`hasAnyBillingPeriod(): boolean`**:
```typescript
// Verifica si algún item tiene billing_period definido
```

**`hasRecurrence(): boolean`**:
```typescript
// Verifica si el presupuesto tiene recurrence_type != 'none'
```

**`getRecurrenceLabel(): string`**:
```typescript
// Formatea recurrencia en español con detalles de día
// Ej: "Mensual · día 1", "Semanal · Lunes"
```

---

### 5. Template de Detalle (`quote-detail.component.html`)

#### Badges Añadidos:

**En tabla de items (desktop)**:
```html
<div class="flex gap-2 mt-1">
  @if (item.variant_id) {
    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
      {{ extractVariantName(item.description) }}
    </span>
  }
  @if (item.billing_period) {
    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
      {{ getBillingPeriodLabel(item.billing_period) }}
    </span>
  }
</div>
```

**En tarjetas de items (mobile)**: Misma estructura con ajustes de tamaño

**En sección de cliente (desktop y mobile)**:
```html
@if (hasRecurrence()) {
  <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
    Recurrencia: {{ getRecurrenceLabel() }}
  </span>
}
```

**En resumen del presupuesto**:
```html
@if (hasAnyBillingPeriod()) {
  <div class="flex justify-between py-2">
    <span class="text-sm text-gray-600">Periodicidad:</span>
    <span class="text-sm font-medium text-gray-900">Mixta</span>
  </div>
}
```

---

### 6. Template de Formulario (`quote-form.component.html`)

#### Mejoras de UX:

**Selector de variante con estados visuales**:
```html
<button 
  class="... border-blue-300 bg-blue-50"
  [class.border-yellow-400]="!items.at(i).get('variant_id')?.value"
  [class.bg-yellow-50]="!items.at(i).get('variant_id')?.value"
>
```

**Advertencia cuando no hay variante seleccionada**:
```html
@if (!items.at(i).get('variant_id')?.value) {
  <div class="mt-2 bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded-lg text-xs">
    ⚠️ Este servicio requiere que seleccione una variante para definir precio y periodicidad de facturación.
  </div>
}
```

---

## 🔍 Scripts de Diagnóstico

### Archivo Creado: `database/fix-quote-items-variant-billing.sql`

Este script contiene 5 secciones:

#### 1️⃣ Verificación de Esquema
Confirma que las columnas y constraints existen correctamente.

#### 2️⃣ Identificación de Problemas
```sql
-- Encuentra presupuestos donde el servicio tiene variantes pero variant_id es NULL
SELECT 
  q.id AS quote_id,
  q.title,
  qi.id AS item_id,
  qi.description,
  qi.service_id,
  s.name AS service_name,
  s.has_variants,
  qi.variant_id,
  qi.billing_period
FROM quotes q
JOIN quote_items qi ON qi.quote_id = q.id
JOIN services s ON s.id = qi.service_id
WHERE s.has_variants = TRUE
  AND qi.variant_id IS NULL
ORDER BY q.created_at DESC;
```

#### 3️⃣ Listar Variantes Disponibles
```sql
-- Para el servicio específico del usuario
SELECT 
  id,
  variant_name,
  billing_period,
  pricing,
  is_active,
  display_config
FROM service_variants
WHERE service_id = '65f24593-b836-4b5f-91bd-79028c1420d0'
  AND is_active = TRUE
ORDER BY variant_name;
```

#### 4️⃣ Reparar Presupuesto Específico
```sql
-- Transaction para actualizar el presupuesto del usuario
BEGIN;

-- 1. Actualizar quote_item con variant_id y billing_period correctos
UPDATE quote_items
SET 
  variant_id = '<VARIANT_ID_AQUÍ>',  -- Copiar de query anterior
  billing_period = 'monthly'          -- O el que corresponda
WHERE quote_id = '17e8f654-2d07-4f5a-8158-e8ced8a5ccea';

-- 2. Actualizar recurrence_type en la tabla quotes
UPDATE quotes
SET 
  recurrence_type = 'monthly',        -- Ajustar según billing_period
  recurrence_day = 1,                 -- Día del mes (1-28)
  recurrence_start_date = issue_date  -- O fecha específica
WHERE id = '17e8f654-2d07-4f5a-8158-e8ced8a5ccea';

-- 3. Verificar cambios
SELECT * FROM quote_items WHERE quote_id = '17e8f654-2d07-4f5a-8158-e8ced8a5ccea';
SELECT id, recurrence_type, recurrence_day FROM quotes WHERE id = '17e8f654-2d07-4f5a-8158-e8ced8a5ccea';

COMMIT;
```

#### 5️⃣ Estadísticas
Consultas para analizar distribución de variantes y periodicidades en todos los presupuestos.

---

## 📊 Flujo de Datos Completo

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Usuario selecciona SERVICIO en formulario               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. selectService() verifica si service.has_variants = true │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
┌────────────────┐          ┌────────────────────────┐
│ SIN VARIANTES  │          │    CON VARIANTES       │
│ billing_period │          │ Auto-select PRIMERA    │
│ = 'one-time'   │          │ variante activa        │
└────────────────┘          └───────────┬────────────┘
                                        │
                                        ▼
        ┌───────────────────────────────────────────────────┐
        │ 3. selectVariant() extrae billing_period          │
        │    - Desde variant.pricing[0].billing_period      │
        │    - O desde variant.billing_period (legacy)      │
        └───────────────────┬───────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────────────────┐
        │ 4. normalizeBillingPeriod()                       │
        │    - one_time → one-time                          │
        │    - annual → annually                            │
        │    - yearly → annually                            │
        └───────────────────┬───────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────────────────┐
        │ 5. Patch al FormControl del item:                │
        │    - variant_id: variant.id                       │
        │    - billing_period: normalizedPeriod             │
        └───────────────────┬───────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────────────────┐
        │ 6. updateRecurrenceFromVariant()                  │
        │    - monthly → recurrence_type: 'monthly'         │
        │    - annually → recurrence_type: 'yearly'         │
        │    - Bloquea controles de recurrencia             │
        └───────────────────┬───────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────────────────┐
        │ 7. save() → Persiste a DB via service             │
        │    - executeCreateQuote() o executeUpdateQuote()  │
        │    - variant_id y billing_period incluidos        │
        └───────────────────┬───────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────────────────┐
        │ 8. quote-detail muestra badges                    │
        │    - Variante: extractVariantName()               │
        │    - Periodicidad: getBillingPeriodLabel()        │
        │    - Recurrencia: getRecurrenceLabel()            │
        └───────────────────────────────────────────────────┘
```

---

## 🚀 Pasos Siguientes (ACCIONES REQUERIDAS)

### ✅ Paso 1: Aplicar Migración
```bash
# En Supabase SQL Editor, ejecutar:
f:\simplifica\supabase\migrations\20251110_quote_items_variant_billing_period.sql
```

**Verificar resultado**:
```sql
-- Debe devolver 2 filas (variant_id, billing_period)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'quote_items'
  AND column_name IN ('variant_id', 'billing_period');

-- Debe devolver 1 fila con el constraint
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'chk_quote_items_billing_period_values';
```

---

### ✅ Paso 2: Reparar Presupuesto Existente

1. **Abrir script SQL de diagnóstico**:
   ```
   f:\simplifica\database\fix-quote-items-variant-billing.sql
   ```

2. **Ejecutar Sección 3** para ver variantes disponibles del servicio "Mantenimiento Web WP"

3. **Copiar el `id` de la variante "Founders"** (la que aparece en la descripción del item)

4. **Ejecutar Sección 4** (el transaction):
   - Reemplazar `<VARIANT_ID_AQUÍ>` con el ID copiado
   - Ajustar `billing_period` según la variante ('monthly' o 'annually')
   - Ajustar `recurrence_type` según corresponda
   - Verificar con las queries SELECT antes de hacer COMMIT

5. **Confirmar**:
   ```sql
   -- Debe mostrar variant_id y billing_period populados
   SELECT * FROM quote_items 
   WHERE quote_id = '17e8f654-2d07-4f5a-8158-e8ced8a5ccea';
   ```

---

### ✅ Paso 3: Probar Flujo Completo

1. **Crear nuevo presupuesto**:
   - Seleccionar cliente
   - Añadir item
   - Seleccionar servicio "Mantenimiento Web WP" (o cualquier servicio con variantes)
   - **Verificar que la primera variante se selecciona automáticamente**
   - **Verificar que aparece el selector de variante con fondo azul**
   - Cambiar variante si es necesario
   - Guardar presupuesto

2. **Verificar persistencia**:
   ```sql
   -- Reemplazar NUEVO_QUOTE_ID con el ID del presupuesto creado
   SELECT 
     qi.id,
     qi.description,
     qi.variant_id,
     qi.billing_period,
     sv.variant_name,
     q.recurrence_type,
     q.recurrence_day
   FROM quote_items qi
   JOIN quotes q ON q.id = qi.quote_id
   LEFT JOIN service_variants sv ON sv.id = qi.variant_id
   WHERE qi.quote_id = '<NUEVO_QUOTE_ID>';
   ```

3. **Editar presupuesto**:
   - Abrir el presupuesto creado en modo edición
   - **Verificar que el selector de variante muestra la variante correcta**
   - **Verificar que los controles de recurrencia están bloqueados** (si la variante es mensual/anual)
   - Modificar algún campo y guardar
   - Verificar que variant_id y billing_period se mantienen

4. **Ver detalle**:
   - Abrir vista de detalle del presupuesto
   - **Verificar badge INDIGO con nombre de variante** debajo de la descripción del item
   - **Verificar badge MORADO con periodicidad** (ej: "Mensual", "Anual")
   - **Verificar badge MORADO de recurrencia** en la sección de cliente (ej: "Recurrencia: Mensual · día 1")
   - **Verificar línea "Periodicidad: Mixta"** en el resumen (si hay items con diferentes billing_period)

---

### ✅ Paso 4: Validar Casos Edge

1. **Servicio sin variantes**:
   - Crear presupuesto con servicio que NO tiene variantes
   - Verificar que NO aparece el selector de variante
   - Verificar que `billing_period` se guarda como 'one-time'
   - Verificar que recurrencia permanece desbloqueada

2. **Producto (no servicio)**:
   - Crear presupuesto con producto
   - Verificar que `billing_period` se guarda como 'one-time'
   - Verificar que NO hay badge de variante ni periodicidad en detalle

3. **Mezcla de items**:
   - Crear presupuesto con 3 items:
     - Item 1: Servicio con variante mensual
     - Item 2: Servicio sin variantes
     - Item 3: Producto
   - Verificar que los badges solo aparecen donde corresponde
   - Verificar que la línea "Periodicidad: Mixta" aparece en resumen

---

## 🎯 Comportamientos Esperados

### En Formulario:
- ✅ Al seleccionar servicio con variantes → Primera variante se selecciona automáticamente
- ✅ Selector de variante tiene fondo **azul** cuando hay variante seleccionada
- ✅ Selector de variante tiene fondo **amarillo** cuando NO hay variante seleccionada
- ✅ Aparece **advertencia amarilla** debajo del selector cuando falta seleccionar variante
- ✅ Controles de recurrencia se **bloquean** cuando hay variante mensual/anual
- ✅ Descripción del item se actualiza incluyendo nombre de variante
- ✅ Precio se actualiza según pricing de la variante

### En Base de Datos:
- ✅ `quote_items.variant_id` contiene UUID de la variante o NULL
- ✅ `quote_items.billing_period` contiene valor normalizado ('one-time', 'monthly', 'annually', etc.)
- ✅ `quotes.recurrence_type` se establece según billing_period de variantes ('monthly', 'yearly', 'none')
- ✅ `quotes.recurrence_day` contiene día del mes (1-28) para recurrencias monthly/yearly

### En Vista de Detalle:
- ✅ Badge **INDIGO** muestra nombre de variante extraído de descripción
- ✅ Badge **MORADO** muestra periodicidad traducida al español
- ✅ Badge **MORADO** en sección cliente muestra recurrencia completa
- ✅ Línea "Periodicidad: Mixta" aparece en resumen si hay items con billing_period

---

## 📝 Notas Técnicas

### Normalización de billing_period
El sistema acepta múltiples formatos y los normaliza a valores estándar:
- `one_time` → `one-time`
- `annual` → `annually`
- `yearly` → `annually`

### Mapeo de billing_period a recurrence_type
- `monthly` → `recurrence_type: 'monthly'`
- `annually` / `annual` → `recurrence_type: 'yearly'`
- `quarterly` → `recurrence_type: 'quarterly'`
- `one-time` → `recurrence_type: 'none'`

### Bloqueo de Recurrencia
Cuando **al menos un item** tiene variante con `billing_period` mensual/anual:
- Los controles de `recurrence_type`, `recurrence_day`, etc. se deshabilitan
- Aparece badge "🔒 Bloqueado" junto al selector de tipo de recurrencia
- Mensaje explicativo indica que la recurrencia está determinada por la variante

### Extracción de Nombre de Variante
La función `extractVariantName()` busca patrones en la descripción:
```
"Mantenimiento Web - Founders - Descripción adicional"
                     ^^^^^^^^
                     Extrae esto
```
Si no encuentra el patrón, devuelve `null` y el badge no se muestra.

---

## 🐛 Troubleshooting

### Problema: Variante no aparece en edición
**Causa**: `variant_id` es NULL en la base de datos  
**Solución**: Ejecutar Sección 4 del script de diagnóstico para reparar

### Problema: Periodicidad no aparece en detalle
**Causa**: `billing_period` es NULL en la base de datos  
**Solución**: Ejecutar Sección 4 del script de diagnóstico para reparar

### Problema: Recurrencia no se bloquea
**Causa**: La variante no tiene `billing_period` mensual/anual, o no se guardó correctamente  
**Solución**: Verificar con query SQL que `billing_period` tenga valor 'monthly' o 'annually'

### Problema: Badge de variante muestra NULL o "Variante desconocida"
**Causa**: La descripción del item no tiene el formato esperado (no incluye " - VariantName - ")  
**Solución**: Al seleccionar variante, el sistema actualiza automáticamente la descripción. Si es un item antiguo, editarlo y re-seleccionar la variante.

### Problema: Auto-selección no funciona
**Causa**: El servicio no tiene `has_variants: true` o no tiene variantes activas  
**Solución**: Verificar en tabla `services` que `has_variants = TRUE` y en `service_variants` que existan variantes con `is_active = TRUE`

---

## ✨ Funcionalidad Extra: PDF

**Estado**: NO implementado todavía

Para incluir variante y periodicidad en PDF de presupuestos:

1. Modificar template de PDF (probablemente en `quote-pdf.component.ts` o similar)
2. Añadir badges o texto plano indicando:
   - Nombre de variante junto a descripción del item
   - Periodicidad del item (si aplica)
   - Recurrencia del presupuesto (en encabezado o pie)

**Recomendación**: Implementar después de validar que todo funciona correctamente en la UI web.

---

## 📚 Referencias

### Archivos Modificados
- ✅ `supabase/migrations/20251110_quote_items_variant_billing_period.sql` (NUEVO)
- ✅ `src/app/models/quote.model.ts`
- ✅ `src/app/modules/quotes/quote-form/quote-form.component.ts`
- ✅ `src/app/modules/quotes/quote-form/quote-form.component.html`
- ✅ `src/app/services/supabase-quotes.service.ts`
- ✅ `src/app/modules/quotes/quote-detail/quote-detail.component.ts`
- ✅ `src/app/modules/quotes/quote-detail/quote-detail.component.html`
- ✅ `database/fix-quote-items-variant-billing.sql` (NUEVO)

### Tablas Modificadas
- `quote_items`: columnas `variant_id`, `billing_period`
- `quotes`: columnas `recurrence_*` (ya existían, ahora se usan con variantes)

### Relaciones FK
- `quote_items.variant_id` → `service_variants.id`
- `service_variants.service_id` → `services.id`

---

## 🎉 Conclusión

La implementación está **completa** en código. Solo quedan las siguientes acciones manuales:

1. ✅ Ejecutar migración en Supabase
2. ✅ Reparar presupuesto existente con script SQL
3. ✅ Probar flujo completo (crear, editar, ver detalle)
4. ✅ Validar casos edge (sin variantes, productos, mezcla)

Una vez completados estos pasos, la funcionalidad de variantes y periodicidad estará **100% operativa**.

---

**Fecha**: 2025-01-10  
**Versión**: 1.0  
**Estado**: ✅ Implementación Completa - Pendiente Validación en Producción
