# 🚀 Mejoras de Productos - Resumen de Cambios

**Fecha:** 2025-10-19  
**Rama:** mejoras-tickets

## ✅ Cambios Completados

### 1. **Filtrado de Dispositivos Corregido**
- **Problema:** Se mostraban TODOS los dispositivos de la empresa sin filtrar por cliente
- **Solución:** Cambiado el `.sort()` por `.filter()` para mostrar SOLO dispositivos del `client_id` seleccionado
- **Archivo:** `src/app/components/supabase-tickets/supabase-tickets.component.ts`
- **Línea:** ~1531

### 2. **Eliminado Total General del Formulario**
- **Cambio:** Eliminada la sección "Total General" del formulario de nuevo ticket
- **Motivo:** Los totales solo se muestran en el detalle del ticket, no en la creación
- **Archivo:** `src/app/components/supabase-tickets/supabase-tickets.component.html`
- **Líneas:** ~667-673 (eliminadas)

### 3. **Normalización de Base de Datos para Productos**

#### **Nuevas Tablas Creadas:**

**a) `product_brands`**
```sql
- id (UUID, PK)
- name (TEXT, NOT NULL)
- company_id (UUID, FK to companies) -- NULL para globales
- description (TEXT)
- logo_url (TEXT)
- website (TEXT)
- created_at, updated_at, deleted_at
- UNIQUE (name, company_id) -- permite duplicados entre empresas
```

**b) `product_categories`**
```sql
- id (UUID, PK)
- name (TEXT, NOT NULL)
- company_id (UUID, FK to companies) -- NULL para globales
- description (TEXT)
- parent_id (UUID, FK to self) -- para jerarquías
- icon (TEXT) -- clase Font Awesome o emoji
- color (TEXT) -- color hex para UI
- created_at, updated_at, deleted_at
- UNIQUE (name, company_id)
```

#### **Tabla `products` Actualizada:**
- **Nuevas columnas:**
  - `brand_id` (UUID, FK to product_brands)
  - `category_id` (UUID, FK to product_categories)
- **Columnas legacy mantenidas:**
  - `brand` (TEXT) -- para compatibilidad hacia atrás
  - `category` (TEXT) -- para compatibilidad hacia atrás

#### **Funciones Helper Creadas:**
```sql
-- Obtener o crear marca (evita duplicados)
get_or_create_brand(p_brand_name TEXT, p_company_id UUID) RETURNS UUID

-- Obtener o crear categoría (evita duplicados)
get_or_create_category(p_category_name TEXT, p_company_id UUID) RETURNS UUID
```

#### **RLS Policies:**
- ✅ Usuarios ven marcas/categorías globales + las de su empresa
- ✅ Usuarios solo crean/editan marcas/categorías de su empresa
- ✅ Marcas/categorías globales (company_id IS NULL) visibles para todos

#### **Migración de Datos:**
El script SQL incluye:
1. Extracción de marcas únicas de productos existentes → `product_brands`
2. Extracción de categorías únicas → `product_categories`
3. Actualización de `products` para enlazar con las nuevas tablas normalizadas
4. Índices para rendimiento óptimo

### 4. **Nuevo Servicio: ProductMetadataService**

**Archivo:** `src/app/services/product-metadata.service.ts`

**Métodos para Brands:**
- `getBrands(companyId?)` - Lista todas las marcas accesibles
- `searchBrands(searchTerm, companyId?)` - Búsqueda de marcas
- `createBrand(name, companyId, description?)` - Crear o recuperar marca

**Métodos para Categories:**
- `getCategories(companyId?)` - Lista todas las categorías
- `searchCategories(searchTerm, companyId?)` - Búsqueda de categorías
- `createCategory(name, companyId, ...)` - Crear o recuperar categoría
- `getCategoryTree(companyId?)` - Obtener jerarquía de categorías

### 5. **Modelo y Servicio de Products Actualizados**

**Modelo `Product`:**
```typescript
export interface Product {
  // ... campos existentes ...
  category: string | null;      // Legacy (texto libre)
  brand: string | null;         // Legacy (texto libre)
  category_id: string | null;  // ✨ Nuevo (FK normalizada)
  brand_id: string | null;     // ✨ Nuevo (FK normalizada)
}
```

**ProductsService:**
- Actualizado `insertProduct()` para usar `brand_id` y `category_id` cuando están disponibles
- Mantiene campos legacy por compatibilidad
- Normalización automática en `normalizeProduct()`

### 6. **Función RPC Actualizada**

**`get_top_used_products`:**
- Ahora devuelve también `category_id` y `brand_id`
- Usa `COALESCE` para mostrar nombres normalizados o valores legacy
- Join con `product_brands` y `product_categories`

---

## 📋 Siguientes Pasos (PENDIENTES)

### **Paso 1: Ejecutar Migración SQL en Supabase** ⚠️

```bash
# En tu terminal local:
cd f:/simplifica/sql

# Ejecutar el script en Supabase:
# Opción A: Desde Supabase Studio > SQL Editor
#   - Copia el contenido de normalize_products_schema.sql
#   - Pégalo y ejecuta

# Opción B: Desde CLI (si tienes supabase CLI)
supabase db push --file normalize_products_schema.sql
```

**Verificación:**
```sql
-- Verifica que las tablas existen
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'product_%';

-- Debe mostrar:
-- product_brands
-- product_categories

-- Verifica datos migrados
SELECT COUNT(*) FROM product_brands;
SELECT COUNT(*) FROM product_categories;
```

### **Paso 2: Actualizar Formularios de Productos**

**Formularios a actualizar:**
1. **Modal de Nuevo Producto en Tickets** (`supabase-tickets.component.html`)
2. **Componente de Productos principal** (si existe un componente separado)

**Cambios necesarios:**

#### A) Reemplazar inputs de texto libre por autocomplete:

**ANTES:**
```html
<input type="text" [(ngModel)]="productFormData.brand" placeholder="Marca del producto">
<input type="text" [(ngModel)]="productFormData.category" placeholder="Categoría">
```

**DESPUÉS:**
```html
<!-- Brand Autocomplete -->
<div class="autocomplete-container">
  <input 
    type="text" 
    [(ngModel)]="brandSearchText"
    (input)="searchBrands()"
    (focus)="showBrandDropdown = true"
    placeholder="Buscar o crear marca...">
  
  <div *ngIf="showBrandDropdown && filteredBrands.length > 0" class="dropdown">
    <div *ngFor="let brand of filteredBrands" 
         class="dropdown-item"
         (click)="selectBrand(brand)">
      {{ brand.name }}
    </div>
  </div>
  
  <button *ngIf="brandSearchText && !selectedBrand" 
          (click)="createNewBrand()"
          class="btn-create-new">
    <i class="fas fa-plus"></i> Crear "{{ brandSearchText }}"
  </button>
</div>

<!-- Similar para Categories -->
```

#### B) Añadir lógica en el componente:

```typescript
// En supabase-tickets.component.ts

// Inyectar servicio
private productMetadata = inject(ProductMetadataService);

// Estados para autocomplete
brandSearchText = '';
categorySearchText = '';
filteredBrands: ProductBrand[] = [];
filteredCategories: ProductCategory[] = [];
selectedBrand: ProductBrand | null = null;
selectedCategory: ProductCategory | null = null;
showBrandDropdown = false;
showCategoryDropdown = false;

// Métodos de búsqueda
searchBrands() {
  if (!this.brandSearchText.trim()) {
    this.filteredBrands = [];
    return;
  }
  this.productMetadata.searchBrands(this.brandSearchText, this.selectedCompanyId)
    .subscribe(brands => this.filteredBrands = brands);
}

selectBrand(brand: ProductBrand) {
  this.selectedBrand = brand;
  this.productFormData.brand_id = brand.id;
  this.brandSearchText = brand.name;
  this.showBrandDropdown = false;
}

async createNewBrand() {
  try {
    const newBrand = await this.productMetadata.createBrand(
      this.brandSearchText,
      this.selectedCompanyId
    );
    this.selectBrand(newBrand);
  } catch (error) {
    console.error('Error creating brand:', error);
  }
}

// Similar para categories...
```

### **Paso 3: Homogeneizar Formularios**

**Objetivo:** Ambos formularios de producto deben pedir **exactamente lo mismo**:

**Campos requeridos:**
- ✅ Nombre (obligatorio)
- ✅ Marca (autocomplete con crear nueva)
- ✅ Categoría (autocomplete con crear nueva)
- ✅ Precio
- ✅ Stock inicial
- ⚠️ Modelo (opcional)
- ⚠️ Descripción (opcional)

**Layouts sugeridos:**

```html
<!-- Modal homogéneo para ambos contextos -->
<div class="modal-body">
  <div class="form-row">
    <div class="form-group full-width">
      <label>Nombre *</label>
      <input type="text" [(ngModel)]="productFormData.name" required>
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label>Marca *</label>
      <!-- Autocomplete de marca -->
    </div>
    <div class="form-group">
      <label>Categoría *</label>
      <!-- Autocomplete de categoría -->
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label>Modelo</label>
      <input type="text" [(ngModel)]="productFormData.model">
    </div>
    <div class="form-group">
      <label>Precio (€)</label>
      <input type="number" [(ngModel)]="productFormData.price" step="0.01">
    </div>
    <div class="form-group">
      <label>Stock</label>
      <input type="number" [(ngModel)]="productFormData.stock_quantity">
    </div>
  </div>

  <div class="form-row">
    <div class="form-group full-width">
      <label>Descripción</label>
      <textarea [(ngModel)]="productFormData.description" rows="3"></textarea>
    </div>
  </div>
</div>
```

---

## 🎯 Beneficios de la Normalización

### **1. Consistencia de Datos**
- ✅ Elimina variaciones de escritura ("Samsung" vs "SAMSUNG" vs "samsung")
- ✅ Una sola fuente de verdad para marcas y categorías
- ✅ Facilita reportes y analytics

### **2. Mejor UX**
- ✅ Autocomplete inteligente (búsqueda rápida)
- ✅ Creación de marcas/categorías on-the-fly
- ✅ Menos errores de tipeo

### **3. Escalabilidad**
- ✅ Fácil añadir metadata (logos, websites, colores)
- ✅ Jerarquías de categorías (ej: Hardware > RAM > DDR4)
- ✅ Preparado para integraciones futuras (APIs externas de productos)

### **4. Multi-tenant Correcto**
- ✅ Cada empresa tiene sus propias marcas/categorías
- ✅ También pueden usar entidades globales
- ✅ RLS garantiza aislamiento de datos

### **5. Preparado para IA**
- ✅ Estructura normalizada facilita ML/analytics
- ✅ Búsquedas semánticas sobre categorías
- ✅ Recomendaciones basadas en uso

---

## 📝 Notas Importantes

### **Compatibilidad hacia atrás:**
- Los campos `products.brand` y `products.category` (TEXT) se mantienen
- Durante un período de transición, ambos sistemas coexisten
- Migración gradual: nuevos productos usan IDs, legacy se convierte progresivamente

### **Migración segura:**
- El script SQL NO elimina datos existentes
- Solo añade nuevas tablas y columnas
- Los productos actuales mantienen sus valores de texto

### **Performance:**
- Índices creados para todas las queries comunes
- RLS optimizado con índices parciales
- Joins eficientes gracias a FKs

---

## 🔍 Verificación Post-Migración

```sql
-- 1. Verifica que los productos se migraron
SELECT 
  p.name,
  p.brand as legacy_brand,
  pb.name as normalized_brand,
  p.category as legacy_category,
  pc.name as normalized_category
FROM products p
LEFT JOIN product_brands pb ON p.brand_id = pb.id
LEFT JOIN product_categories pc ON p.category_id = pc.id
LIMIT 10;

-- 2. Cuenta marcas únicas
SELECT company_id, COUNT(*) as brands_count
FROM product_brands
GROUP BY company_id;

-- 3. Cuenta categorías únicas
SELECT company_id, COUNT(*) as categories_count
FROM product_categories
GROUP BY company_id;
```

---

## 🚨 Próximos Pasos URGENTES

1. **Ejecutar `normalize_products_schema.sql` en Supabase** ⚠️
2. **Verificar migración con queries de arriba** ✅
3. **Actualizar formularios de productos con autocomplete** 🎨
4. **Probar creación de productos con nuevas marcas/categorías** 🧪
5. **Opcional:** Añadir bulk import de marcas/categorías desde CSV

---

**¿Todo listo?** Ejecuta el SQL y luego continúa con los formularios! 💪
