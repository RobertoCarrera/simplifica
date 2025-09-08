# Guía de Ejecución: Scripts de Tickets y Estadísticas

## 🎯 Objetivo
Corregir el error de columna `price` y implementar cálculo de estadísticas en el backend.

## 📋 Scripts a ejecutar en orden

### 1. Crear función de estadísticas (PRIMERO)
```sql
-- Ejecutar en Supabase SQL Editor:
\i sql/create_ticket_stats_functions.sql
```

**¿Qué hace?**
- Crea función `get_ticket_stats(company_id)` para calcular estadísticas en backend
- Incluye total de horas estimadas y reales
- Calcula tiempo promedio de resolución
- Proporciona fallback si no existen ciertas columnas

### 2. Corregir servicios en tickets (SEGUNDO)
```sql
-- Ejecutar en Supabase SQL Editor:
\i sql/fix_tickets_without_services.sql
```

**¿Qué hace?**
- Corrige el error `price` → `base_price`
- Crea tabla `ticket_services` si no existe
- Genera servicios básicos para cada empresa
- Asigna al menos 1 servicio a cada ticket
- Asignación inteligente basada en título/descripción

## 🔧 Cambios en el Frontend

### Estadísticas optimizadas
El componente ahora:
- ✅ **Usa función del backend** `get_ticket_stats()` para cálculos
- ✅ **Incluye fallback** a cálculo frontend si función no existe
- ✅ **Suma horas** estimadas y reales desde servicios asociados
- ✅ **Calcula tiempo promedio** de resolución real

### Estructura de respuesta del backend:
```json
{
  "total": 15,
  "open": 3,
  "inProgress": 8,
  "completed": 4,
  "overdue": 2,
  "avgResolutionTime": 3.5,
  "totalRevenue": 1250.00,
  "totalEstimatedHours": 45.5,
  "totalActualHours": 52.0,
  "calculatedAt": "2024-12-15T10:30:00Z",
  "companyId": "uuid-de-la-empresa"
}
```

## 🚀 Orden de ejecución

1. **Ejecutar script de funciones**
   ```bash
   # En Supabase SQL Editor
   \i sql/create_ticket_stats_functions.sql
   ```

2. **Ejecutar script de servicios**
   ```bash
   # En Supabase SQL Editor  
   \i sql/fix_tickets_without_services.sql
   ```

3. **Refrescar frontend**
   ```bash
   # Ir a http://localhost:4200/tickets
   # Seleccionar empresa
   # Verificar estadísticas con horas
   ```

## ✅ Verificaciones esperadas

### Después del script de funciones:
- Función `get_ticket_stats()` disponible
- Función `get_all_companies_stats()` disponible
- Sin errores de función no encontrada

### Después del script de servicios:
- Tabla `ticket_services` creada
- 5 servicios básicos por empresa
- Todos los tickets tienen ≥ 1 servicio asociado
- Sin tickets huérfanos sin servicios

### En el frontend:
- Estadísticas cargan desde backend (más rápido)
- Suma de horas estimadas y reales visible
- Tiempo promedio de resolución calculado
- Fallback funciona si backend falla

## 🐛 Resolución de problemas

### Si aparece error "function does not exist":
- El script de funciones no se ejecutó correctamente
- Verificar permisos en Supabase
- Ejecutar manualmente cada función

### Si aparece error "column price does not exist":
- El script de servicios corrige `price` → `base_price`
- Verificar que se aplicaron todos los cambios

### Si estadísticas no aparecen:
- Frontend usa fallback automático
- Verificar consola del navegador
- Comprobar que empresa tiene tickets

## 📊 Beneficios obtenidos

1. **Performance**: Cálculos en backend son más rápidos
2. **Precisión**: Horas calculadas desde servicios reales asociados
3. **Robustez**: Fallback garantiza que siempre funcione
4. **Integridad**: Todos los tickets tienen servicios obligatorios
5. **Escalabilidad**: Backend maneja empresas con miles de tickets sin problemas

## 🎉 Resultado final

- ✅ Error de columna `price` corregido
- ✅ Estadísticas calculadas en backend 
- ✅ Horas totales precisas desde servicios asociados
- ✅ Todos los tickets tienen servicios obligatorios
- ✅ Frontend liberado de cálculos pesados
- ✅ Sistema robusto con fallbacks automáticos
