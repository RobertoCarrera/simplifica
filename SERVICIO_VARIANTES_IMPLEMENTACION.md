# Sistema de Variantes de Servicios - Implementación Completa

## 📋 Resumen

Se ha implementado un sistema completo de variantes para servicios que permite:
- Agrupar servicios similares bajo un servicio base
- Definir diferentes niveles (Esencial, Avanzado, Superior, etc.)
- Establecer diferentes periodicidades (mensual, anual, pago único)
- Gestionar características incluidas/excluidas por variante
- Calcular precios anuales con descuentos automáticos

## ✅ Cambios Implementados

### 1. Base de Datos (Supabase)

#### Nueva tabla: `service_variants`
```sql
CREATE TABLE public.service_variants (
  id uuid PRIMARY KEY,
  service_id uuid NOT NULL REFERENCES services(id),
  variant_name text NOT NULL,
  billing_period text NOT NULL CHECK (billing_period IN ('one-time', 'monthly', 'annually', 'custom')),
  base_price numeric NOT NULL,
  estimated_hours numeric DEFAULT 0,
  cost_price numeric DEFAULT 0,
  profit_margin numeric DEFAULT 30.00,
  discount_percentage numeric DEFAULT 0,
  features jsonb DEFAULT '{"included": [], "excluded": [], "limits": {}}'::jsonb,
  display_config jsonb DEFAULT '{"highlight": false, "badge": null, "color": null}'::jsonb,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_service_variant UNIQUE (service_id, variant_name, billing_period)
);
```

#### Modificación tabla `services`
- `has_variants` (boolean): Indica si el servicio usa variantes
- `base_features` (jsonb): Características comunes a todas las variantes

#### Políticas RLS
- ✅ SELECT: Usuarios pueden ver variantes de su empresa
- ✅ INSERT: Usuarios pueden crear variantes en su empresa
- ✅ UPDATE: Usuarios pueden actualizar variantes de su empresa
- ✅ DELETE: Usuarios pueden eliminar variantes de su empresa

#### Funciones auxiliares
1. `get_service_with_variants(service_id)`: Obtiene servicio con todas sus variantes
2. `get_company_services_with_variants(company_id)`: Obtiene todos los servicios de una empresa con variantes
3. `calculate_annual_price(monthly_price, discount)`: Calcula precio anual con descuento

#### Vista auxiliar
- `service_variants_detailed`: Vista combinada de servicios y variantes para consultas

### 2. Frontend (Angular)

#### Interfaces TypeScript

```typescript
export interface ServiceVariant {
  id: string;
  service_id: string;
  variant_name: string;
  billing_period: 'one-time' | 'monthly' | 'annually' | 'custom';
  base_price: number;
  estimated_hours?: number;
  cost_price?: number;
  profit_margin?: number;
  discount_percentage?: number;
  features?: {
    included?: string[];
    excluded?: string[];
    limits?: Record<string, any>;
  };
  display_config?: {
    highlight?: boolean;
    badge?: string | null;
    color?: string | null;
  };
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

#### Servicio Angular: `SupabaseServicesService`

Nuevos métodos agregados:
```typescript
// CRUD de variantes
async getServiceVariants(serviceId: string): Promise<ServiceVariant[]>
async getServiceWithVariants(serviceId: string): Promise<Service>
async getServicesWithVariants(companyId?: string): Promise<Service[]>
async createServiceVariant(variant: Partial<ServiceVariant>): Promise<ServiceVariant>
async updateServiceVariant(variantId: string, updates: Partial<ServiceVariant>): Promise<ServiceVariant>
async deleteServiceVariant(variantId: string): Promise<void>

// Utilidades
calculateAnnualPrice(monthlyPrice: number, discountPercentage?: number): number
async enableServiceVariants(serviceId: string, baseFeatures?: Record<string, any>): Promise<Service>
```

#### Componente: `ServiceVariantsComponent`

Nuevo componente standalone para gestionar variantes:
- **Ubicación**: `src/app/components/service-variants/`
- **Funcionalidades**:
  - Lista de variantes existentes
  - Formulario modal para crear/editar variantes
  - Gestión de características incluidas/excluidas
  - Reordenamiento de variantes (drag handles)
  - Cálculo automático de precios anuales
  - Configuración visual (badges, colores, destacados)

### 3. Script de Migración

**Archivo**: `20251109000001_migrate_services_to_variants.sql`

Script automático que:
1. Detecta servicios con patrones de nombres similares
2. Agrupa automáticamente servicios como:
   - "Mantenimiento web - Esencial (mensual)" → Base: "Mantenimiento web", Variante: "Esencial", Periodo: "monthly"
   - "Hosting Avanzado (anual)" → Base: "Hosting Avanzado", Variante: "Standard", Periodo: "annually"
3. Crea servicios base con `has_variants = true`
4. Genera variantes a partir de servicios duplicados
5. Marca servicios originales como migrados (soft delete)

## 📊 Ejemplo de Uso

### Antes (53 servicios separados)
```
- Mantenimiento web - Esencial (mensual) - €49
- Mantenimiento web - Esencial (anual) - €490
- Mantenimiento web - Avanzado (mensual) - €79
- Mantenimiento web - Avanzado (anual) - €790
- Hosting Avanzado (mensual) - €69
- Hosting Avanzado (anual) - €690
... (47 más)
```

### Después (Estructura limpia)
```
Servicio: "Mantenimiento Web"
├── Variante: "Esencial"
│   ├── Mensual: €49
│   └── Anual: €490 (16% desc)
└── Variante: "Avanzado"
    ├── Mensual: €79
    └── Anual: €790 (16% desc)

Servicio: "Hosting Avanzado"
├── Variante: "Standard"
│   ├── Mensual: €69
│   └── Anual: €690 (16% desc)
```

## 🚀 Próximos Pasos

### Para completar la implementación:

1. **Integrar en formulario de servicios**
   - Agregar `<app-service-variants>` al formulario de edición
   - Checkbox para habilitar/deshabilitar variantes
   - Selector de variante al agregar servicio a presupuesto

2. **Actualizar componente de presupuestos**
   - Modificar selector de servicios para mostrar variantes
   - Crear dropdown de variantes al seleccionar servicio
   - Actualizar cálculo de precios según variante seleccionada

3. **Ejecutar migración de datos**
   ```bash
   # En tu terminal local o Supabase
   psql -d your_database -f supabase/migrations/20251109000001_migrate_services_to_variants.sql
   ```

4. **Testing**
   - Probar CRUD de variantes
   - Verificar RLS policies
   - Comprobar cálculos de precios
   - Validar migración de datos

## 📁 Archivos Creados/Modificados

### Nuevos archivos:
```
supabase/migrations/
  ├── 20251109000000_create_service_variants.sql
  └── 20251109000001_migrate_services_to_variants.sql

src/app/components/service-variants/
  ├── service-variants.component.ts
  ├── service-variants.component.html
  └── service-variants.component.scss
```

### Archivos modificados:
```
src/app/services/
  └── supabase-services.service.ts
      - Agregadas interfaces ServiceVariant
      - Actualizada interface Service (has_variants, base_features, variants)
      - Agregados métodos CRUD para variantes
```

## 🎨 Características Visuales

- Cards con color personalizable por nivel
- Badges configurables (ej: "Más Popular", "Recomendado")
- Indicadores de periodicidad
- Listas de características incluidas/excluidas
- Cálculo automático de precio anual con descuento
- Reordenamiento drag & drop (pendiente implementar)
- Responsive design

## 💡 Ventajas del Nuevo Sistema

1. **Menos redundancia**: De 53 servicios a ~15-20 servicios base
2. **Gestión simplificada**: Modificar descripción base afecta todas las variantes
3. **Comparación fácil**: Ver todas las opciones de un servicio en una tabla
4. **Precios automáticos**: Calcular precio anual desde mensual con descuento
5. **Presupuestos inteligentes**: Ofrecer opciones al cliente (mensual vs anual)
6. **Escalabilidad**: Fácil agregar nuevas variantes sin crear servicios

## 📝 Notas Técnicas

- Todas las variantes heredan `company_id` del servicio padre (RLS)
- Los servicios sin variantes siguen funcionando normalmente (`has_variants = false`)
- El campo `discount_percentage` se aplica al `base_price` final
- Las características en `features.included` se pueden usar para generar comparativas
- `sort_order` determina el orden de visualización de variantes

## ✨ Estado Actual

- ✅ Base de datos configurada
- ✅ Migraciones creadas
- ✅ Tipos TypeScript actualizados
- ✅ Servicio Angular con métodos CRUD
- ✅ Componente visual completo
- ⏳ Integración en formulario principal (pendiente)
- ⏳ Actualización de presupuestos (pendiente)
- ⏳ Ejecución de migración de datos (pendiente)

---

**Fecha de implementación**: 2025-11-09  
**Versión**: 1.0  
**Estado**: Listo para integración y testing
