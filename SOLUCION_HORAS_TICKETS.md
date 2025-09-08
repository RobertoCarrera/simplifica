# Solución para Columnas de Horas Faltantes en Tickets

## Problema
El error `column tickets.estimated_hours does not exist` indica que la tabla `tickets` en Supabase no tiene las columnas necesarias para gestionar las horas estimadas y reales.

## Solución

### Paso 1: Verificar la estructura actual (Opcional)
Ejecuta en el SQL Editor de Supabase:
```sql
-- Verificar columnas existentes
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'tickets' 
    AND column_name IN ('estimated_hours', 'actual_hours')
ORDER BY column_name;
```

### Paso 2: Agregar las columnas faltantes
Ejecuta el siguiente script en el SQL Editor de Supabase:

```sql
-- Agregar columnas de horas a la tabla tickets
DO $$
BEGIN
    -- Verificar y agregar estimated_hours si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tickets' 
        AND column_name = 'estimated_hours'
    ) THEN
        ALTER TABLE tickets ADD COLUMN estimated_hours DECIMAL(5,2) DEFAULT 0;
        RAISE NOTICE 'Columna estimated_hours agregada a la tabla tickets';
    ELSE
        RAISE NOTICE 'Columna estimated_hours ya existe en la tabla tickets';
    END IF;

    -- Verificar y agregar actual_hours si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tickets' 
        AND column_name = 'actual_hours'
    ) THEN
        ALTER TABLE tickets ADD COLUMN actual_hours DECIMAL(5,2) DEFAULT 0;
        RAISE NOTICE 'Columna actual_hours agregada a la tabla tickets';
    ELSE
        RAISE NOTICE 'Columna actual_hours ya existe en la tabla tickets';
    END IF;

    -- Opcional: Calcular estimated_hours basado en servicios existentes
    UPDATE tickets 
    SET estimated_hours = (
        SELECT COALESCE(SUM(s.estimated_hours * ts.quantity), 0)
        FROM ticket_services ts
        JOIN services s ON ts.service_id = s.id
        WHERE ts.ticket_id = tickets.id
    )
    WHERE (estimated_hours IS NULL OR estimated_hours = 0)
    AND EXISTS (
        SELECT 1 FROM ticket_services ts 
        WHERE ts.ticket_id = tickets.id
    );

    RAISE NOTICE 'Script completado. Columnas de horas agregadas y calculadas.';
END;
$$;
```

### Paso 3: Verificar que funciona
1. Refresca la aplicación Angular
2. Navega a la vista de tickets
3. Haz clic en "Ver Detalle" en cualquier ticket
4. Deberías ver las horas estimadas y reales sin errores

## Funcionalidades Implementadas

### ✅ Manejo Robusto de Horas
- **Horas Estimadas**: Se calculan automáticamente desde los servicios asociados al ticket
- **Horas Reales**: Campo editable para registrar el tiempo real trabajado
- **Fallback Gracioso**: Si las columnas no existen, la aplicación funciona sin errores

### ✅ Interfaz de Usuario
- **Vista de Horas**: Se muestran tanto las horas estimadas como las reales
- **Botón "Actualizar Horas"**: Permite modificar las horas reales trabajadas
- **Cálculo Automático**: Las horas estimadas se calculan desde los servicios del ticket

### ✅ Scripts SQL Incluidos
- `sql/add_hours_columns_to_tickets.sql`: Script completo para agregar columnas
- `sql/check_hours_columns.sql`: Script para verificar la estructura actual

## Notas Técnicas

### Estructura de Columnas
```sql
estimated_hours DECIMAL(5,2) DEFAULT 0  -- Máximo 999.99 horas
actual_hours DECIMAL(5,2) DEFAULT 0     -- Máximo 999.99 horas
```

### Lógica de Cálculo
1. **Horas Estimadas**: 
   - Si existe la columna `estimated_hours` y tiene valor > 0, usar ese valor
   - Si no, calcular sumando `services.estimated_hours * ticket_services.quantity`

2. **Horas Reales**:
   - Usar el valor de la columna `actual_hours`
   - Si no existe la columna, mostrar 0

### Compatibilidad
- ✅ Funciona con o sin las columnas de horas
- ✅ Migración automática de datos existentes
- ✅ Manejo de errores gracioso
- ✅ Interfaz responsive y profesional

## Después de Ejecutar el Script

Una vez ejecutado el script SQL, tendrás:
- ✅ Columnas `estimated_hours` y `actual_hours` en la tabla `tickets`
- ✅ Valores calculados automáticamente para tickets existentes
- ✅ Funcionalidad completa de gestión de horas en el frontend
- ✅ Botón funcional para actualizar horas reales

¡El componente de ticket detail ahora debería funcionar perfectamente! 🎉
