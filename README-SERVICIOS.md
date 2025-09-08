# Componente de Servicios (SupabaseServicesComponent)

## 📋 Descripción

El componente **SupabaseServicesComponent** es un sistema completo de gestión de servicios técnicos con un diseño profesional y elegante. Reemplaza al anterior componente "trabajos" con funcionalidad CRUD completa y integración con Supabase.

## ✨ Características Principales

### 🎨 Diseño Profesional
- **Interfaz moderna** similar al componente de clientes
- **Iconos Font Awesome** para una apariencia profesional
- **Diseño responsive** que se adapta a diferentes dispositivos
- **Animaciones suaves** en hover y transiciones
- **Colores consistentes** con el tema de la aplicación

### 🛠 Funcionalidades CRUD
- ✅ **Crear** nuevos servicios
- ✅ **Leer** y visualizar servicios existentes
- ✅ **Actualizar** servicios existentes
- ✅ **Eliminar** servicios
- ✅ **Duplicar** servicios para facilitar la creación
- ✅ **Activar/Desactivar** servicios

### 🔍 Filtros y Búsqueda
- **Búsqueda por texto** en nombre y descripción
- **Filtrado por categoría** dinámico
- **Filtrado por estado** (activo/inactivo)
- **Limpiar filtros** con un solo clic

### 📊 Estadísticas
- **Total de servicios** registrados
- **Servicios activos** disponibles
- **Precio promedio** de servicios
- **Tiempo promedio** de ejecución

## 🗂 Estructura de Archivos

```
src/app/components/supabase-services/
├── supabase-services.component.ts       # Lógica del componente
├── supabase-services.component.html     # Template HTML
├── supabase-services.component.scss     # Estilos profesionales
└── supabase-services.component.spec.ts  # Pruebas unitarias

src/app/services/
├── supabase-services.service.ts         # Servicio especializado
└── supabase-services.service.spec.ts    # Pruebas del servicio

sql/
└── create_services_table.sql            # Script SQL para Supabase
```

## 🗄 Base de Datos

### Tabla: `services`

```sql
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  base_price DECIMAL(10,2) DEFAULT 0,
  estimated_hours DECIMAL(4,2) DEFAULT 0,
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  company_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Índices para Rendimiento
- `idx_services_company_id` - Consultas por empresa
- `idx_services_category` - Filtrado por categoría
- `idx_services_active` - Filtrado por estado
- `idx_services_name` - Búsqueda por nombre

## 🚀 Instalación y Configuración

### 1. Base de Datos
Ejecutar el script SQL en Supabase:
```bash
# Navegar al dashboard de Supabase
# SQL Editor > Ejecutar: sql/create_services_table.sql
```

### 2. Rutas
Las siguientes rutas están configuradas:
- `/servicios` - Nueva ruta principal
- `/services` - Alias para móvil
- `/trabajos` - Redirección desde el nombre anterior
- `/works` - Alias para móvil

### 3. Menú de Navegación
El menú principal ahora muestra "Servicios" en lugar de "Trabajos".

## 📱 Uso del Componente

### Crear Nuevo Servicio
1. Clic en "Nuevo Servicio"
2. Completar formulario:
   - Nombre (obligatorio)
   - Categoría (obligatorio)
   - Precio base (obligatorio)
   - Horas estimadas (obligatorio)
   - Descripción (opcional)
   - Estado activo/inactivo

### Gestionar Servicios Existentes
- **Ver detalles**: Clic en el icono de ojo
- **Editar**: Clic en el icono de lápiz
- **Duplicar**: Clic en el icono de copia
- **Eliminar**: Clic en el icono de papelera
- **Activar/Desactivar**: Botón de toggle en la tarjeta

### Filtrar y Buscar
- **Buscar**: Escribir en el campo de búsqueda
- **Filtrar por categoría**: Seleccionar en el dropdown
- **Filtrar por estado**: Seleccionar activos/inactivos
- **Limpiar**: Botón "Limpiar" para resetear filtros

## 🎯 Integración con Tickets

El componente está preparado para integración futura con el sistema de tickets:
- Botón "Añadir al Ticket" en cada servicio
- Interfaz preparada para selección múltiple
- Cálculo automático de precios y tiempos

## 🧪 Pruebas

### Datos de Ejemplo
El sistema incluye 10 servicios de ejemplo:
- Diagnóstico de Hardware
- Instalación de Sistema Operativo
- Limpieza Profunda
- Recuperación de Datos
- Eliminación de Virus
- Actualización de Hardware
- Configuración de Red
- Backup y Restauración
- Optimización del Sistema
- Reparación de Pantalla

### Categorías Incluidas
- Diagnóstico
- Software
- Mantenimiento
- Datos
- Seguridad
- Hardware
- Redes

## 🔧 Servicios Utilizados

### SupabaseServicesService
Servicio especializado que maneja todas las operaciones CRUD:

```typescript
// Métodos principales
getServices(): Promise<Service[]>
createService(service: Partial<Service>): Promise<Service>
updateService(id: string, updates: Partial<Service>): Promise<Service>
deleteService(id: string): Promise<void>
toggleServiceStatus(id: string): Promise<Service>
duplicateService(id: string): Promise<Service>

// Métodos de búsqueda y filtrado
getServicesByCategory(category: string): Promise<Service[]>
getActiveServices(): Promise<Service[]>
searchServices(searchTerm: string): Promise<Service[]>
getServiceStats(): Promise<ServiceStats>
getCategories(): Promise<string[]>

// Métodos de utilidad
formatCurrency(amount: number): string
formatHours(hours: number): string
calculateHourlyRate(basePrice: number, estimatedHours: number): number
```

## 🎨 Estilos y Temas

### Colores por Categoría
```scss
$category-colors: (
  'Diagnóstico': #3b82f6,    // Azul
  'Software': #059669,       // Verde
  'Mantenimiento': #d97706,  // Naranja
  'Datos': #dc2626,          // Rojo
  'Seguridad': #7c3aed,      // Púrpura
  'Hardware': #f59e0b,       // Amarillo
  'Redes': #10b981           // Verde claro
);
```

### Responsive Design
- **Desktop**: Grid de 3 columnas
- **Tablet**: Grid de 2 columnas  
- **Móvil**: Grid de 1 columna
- **Filtros**: Stack vertical en móvil

## 🔄 Migración desde Trabajos

### Cambios Principales
1. **Ruta**: `/trabajos` → `/servicios`
2. **Menú**: "Trabajos" → "Servicios"
3. **Base de datos**: Migración automática de datos
4. **Interfaz**: Diseño completamente renovado
5. **Funcionalidad**: CRUD completo vs solo lectura

### Compatibilidad
- Rutas antiguas redirigen automáticamente
- Datos existentes se mantienen
- API backward compatible

## 📈 Métricas y Analytics

### Estadísticas Disponibles
- Número total de servicios
- Servicios activos vs inactivos
- Precio promedio de servicios
- Tiempo promedio de ejecución
- Distribución por categorías

### Futuras Mejoras
- [ ] Historial de cambios
- [ ] Métricas de uso por servicio
- [ ] Integración con sistema de facturación
- [ ] Reportes personalizados
- [ ] Export/Import de servicios

## 🤝 Contribuir

Para contribuir al desarrollo:
1. Seguir las convenciones de código existentes
2. Añadir pruebas para nueva funcionalidad
3. Mantener la documentación actualizada
4. Respetar el diseño profesional establecido

## 📞 Soporte

Para soporte técnico o dudas sobre el componente, contactar al equipo de desarrollo.
