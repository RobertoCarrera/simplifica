# Integración del Sistema de Variantes en Formulario de Servicios

## 📝 Resumen de Cambios

Se ha integrado completamente el sistema de variantes en el formulario de creación y edición de servicios, permitiendo a los usuarios gestionar servicios con múltiples configuraciones desde la misma interfaz.

---

## 🔧 Cambios Realizados

### 1. **Componente de Servicios (TypeScript)**

#### Imports Actualizados
```typescript
import { ServiceVariant } from '../../services/supabase-services.service';
import { ServiceVariantsComponent } from '../service-variants/service-variants.component';
```

#### Nuevas Propiedades
```typescript
// Variants management
serviceVariants: ServiceVariant[] = [];
```

#### Método `openForm()` Actualizado
```typescript
openForm(service?: Service) {
  // ... código existente ...
  
  // Inicializar has_variants en false para nuevos servicios
  has_variants: false
  
  // Cargar variantes si el servicio las tiene
  if (service?.has_variants && service.id) {
    this.loadServiceVariants(service.id);
  } else {
    this.serviceVariants = [];
  }
}
```

#### Método `closeForm()` Actualizado
```typescript
closeForm() {
  // ... código existente ...
  this.serviceVariants = [];
}
```

#### Nuevos Métodos Añadidos
```typescript
// Cargar variantes de un servicio
async loadServiceVariants(serviceId: string) {
  try {
    this.serviceVariants = await this.servicesService.getServiceVariants(serviceId);
  } catch (error: any) {
    console.error('Error loading service variants:', error);
    this.serviceVariants = [];
  }
}

// Evento cuando cambian las variantes
onVariantsChange(variants: ServiceVariant[]) {
  this.serviceVariants = variants;
}

// Evento cuando se guarda una variante
async onVariantSave(variant: ServiceVariant) {
  if (this.editingService?.id) {
    await this.loadServiceVariants(this.editingService.id);
  }
}

// Evento cuando se elimina una variante
async onVariantDelete(variantId: string) {
  if (this.editingService?.id) {
    await this.loadServiceVariants(this.editingService.id);
  }
}

// Toggle del flag has_variants
async toggleHasVariants() {
  if (!this.editingService?.id) {
    // Para servicios nuevos, solo cambiar el flag
    this.formData.has_variants = !this.formData.has_variants;
    if (!this.formData.has_variants) {
      this.serviceVariants = [];
    }
    return;
  }

  // Para servicios existentes, actualizar en la BD
  this.loading = true;
  try {
    const newValue = !this.formData.has_variants;
    
    if (newValue) {
      // Activar variantes con características base
      const baseFeatures = {
        description: this.formData.description || '',
        category: this.formData.category || ''
      };
      await this.servicesService.enableServiceVariants(this.editingService.id, baseFeatures);
      await this.loadServiceVariants(this.editingService.id);
    } else {
      // Desactivar variantes
      await this.servicesService.updateService(this.editingService.id, { has_variants: false });
      this.serviceVariants = [];
    }
    
    this.formData.has_variants = newValue;
    
    this.toastService.success(
      newValue ? 'Variantes activadas' : 'Variantes desactivadas',
      newValue ? 'Ahora puedes crear variantes para este servicio' : 'Las variantes han sido desactivadas'
    );
  } catch (error: any) {
    this.error = error.message;
    console.error('Error toggling variants:', error);
    this.toastService.error('Error', 'No se pudo cambiar el estado de variantes');
  } finally {
    this.loading = false;
  }
}
```

---

### 2. **Template HTML**

#### Checkbox de Variantes Añadido
Ubicación: Dentro de la sección "Información Básica", después del campo de descripción.

```html
<!-- Variants Toggle -->
<div class="form-group full-width">
  <div class="checkbox-group">
    <label class="checkbox-label">
      <input 
        type="checkbox"
        [(ngModel)]="formData.has_variants"
        name="has_variants"
        (change)="toggleHasVariants()">
      <span class="checkmark"></span>
      <span>
        Este servicio tiene variantes (diferentes niveles, periodicidades o configuraciones)
        <small class="text-gray-500 block mt-1">
          Por ejemplo: Mantenimiento Esencial/Avanzado/Superior, con opciones mensuales/anuales
        </small>
      </span>
    </label>
  </div>
</div>
```

#### Sección de Gestión de Variantes
Ubicación: Nueva sección después de "Información Básica" y antes de "Precios y Facturación".

```html
<!-- Service Variants Section -->
<div *ngIf="formData.has_variants && editingService?.id" class="form-section">
  <h3 class="form-section-title">
    <i class="fas fa-layer-group"></i>
    Variantes del Servicio
  </h3>
  
  <app-service-variants
    [serviceId]="editingService!.id"
    [serviceName]="formData.name || ''"
    [variants]="serviceVariants"
    (variantsChange)="onVariantsChange($event)"
    (onSave)="onVariantSave($event)"
    (onDelete)="onVariantDelete($event)">
  </app-service-variants>
</div>

<!-- Info message for new services with variants -->
<div *ngIf="formData.has_variants && !editingService" class="form-section">
  <div class="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-lg">
    <div class="flex items-start gap-3">
      <i class="fas fa-info-circle text-lg mt-0.5"></i>
      <div>
        <div class="font-semibold">Variantes del servicio</div>
        <div class="text-sm mt-1">
          Primero guarda el servicio base. Después podrás crear las variantes (Esencial, Avanzado, Superior) con sus diferentes precios y periodicidades.
        </div>
      </div>
    </div>
  </div>
</div>
```

#### Indicador Visual en Cards de Servicios
```html
<h3 class="service-name text-sm font-semibold text-gray-900 dark:text-gray-100">
  {{ service.name }}
  <span *ngIf="service.has_variants" 
        class="ml-2 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full" 
        title="Este servicio tiene variantes">
    <i class="fas fa-layer-group"></i> Variantes
  </span>
</h3>
```

---

## 🎯 Flujo de Trabajo del Usuario

### Para Servicios Nuevos

1. **Crear Servicio Base**
   - Usuario abre el formulario de nuevo servicio
   - Completa información básica (nombre, descripción, categoría)
   - Marca el checkbox "Este servicio tiene variantes"
   - Ve mensaje informativo: "Primero guarda el servicio base..."
   - Guarda el servicio

2. **Añadir Variantes**
   - Usuario edita el servicio recién creado
   - Ahora ve la sección completa de variantes
   - Puede añadir múltiples variantes con diferentes:
     - Nombres (Esencial, Avanzado, Superior)
     - Periodicidades (one-time, monthly, annually)
     - Precios
     - Características incluidas/excluidas
     - Configuración de visualización

### Para Servicios Existentes

1. **Activar Variantes**
   - Usuario edita un servicio existente
   - Marca el checkbox de variantes
   - Sistema llama a `enableServiceVariants()` automáticamente
   - Se muestra la sección de gestión de variantes

2. **Gestionar Variantes**
   - Crear nuevas variantes
   - Editar variantes existentes
   - Eliminar variantes
   - Reordenar con botones ↑↓
   - Ver precio anual calculado automáticamente

3. **Desactivar Variantes**
   - Desmarca el checkbox
   - Sistema actualiza `has_variants = false`
   - Las variantes quedan guardadas en BD pero no se muestran

---

## 🎨 Características Visuales

### Indicador en Listado
- Badge morado "🔷 Variantes" junto al nombre del servicio
- Visible tanto en servicios activos como inactivos
- Color distintivo: `bg-purple-100` / `text-purple-700`

### Sección de Variantes
- Integrada como una sección más del formulario
- Misma jerarquía visual que "Precios y Facturación" o "Tiempo y Cantidades"
- Icono: `fa-layer-group`

### Mensaje Informativo
- Fondo azul claro con borde
- Icono de información
- Explica que debe guardar el servicio primero
- Solo se muestra para servicios nuevos con variantes activadas

---

## ✅ Validaciones

1. **Servicios Nuevos**
   - Si marca `has_variants`, debe guardar primero antes de crear variantes
   - Mensaje informativo guía al usuario

2. **Servicios Existentes**
   - Puede activar/desactivar variantes en cualquier momento
   - Al activar, se llama automáticamente al backend
   - Al desactivar, las variantes se conservan en BD

3. **Integridad**
   - El componente `ServiceVariantsComponent` maneja sus propias validaciones
   - Precios y horas deben ser positivos
   - Nombres de variantes son requeridos

---

## 🔄 Integración con Backend

### Métodos del Servicio Utilizados
```typescript
// Del servicio SupabaseServicesService
getServiceVariants(serviceId: string): Promise<ServiceVariant[]>
enableServiceVariants(serviceId: string, baseFeatures?: Record<string, any>): Promise<Service>
updateService(serviceId: string, data: Partial<Service>): Promise<Service>
```

### Flujo de Datos
1. Usuario marca checkbox → `toggleHasVariants()`
2. Si es servicio existente → `enableServiceVariants()` en backend
3. Backend actualiza `has_variants = true` y crea registro en `service_variants`
4. Frontend recarga variantes → `loadServiceVariants()`
5. Usuario puede gestionar variantes → Componente `ServiceVariantsComponent` hace CRUD directo

---

## 📊 Métricas de Implementación

### Archivos Modificados
- `supabase-services.component.ts` (+80 líneas)
- `supabase-services.component.html` (+40 líneas)
- `service-variants.component.html` (correcciones de tipos)

### Funcionalidades Añadidas
- ✅ Toggle de variantes en formulario
- ✅ Carga automática de variantes
- ✅ Integración con ServiceVariantsComponent
- ✅ Indicadores visuales en listado
- ✅ Mensajes informativos contextuales
- ✅ Manejo de eventos de variantes

### Compilación
- ✅ Build exitoso sin errores
- ⚠️ Warnings de bundle size (existentes, no relacionados)

---

## 🚀 Próximos Pasos

### Pendiente
1. **Componente de Presupuestos**
   - Actualizar selector de servicios
   - Mostrar dropdown de variantes cuando `has_variants = true`
   - Usar precio de la variante seleccionada

2. **Testing E2E**
   - Crear servicio con variantes
   - Seleccionar en presupuesto
   - Verificar cálculos de precios
   - Probar políticas RLS

### Mejoras Futuras
- Copiar variantes entre servicios similares
- Templates de variantes comunes
- Búsqueda/filtrado de servicios con variantes
- Estadísticas de uso por variante

---

## 📚 Documentación Relacionada

- [Implementación Completa](./SERVICIO_VARIANTES_IMPLEMENTACION.md)
- [Migración de Datos](./supabase/migrations/20251109000001_migrate_services_to_variants.sql)
- [Schema de Base de Datos](./supabase/migrations/20251109000000_create_service_variants.sql)

---

**Fecha de Implementación:** 2024-11-09  
**Autor:** Roberto Carrera  
**Estado:** ✅ Completado - Listo para usar
