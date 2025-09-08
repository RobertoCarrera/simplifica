# Catálogo de Servicios Mejorado - Guía de Usuario

## Descripción General

El nuevo sistema de catálogo de servicios está diseñado para facilitar la creación de presupuestos, facturas y análisis de rendimiento. Incluye categorías dinámicas, campos avanzados para facturación y herramientas de gestión empresarial.

## Características Principales

### 1. Categorías Dinámicas
- **Creación automática**: Si escribes una categoría que no existe, el sistema te permitirá crearla dinámicamente
- **Autocompletado inteligente**: El sistema sugiere categorías existentes mientras escribes
- **Iconos automáticos**: Genera iconos apropiados basados en el nombre de la categoría
- **Colores únicos**: Asigna colores distintivos a cada categoría

### 2. Información Completa para Facturación

#### Precios y Facturación
- **Precio Base**: Precio estándar del servicio
- **Costo**: Costo interno para calcular márgenes
- **IVA**: Tasa de impuesto configurable (por defecto 21%)
- **Margen de Beneficio**: Porcentaje de ganancia sobre el costo

#### Tiempo y Cantidades
- **Horas Estimadas**: Tiempo previsto para completar el servicio
- **Unidad de Medida**: Horas, unidades, días, trabajos, licencias, sesiones
- **Cantidad Mínima**: Cantidad mínima facturable
- **Cantidad Máxima**: Límite máximo por pedido

### 3. Gestión y Analíticas

#### Dificultad y Prioridad
- **Nivel de Dificultad**: Escala de 1-5 para planificación de recursos
- **Nivel de Prioridad**: Escala de 1-5 para gestión de cola de trabajo
- **Días de Garantía**: Período de garantía del servicio

#### Características del Servicio
- **Remoto**: Indica si se puede realizar a distancia
- **Requiere Piezas**: Si necesita componentes adicionales
- **Requiere Diagnóstico**: Si necesita evaluación previa

## Guía de Uso

### Crear un Nuevo Servicio

1. **Información Básica**:
   - Nombre descriptivo del servicio
   - Categoría (nueva o existente)
   - Descripción detallada para presupuestos

2. **Configurar Precios**:
   - Establecer precio base y costo
   - Configurar IVA y margen de beneficio
   - El sistema calculará automáticamente el precio final

3. **Definir Tiempo y Cantidades**:
   - Estimar horas de trabajo
   - Seleccionar unidad de medida apropiada
   - Configurar cantidades mínimas/máximas

4. **Gestión Avanzada**:
   - Asignar nivel de dificultad y prioridad
   - Configurar garantía
   - Marcar características especiales

### Categorías Dinámicas

#### Crear Nueva Categoría
1. En el campo "Categoría", empieza a escribir
2. Si no existe, aparecerá la opción "Crear [nombre]"
3. Haz clic para crear automáticamente
4. El sistema asignará un color e icono

#### Categorías Predeterminadas
- **Diagnóstico**: Análisis y evaluación
- **Software**: Instalación y configuración
- **Mantenimiento**: Preventivo y correctivo
- **Datos**: Recuperación y gestión
- **Seguridad**: Servicios de protección
- **Hardware**: Reparación y actualización
- **Redes**: Configuración de conectividad
- **Formación**: Cursos y capacitación
- **Consultoría**: Asesoramiento especializado

## Beneficios para el Negocio

### Para Presupuestos
- Información completa para generar presupuestos precisos
- Cálculo automático de precios con IVA incluido
- Descripción detallada para el cliente
- Estimación precisa de tiempos

### Para Facturas
- Datos estructurados para facturación automática
- Control de IVA y márgenes
- Trazabilidad de costos y beneficios
- Garantías claramente definidas

### Para Analíticas
- Métricas de rentabilidad por servicio
- Análisis de tiempos vs estimaciones
- Distribución por categorías y dificultad
- Identificación de servicios más rentables

## Migraciones de Base de Datos

### Scripts Necesarios
1. `enhance_services_fields.sql`: Añade todos los campos nuevos
2. `rename_works_to_services.sql`: Renombra la tabla (si procede)

### Orden de Ejecución
1. Ejecutar en entorno de staging primero
2. Verificar que todos los datos se migran correctamente
3. Hacer backup de producción
4. Ejecutar en producción durante ventana de mantenimiento

## Campos de Base de Datos

### Nuevos Campos Añadidos
```sql
-- Facturación
tax_rate DECIMAL(5,2) DEFAULT 21.00
unit_type VARCHAR(50) DEFAULT 'horas'
min_quantity DECIMAL(10,2) DEFAULT 1.00
max_quantity DECIMAL(10,2)

-- Analíticas
difficulty_level INTEGER (1-5)
profit_margin DECIMAL(5,2) DEFAULT 30.00
cost_price DECIMAL(10,2) DEFAULT 0.00

-- Gestión
requires_parts BOOLEAN DEFAULT FALSE
requires_diagnosis BOOLEAN DEFAULT FALSE
warranty_days INTEGER DEFAULT 30
skill_requirements TEXT[]
tools_required TEXT[]
can_be_remote BOOLEAN DEFAULT TRUE
priority_level INTEGER (1-5) DEFAULT 3
```

### Tabla de Categorías
```sql
CREATE TABLE service_categories (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#6b7280',
    icon VARCHAR(50) DEFAULT 'fas fa-cog',
    description TEXT,
    company_id UUID REFERENCES companies(id),
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

## Próximos Pasos

1. **Ejecutar Migraciones**: Aplicar los scripts de base de datos
2. **Migrar Servicios Existentes**: Actualizar servicios con nueva información
3. **Capacitar Usuarios**: Entrenar al equipo en las nuevas funcionalidades
4. **Integrar con Presupuestos**: Conectar con el sistema de presupuestación
5. **Configurar Analíticas**: Implementar dashboards de rendimiento

## Consideraciones Técnicas

- Las migraciones son idempotentes (se pueden ejecutar múltiples veces)
- Los campos nuevos tienen valores por defecto sensatos
- La funcionalidad antigua sigue siendo compatible
- Se mantiene la estructura de permisos por empresa
- Todos los índices necesarios se crean automáticamente
