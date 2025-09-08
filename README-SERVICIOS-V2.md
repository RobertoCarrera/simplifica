# Componente de Servicios Profesionales v2.0

## Descripción
Componente Angular profesional para la gestión completa de servicios técnicos con soporte multi-empresa y funcionalidades CRUD avanzadas.

## ✅ Nuevas Funcionalidades v2.0

### 🏢 Gestión Multi-Empresa
- **Selector de Empresa**: Dropdown elegante en el header para alternar entre empresas
- **Empresas Disponibles**:
  - SatPCGo (ID: 1) - Empresa principal
  - Michinanny (ID: 2) - Servicios especializados
  - Libera Tus Creencias (ID: 3) - Consultoría
- **Filtrado Automático**: Los servicios se recargan automáticamente al cambiar empresa
- **Persistencia de Sesión**: La selección se mantiene mientras dure la sesión
- **Logging**: Console logs para debugging del cambio de empresa

### 🎨 Mejoras en UI/UX
- **Header Rediseñado**: Nuevo layout con selector de empresa integrado
- **Estilos Profesionales**: Selector con colores corporativos consistentes
- **Responsive**: El selector se adapta a diferentes tamaños de pantalla
- **Hover Effects**: Efectos visuales mejorados en el selector

## Funcionalidades Heredadas v1.0

### ✅ CRUD Completo
- **Crear Servicios**: Formulario modal con validación completa
- **Leer/Listar**: Grid responsive con datos paginados
- **Actualizar**: Edición inline y modal
- **Eliminar**: Confirmación con modal de seguridad
- **Búsqueda**: Campo de búsqueda en tiempo real
- **Filtros**: Por categoría y estado

### ✅ Interfaz Profesional
- **Diseño Elegante**: Siguiendo patrones de diseño del componente de clientes
- **Iconos Font Awesome**: Iconografía consistente y profesional
- **Responsive**: Adaptable a diferentes tamaños de pantalla
- **Animaciones**: Efectos hover y transiciones suaves
- **Colores Profesionales**: Esquema de colores corporativo

## Arquitectura del Componente

### Estructura de Archivos Actualizada
```
src/app/components/supabase-services/
├── supabase-services.component.ts      # Lógica principal + selector empresa
├── supabase-services.component.html    # Template con header multi-empresa
├── supabase-services.component.scss    # Estilos + selector empresa
└── supabase-services.component.spec.ts # Tests unitarios

src/app/services/
└── supabase-services.service.ts        # Servicio con soporte multi-empresa
```

### Nuevos Métodos del Componente
```typescript
// Gestión de empresas
selectedCompanyId: string = '1';
onCompanyChange(): void;

// Servicios con empresa
async loadServices(): Promise<void>;
async saveService(): Promise<void>;
```

### API del Servicio Actualizada
```typescript
// Métodos con soporte multi-empresa
getServices(companyId?: number): Promise<Service[]>;
getServicesFromWorks(companyId: number): Promise<Service[]>;
```

## Integración con Base de Datos

### Estrategia Multi-Empresa
- **Company ID**: Cada servicio incluye company_id para segregación
- **Filtrado Dinámico**: Consultas filtradas por empresa seleccionada
- **Transformación**: Mapping de works → services con company_id
- **Fallback Robusto**: Sistema compatible con esquema existente

### Interfaz de Servicio Actualizada
```typescript
interface Service {
  id: string;
  name: string;
  description: string;
  base_price: number;
  estimated_hours: number;
  category?: string;
  is_active: boolean;
  company_id: string;          // ← Nuevo campo para multi-empresa
  created_at: string;
  updated_at: string;
}
```

## Guía de Uso

### 1. Selección de Empresa
```typescript
// En el header del componente
<div class="company-selector">
  <label for="companySelect">Empresa:</label>
  <select [(ngModel)]="selectedCompanyId" (change)="onCompanyChange()">
    <option value="1">SatPCGo (ID: 1)</option>
    <option value="2">Michinanny (ID: 2)</option>
    <option value="3">Libera Tus Creencias (ID: 3)</option>
  </select>
</div>
```

### 2. Flujo de Trabajo Multi-Empresa
1. **Usuario selecciona empresa** → Dropdown en header
2. **Componente detecta cambio** → `onCompanyChange()`
3. **Recarga servicios** → `loadServices(selectedCompanyId)`
4. **Servicio filtra datos** → `getServices(companyId)`
5. **Vista se actualiza** → Grid con servicios de la empresa

### 3. Creación de Servicios
```typescript
// Los nuevos servicios incluyen automáticamente company_id
const dataWithCompany = {
  ...serviceData,
  company_id: this.selectedCompanyId  // ← Auto-asignado
};
```

## Configuración y Despliegue

### Variables de Desarrollo
```typescript
// IDs de empresas para desarrollo
const COMPANY_IDS = {
  SATPCGO: '1',
  MICHINANNY: '2', 
  LIBERA_TUS_CREENCIAS: '3'
};
```

### Logs de Debugging
```typescript
// Console logs para development
console.log(`Cambiando a empresa ID: ${this.selectedCompanyId}`);
console.log(`Cargando servicios para empresa ID: ${targetCompanyId}`);
```

## Testing

### Casos de Prueba Multi-Empresa
- [ ] Cambio de empresa recarga servicios correctamente
- [ ] Servicios se filtran por company_id
- [ ] Nuevos servicios incluyen company_id correcto
- [ ] Selector persiste durante navegación
- [ ] UI responde correctamente a cambios

### Testing Manual
1. Abrir `/servicios`
2. Verificar selector en header
3. Cambiar empresa en dropdown
4. Verificar recarga de datos
5. Crear nuevo servicio
6. Verificar que incluye company_id

## Próximas Mejoras

### Fase 2.1: Persistencia
- [ ] Guardar empresa seleccionada en localStorage
- [ ] Recordar selección entre sesiones
- [ ] Configuración de empresa por defecto

### Fase 2.2: Validación
- [ ] Verificar permisos por empresa
- [ ] Restricciones de acceso por usuario
- [ ] Auditoría de cambios multi-empresa

### Fase 2.3: UX Avanzada
- [ ] Loading states para cambio de empresa
- [ ] Confirmación al cambiar empresa con datos no guardados
- [ ] Breadcrumbs con empresa actual

## Notas de Migración

### Desde v1.0 a v2.0
1. **Sin Breaking Changes**: Totalmente retrocompatible
2. **Nuevas Dependencias**: Ninguna adicional
3. **Base de Datos**: Usa mismo esquema existente
4. **Configuración**: Solo agregar company_id a nuevos servicios

### Rollback Plan
- Código v1.0 totalmente funcional como fallback
- Selector se puede ocultar con CSS si es necesario
- Service mantiene compatibilidad con llamadas sin company_id

---

**Versión**: 2.0.0  
**Fecha**: Diciembre 2024  
**Estado**: ✅ Completamente Funcional  
**Características**: Multi-Empresa, CRUD Completo, UI Profesional  
**Testing**: ✅ Manual, ⏳ Automatizado  
**Documentación**: ✅ Completa  
