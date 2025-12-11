# Corrección del Flujo de Rectificación de Facturas

## Problema Detectado

Cuando se intentaba rectificar una factura:
1. ❌ No se podía introducir el **motivo de rectificación** (requerido por VeriFactu)
2. ❌ Al anular una factura rectificativa, la factura original quedaba en estado "rectificada" sin poder volver a rectificarla

## Soluciones Implementadas

### 1. ✅ Campo de Motivo de Rectificación

**Frontend:**
- `invoice-detail.component.ts`: Añadido prompt que solicita el motivo antes de crear la rectificación
- `supabase-quotes.service.ts`: Actualizado para aceptar y pasar el motivo a la RPC

**Backend:**
- **Migración:** `20251211000001_add_rectification_reason_to_quotes.sql`
  - Añadido campo `rectification_reason` a tabla `quotes`
  - Actualizada función `create_rectification_quote()` para aceptar parámetro `p_rectification_reason`
  - El motivo se guarda en el presupuesto y en las notas

- **Migración:** `20251211000003_convert_quote_with_rectification_reason.sql`
  - Actualizada función `convert_quote_to_invoice()` para:
    - Detectar automáticamente si es rectificativa (por `rectifies_invoice_id` o importe negativo)
    - Pasar `rectification_reason` y `rectifies_invoice_id` a la factura resultante
    - Establecer `invoice_type = 'rectificative'` correctamente

**Modelo:**
- `quote.model.ts`: Añadido campo `rectification_reason?: string | null`

### 2. ✅ Restauración Automática al Anular Rectificativa

**Backend:**
- **Migración:** `20251211000002_restore_invoice_on_void_rectification.sql`
  - Creada función `restore_original_invoice_on_void()`
  - Creado trigger `trg_restore_original_on_void`
  - **Funcionalidad:**
    - Cuando se anula (`status = 'void'`) una factura rectificativa
    - Verifica si hay otras rectificativas válidas para la misma factura original
    - Si NO hay otras, restaura la factura original de `'rectified'` a `'approved'`
    - Permite crear una nueva rectificación

## Flujo Completo Corregido

### Rectificar una Factura

1. **Usuario hace click en "Rectificar"** en el detalle de la factura
2. **Sistema solicita motivo:**
   ```
   Introduce el motivo de la rectificación:
   
   (Requerido por VeriFactu. Ej: "Error en cantidad", 
    "Precio incorrecto", "Factura de prueba emitida por error")
   ```
3. **Sistema crea presupuesto rectificativo:**
   - Copia líneas con cantidades negativas
   - Guarda el motivo en `rectification_reason`
   - Guarda referencia en `rectifies_invoice_id`
   - Marca factura original como `status = 'rectified'`

4. **Usuario convierte presupuesto a factura:**
   - El sistema detecta que es rectificativa
   - Establece `invoice_type = 'rectificative'`
   - Pasa `rectification_reason` a la factura
   - Pasa `rectifies_invoice_id` a la factura

5. **VeriFactu envía con motivo correcto:**
   - XML incluye `<MotivoRectificacion>` con el motivo introducido
   - XML incluye referencia a factura rectificada

### Anular una Rectificativa

1. **Usuario anula la factura rectificativa** (status = 'void')
2. **Trigger automático se ejecuta:**
   - Verifica que no hay otras rectificativas válidas
   - Restaura factura original: `'rectified'` → `'approved'`
3. **Usuario puede volver a rectificar** la factura original

## Cambios en Base de Datos

```sql
-- Nueva columna en quotes
ALTER TABLE public.quotes 
ADD COLUMN rectification_reason TEXT;

-- Nueva función de restauración
CREATE FUNCTION restore_original_invoice_on_void() ...
CREATE TRIGGER trg_restore_original_on_void ...

-- Función actualizada
CREATE OR REPLACE FUNCTION create_rectification_quote(
  p_invoice_id UUID,
  p_rectification_reason TEXT DEFAULT NULL
) ...

CREATE OR REPLACE FUNCTION convert_quote_to_invoice(
  p_quote_id uuid,
  p_invoice_series_id uuid default null
) ... -- Ahora pasa rectification_reason y detecta tipo
```

## Archivos Modificados

### Frontend
- `src/app/modules/invoices/invoice-detail/invoice-detail.component.ts`
- `src/app/services/supabase-quotes.service.ts`
- `src/app/models/quote.model.ts`

### Backend (Migraciones)
- `supabase/migrations/20251211000001_add_rectification_reason_to_quotes.sql`
- `supabase/migrations/20251211000002_restore_invoice_on_void_rectification.sql`
- `supabase/migrations/20251211000003_convert_quote_with_rectification_reason.sql`

## Testing

Para probar el flujo completo:

1. ✅ Crear una factura normal
2. ✅ Rectificarla (introducir motivo)
3. ✅ Verificar que el presupuesto tiene el motivo
4. ✅ Convertir a factura
5. ✅ Verificar que la factura tiene `invoice_type = 'rectificative'` y `rectification_reason`
6. ✅ Anular la rectificativa
7. ✅ Verificar que la original vuelve a `'approved'`
8. ✅ Rectificar de nuevo (debería funcionar)

## Compatibilidad con VeriFactu

El motivo de rectificación se incluye en el XML de VeriFactu:

```xml
<DatosRectificacion>
  <NumFacturaRectificada>[Número de la factura original]</NumFacturaRectificada>
  <MotivoRectificacion>[Motivo introducido por el usuario]</MotivoRectificacion>
</DatosRectificacion>
```

Esto cumple con los requisitos de la AEAT para facturas rectificativas.

## Notas Importantes

- ⚠️ El motivo es **obligatorio** - si el usuario cancela el prompt, no se crea la rectificación
- ✅ El trigger solo restaura si NO hay otras rectificativas válidas (permite múltiples rectificaciones)
- ✅ El sistema ahora maneja correctamente el ciclo completo: rectificar → anular → volver a rectificar
- ✅ Totalmente compatible con el envío a AEAT VeriFactu
