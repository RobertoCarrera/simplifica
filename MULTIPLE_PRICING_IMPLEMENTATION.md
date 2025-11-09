# 🚀 Guía de Implementación: Múltiples Periodicidades por Variante

## 📋 Resumen del Cambio

**ANTES**: Una variante = Una periodicidad
```typescript
"Esencial" → Mensual → 49€
"Esencial" → Anual → 493€  // Variante duplicada
```

**DESPUÉS**: Una variante = Múltiples periodicidades
```typescript
"Esencial" → [
  { monthly: 49€ },
  { annual: 493€ }
]
```

## 🗄️ Paso 1: Migración de Base de Datos

**Archivo**: `supabase/migrations/20251109_add_multiple_pricing_to_variants.sql`

✅ Ya creado. Ejecutar en Supabase SQL Editor:
- Agrega columna `pricing` JSONB
- Migra datos existentes al nuevo formato
- Mantiene compatibilidad con campos antiguos

## 🔧 Paso 2: Actualizar Edge Function

**Archivo**: `supabase/functions/create-service-variant/index.ts`

✅ Ya actualizado:
- Nueva interfaz `VariantPricing`
- Valida array `pricing` con al menos 1 entrada
- Guarda/actualiza usando nuevo formato

**Desplegar**: Copiar código al dashboard de Supabase

## 💻 Paso 3: Actualizar Componente TypeScript

**Archivo**: `src/app/components/service-variants/service-variants.component.ts`

### 3.1 Actualizar imports y propiedades

```typescript
import { ServiceVariant, VariantPricing } from '../../services/supabase-services.service';

// Agregar nueva propiedad en el componente
pricingEntries: VariantPricing[] = []; // Para el formulario
```

### 3.2 Actualizar billingPeriods

```typescript
billingPeriods = [
  { value: 'one_time', label: 'Pago único', icon: 'fa-hand-holding-usd' },
  { value: 'monthly', label: 'Mensual', icon: 'fa-calendar' },
  { value: 'quarterly', label: 'Trimestral', icon: 'fa-calendar-alt' },
  { value: 'biannual', label: 'Semestral', icon: 'fa-calendar-check' },
  { value: 'annual', label: 'Anual', icon: 'fa-calendar-plus' }
];
```

### 3.3 Actualizar `getEmptyFormData()`

```typescript
getEmptyFormData(): Partial<ServiceVariant> {
  return {
    service_id: this.serviceId,
    variant_name: '',
    pricing: [],  // NUEVO: Array vacío de precios
    features: {
      included: [],
      excluded: [],
      limits: {}
    },
    display_config: {
      highlight: false,
      badge: null,
      color: null
    },
    is_active: true,
    sort_order: this.variants.length
  };
}
```

### 3.4 Agregar métodos para gestionar precios

```typescript
// Agregar entrada de precio
addPricingEntry() {
  if (!this.formData.pricing) {
    this.formData.pricing = [];
  }
  
  this.formData.pricing.push({
    billing_period: 'monthly',
    base_price: 0,
    estimated_hours: 0,
    cost_price: 0,
    profit_margin: 30,
    discount_percentage: 0
  });
}

// Eliminar entrada de precio
removePricingEntry(index: number) {
  if (this.formData.pricing) {
    this.formData.pricing.splice(index, 1);
  }
}

// Calcular precio con descuento
calculateDiscountedPrice(price: VariantPricing): number {
  if (!price.discount_percentage) return price.base_price;
  return price.base_price * (1 - price.discount_percentage / 100);
}

// Obtener periodicidades disponibles (que no estén ya usadas)
getAvailablePeriods(currentIndex: number): typeof this.billingPeriods {
  const usedPeriods = this.formData.pricing
    ?.map((p, i) => i !== currentIndex ? p.billing_period : null)
    .filter(Boolean) || [];
  
  return this.billingPeriods.filter(p => !usedPeriods.includes(p.value as any));
}
```

### 3.5 Actualizar `saveVariant()`

```typescript
saveVariant() {
  console.log('💾 Saving variant. formData:', this.formData);
  
  if (!this.formData.variant_name) {
    alert('Por favor ingresa el nombre de la variante');
    return;
  }

  if (!this.formData.pricing || this.formData.pricing.length === 0) {
    alert('Por favor agrega al menos un precio para esta variante');
    return;
  }

  // Validar que todos los precios tengan datos completos
  for (const price of this.formData.pricing) {
    if (!price.billing_period || price.base_price === undefined || price.base_price <= 0) {
      alert('Todos los precios deben tener periodicidad y precio base mayor a 0');
      return;
    }
  }

  const variant: ServiceVariant = {
    id: this.editingVariant?.id || '',
    service_id: this.serviceId,
    variant_name: this.formData.variant_name!,
    pricing: this.formData.pricing,
    features: this.formData.features || { included: [], excluded: [], limits: {} },
    display_config: this.formData.display_config || { highlight: false, badge: null, color: null },
    is_active: this.formData.is_active !== undefined ? this.formData.is_active : true,
    sort_order: this.formData.sort_order || 0,
    created_at: this.editingVariant?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  this.onSave.emit(variant);
  this.closeForm();
}
```

## 🎨 Paso 4: Actualizar Template HTML

**Archivo**: `src/app/components/service-variants/service-variants.component.html`

### 4.1 Actualizar tarjeta de variante (mostrar múltiples precios como pills)

```html
<div class="variant-card" *ngFor="let variant of variants; let i = index"
     [style.border-left-color]="getVariantBadgeColor(variant)">
  <div class="variant-header">
    <div class="variant-title">
      <h4>{{ variant.variant_name }}</h4>
      
      <!-- Pills de periodicidades -->
      <div class="pricing-pills">
        <span class="pricing-pill" *ngFor="let price of variant.pricing"
              [class.highlighted]="variant.display_config?.highlight">
          <i class="fas" [ngClass]="getPeriodIcon(price.billing_period)"></i>
          {{ getPeriodLabel(price.billing_period) }}: 
          <strong>{{ price.base_price | number:'1.2-2' }} €</strong>
        </span>
      </div>
      
      <span class="variant-badge" *ngIf="variant.display_config?.badge"
            [style.background-color]="getVariantBadgeColor(variant)">
        {{ variant.display_config?.badge }}
      </span>
    </div>
    <!-- ... resto de actions ... -->
  </div>

  <!-- Detalles expandidos (opcional) -->
  <div class="variant-details">
    <div class="detail-table">
      <table>
        <thead>
          <tr>
            <th>Periodicidad</th>
            <th>Precio</th>
            <th>Horas</th>
            <th>Descuento</th>
            <th>Precio Final</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let price of variant.pricing">
            <td>{{ getPeriodLabel(price.billing_period) }}</td>
            <td>{{ price.base_price | number:'1.2-2' }} €</td>
            <td>{{ price.estimated_hours || '-' }}</td>
            <td>{{ price.discount_percentage || 0 }}%</td>
            <td class="price-final">{{ calculateDiscountedPrice(price) | number:'1.2-2' }} €</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  
  <!-- ... resto de features ... -->
</div>
```

### 4.2 Actualizar formulario de edición

```html
<div class="modal-body">
  <form (ngSubmit)="saveVariant(); $event.preventDefault()">
    <!-- Nombre de la variante -->
    <div class="form-group">
      <label>Nombre de la Variante *</label>
      <input 
        type="text" 
        [(ngModel)]="formData.variant_name" 
        name="variant_name" 
        class="form-control" 
        required
        placeholder="Ej: Esencial, Profesional, Premium">
    </div>

    <!-- NUEVA SECCIÓN: Precios por periodicidad -->
    <div class="pricing-section">
      <div class="section-header">
        <h4>Precios</h4>
        <button type="button" class="btn btn-sm btn-primary" 
                (click)="addPricingEntry()"
                [disabled]="formData.pricing && formData.pricing.length >= 5">
          <i class="fas fa-plus"></i> Agregar Precio
        </button>
      </div>

      <div class="pricing-entries">
        <div class="pricing-entry" *ngFor="let price of formData.pricing; let idx = index">
          <div class="pricing-entry-header">
            <span class="entry-number">Precio {{ idx + 1 }}</span>
            <button type="button" class="btn-icon btn-danger" 
                    (click)="removePricingEntry(idx)"
                    title="Eliminar precio">
              <i class="fas fa-trash"></i>
            </button>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Periodicidad *</label>
              <select [(ngModel)]="price.billing_period" 
                      [name]="'billing_period_' + idx" 
                      class="form-control" 
                      required>
                <option *ngFor="let period of getAvailablePeriods(idx)" 
                        [value]="period.value">
                  {{ period.label }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label>Precio Base (€) *</label>
              <input type="number" 
                     [(ngModel)]="price.base_price" 
                     [name]="'base_price_' + idx" 
                     class="form-control" 
                     required 
                     min="0" 
                     step="0.01">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Horas Estimadas</label>
              <input type="number" 
                     [(ngModel)]="price.estimated_hours" 
                     [name]="'estimated_hours_' + idx" 
                     class="form-control" 
                     min="0" 
                     step="0.5">
            </div>

            <div class="form-group">
              <label>Precio de Coste (€)</label>
              <input type="number" 
                     [(ngModel)]="price.cost_price" 
                     [name]="'cost_price_' + idx" 
                     class="form-control" 
                     min="0" 
                     step="0.01">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Margen de Beneficio (%)</label>
              <input type="number" 
                     [(ngModel)]="price.profit_margin" 
                     [name]="'profit_margin_' + idx" 
                     class="form-control" 
                     min="0" 
                     max="100" 
                     step="1">
            </div>

            <div class="form-group">
              <label>Descuento (%)</label>
              <input type="number" 
                     [(ngModel)]="price.discount_percentage" 
                     [name]="'discount_percentage_' + idx" 
                     class="form-control" 
                     min="0" 
                     max="100" 
                     step="1">
            </div>
          </div>

          <!-- Precio final calculado -->
          <div class="calculated-price" *ngIf="price.base_price > 0">
            <strong>Precio Final: </strong>
            <span class="price-value">{{ calculateDiscountedPrice(price) | number:'1.2-2' }} €</span>
          </div>
        </div>
      </div>

      <!-- Mensaje si no hay precios -->
      <div class="empty-pricing" *ngIf="!formData.pricing || formData.pricing.length === 0">
        <p>No hay precios definidos. Haz clic en "Agregar Precio" para comenzar.</p>
      </div>
    </div>

    <!-- ... resto del formulario (características, visualización) ... -->
    
    <div class="form-actions">
      <button type="button" class="btn btn-secondary" (click)="closeForm()">
        Cancelar
      </button>
      <button type="submit" class="btn btn-primary">
        <i class="fas fa-save"></i> Guardar
      </button>
    </div>
  </form>
</div>
```

## 🎨 Paso 5: Agregar Estilos CSS

**Archivo**: `src/app/components/service-variants/service-variants.component.scss`

```scss
// Pills de precios
.pricing-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.pricing-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.75rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  font-size: 0.875rem;
  
  &.highlighted {
    background: var(--color-primary-light);
    border-color: var(--color-primary);
    color: var(--color-primary);
    font-weight: 600;
  }
  
  i {
    font-size: 0.875rem;
  }
}

// Tabla de precios
.detail-table {
  margin-top: 1rem;
  overflow-x: auto;
  
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
    
    th, td {
      padding: 0.5rem;
      text-align: left;
      border-bottom: 1px solid var(--color-border);
    }
    
    th {
      font-weight: 600;
      background: var(--color-bg-secondary);
    }
    
    .price-final {
      font-weight: 600;
      color: var(--color-success);
    }
  }
}

// Sección de precios en formulario
.pricing-section {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--color-bg-secondary);
  border-radius: 0.5rem;
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    
    h4 {
      margin: 0;
      font-size: 1.125rem;
    }
  }
}

.pricing-entries {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.pricing-entry {
  padding: 1rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  
  .pricing-entry-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-border);
    
    .entry-number {
      font-weight: 600;
      color: var(--color-primary);
    }
  }
  
  .calculated-price {
    margin-top: 1rem;
    padding: 0.75rem;
    background: var(--color-success-light);
    border-radius: 0.25rem;
    text-align: right;
    
    .price-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-success);
    }
  }
}

.empty-pricing {
  padding: 2rem;
  text-align: center;
  color: var(--color-text-secondary);
  font-style: italic;
}
```

## ✅ Checklist de Implementación

- [ ] 1. Ejecutar migración SQL en Supabase
- [ ] 2. Desplegar Edge Function actualizada
- [ ] 3. Actualizar tipos TypeScript en service
- [ ] 4. Actualizar componente TypeScript
- [ ] 5. Actualizar template HTML
- [ ] 6. Agregar estilos CSS
- [ ] 7. Probar creación de variante con múltiples precios
- [ ] 8. Probar edición de variante existente
- [ ] 9. Verificar visualización de pills en listado
- [ ] 10. Commit y push de cambios

## 🧪 Testing

### Caso 1: Crear nueva variante "Esencial"
- Agregar precio mensual: 49€
- Agregar precio anual: 493€ (16% desc)
- Guardar y verificar que se muestra con 2 pills

### Caso 2: Editar variante existente
- Abrir formulario
- Verificar que se cargan los precios existentes
- Agregar precio trimestral: 140€
- Guardar y verificar 3 pills

### Caso 3: Validaciones
- Intentar guardar sin nombre → Error
- Intentar guardar sin precios → Error
- Intentar agregar mismo periodo 2 veces → Dropdown no muestra periodo ya usado

## 📝 Notas

- Los campos antiguos (`billing_period`, `base_price`) se mantienen en BD para backwards compatibility
- La migración convierte datos existentes automáticamente
- El componente usa solo el nuevo formato `pricing[]`
