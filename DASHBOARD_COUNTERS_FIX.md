# Correcciones de Contadores Dashboard

## 📋 Resumen

Este documento describe las correcciones aplicadas a los contadores de productos y tickets en los dashboards de la aplicación.

## 🔧 Cambios Realizados

### 1. Fix: Card de Productos en Dashboard Home

**Problema:** El card de "Productos" en el dashboard principal (`/home`) no mostraba ningún contador porque no se estaba cargando la lista de productos.

**Solución:**
- Agregado llamada a `productsService.getProducts()` en el método `loadCounts()` del componente Home
- El contador ahora se actualiza correctamente con la cantidad real de productos de la empresa actual

**Archivo modificado:**
- `src/app/components/home/home.component.ts`

**Código agregado:**
```typescript
// Products (observable)
try {
  this.productsService.getProducts().subscribe(list => {
    this.productsCount = Array.isArray(list) ? list.length : 0;
  }, err => {
    console.warn('Home: error cargando productos', err);
  });
} catch (err) {
  console.warn('Home: error cargando productos', err);
}
```

---

### 2. Fix: Mini-cards de Tickets Dashboard

**Problema:** Los mini-cards de estadísticas de tickets (Abiertos, En Progreso, Completados) usaban filtros basados en nombres de stages, lo cual era impreciso y propenso a errores cuando los usuarios creaban stages personalizados con nombres diferentes.

**Solución:**
Se implementó un sistema de categorización robusto de stages mediante un nuevo campo `stage_category`:

#### A) Migración de Base de Datos

**Archivo creado:** `database/migrations/2025-01-19_add_stage_category.sql`

**Características:**
- Crea enum `stage_category` con valores: `'open'`, `'in_progress'`, `'completed'`, `'on_hold'`
- Agrega columna `stage_category` a tabla `ticket_stages`
- Migra automáticamente los stages existentes según sus nombres
- Crea índice para optimizar consultas por categoría

**Categorización automática:**
```sql
-- Stages abiertos/pendientes
'open' ← Recibido, Abierto, Pendiente, Nuevo

-- Stages en progreso
'in_progress' ← Progreso, Proceso, Diagnóstico, Reparación, Análisis

-- Stages completados
'completed' ← Completado, Finalizado, Cerrado, Entregado, Resuelto, Listo

-- Stages en espera
'on_hold' ← Espera, Esperando, Pausado, Hold
```

#### B) Actualización de Interfaces TypeScript

**Archivos modificados:**
1. `src/app/services/supabase-ticket-stages.service.ts`
   - Exporta tipo `StageCategory`
   - Agrega propiedad `stage_category?: StageCategory` a `TicketStage`
   - Agrega propiedad `stage_category?: StageCategory` a `CreateStagePayload`

2. `src/app/services/supabase-tickets.service.ts`
   - Exporta tipo `StageCategory`
   - Agrega propiedad `stage_category?: StageCategory` a `TicketStage`

**Tipo TypeScript:**
```typescript
export type StageCategory = 'open' | 'in_progress' | 'completed' | 'on_hold';

export interface TicketStage {
  id: string;
  name: string;
  position: number;
  color: string;
  stage_category?: StageCategory; // NUEVO
  // ... otros campos
}
```

#### C) Actualización de Lógica de Conteo

**Archivos modificados:**

1. `src/app/services/supabase-tickets.service.ts` - Método `getTicketStats()`
   - Cambio de filtros por nombre a filtros por `stage_category`
   - Conteo preciso basado en categorías

**Antes:**
```typescript
open: tickets.filter(t => t.stage?.name !== 'Completado').length,
inProgress: tickets.filter(t => t.stage?.name === 'En Progreso').length,
completed: tickets.filter(t => t.stage?.name === 'Completado').length,
```

**Después:**
```typescript
open: tickets.filter(t => t.stage?.stage_category === 'open').length,
inProgress: tickets.filter(t => t.stage?.stage_category === 'in_progress').length,
completed: tickets.filter(t => t.stage?.stage_category === 'completed').length,
```

2. `src/app/components/supabase-tickets/supabase-tickets.component.ts` - Método `calculateStatsInFrontend()`
   - Implementa filtrado por `stage_category` como método primario
   - Mantiene fallback por nombre para backward compatibility
   - Usa la categoría para determinar tickets completados en el cálculo de tiempo promedio de resolución

---

## 🎯 Beneficios

### Productos
✅ **Contador preciso:** Muestra el número real de productos de la empresa  
✅ **Consistencia:** Usa el mismo servicio y filtros que la página de productos

### Tickets
✅ **Clasificación robusta:** No depende de nombres específicos de stages  
✅ **Multiidioma:** Funciona independientemente del idioma de los stages  
✅ **Personalización:** Los usuarios pueden crear stages custom sin romper las estadísticas  
✅ **Backward compatible:** Mantiene fallback por nombre si no hay categoría asignada  
✅ **Performance:** Índice en `stage_category` mejora velocidad de consultas  
✅ **Type-safe:** TypeScript valida las categorías permitidas

---

## 📊 Estadísticas Mejoradas

Los mini-cards de tickets ahora muestran datos confiables:

| Card | Criterio | Categoría |
|------|----------|-----------|
| **Abiertos** | Tickets recibidos o pendientes | `stage_category = 'open'` |
| **En Progreso** | Tickets en trabajo activo | `stage_category = 'in_progress'` |
| **Completados** | Tickets finalizados o entregados | `stage_category = 'completed'` |
| **Vencidos** | Tickets con `due_date` pasada | Sin cambios |
| **Total** | Todos los tickets | Sin cambios |

---

## 🚀 Aplicación de Migración

Para aplicar estos cambios en producción:

1. **Ejecutar migración SQL:**
   ```bash
   # Conectar a Supabase y ejecutar:
   psql -U postgres -d postgres -f database/migrations/2025-01-19_add_stage_category.sql
   ```

   O desde el SQL Editor de Supabase Dashboard:
   - Copiar el contenido de `database/migrations/2025-01-19_add_stage_category.sql`
   - Pegar en SQL Editor
   - Ejecutar

2. **Verificar migración:**
   ```sql
   -- Verificar que la columna existe
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'ticket_stages' 
   AND column_name = 'stage_category';

   -- Ver stages con sus categorías
   SELECT name, stage_category 
   FROM ticket_stages 
   WHERE deleted_at IS NULL
   ORDER BY position;
   ```

3. **Desplegar frontend:**
   ```bash
   npm run build
   # O según tu proceso de deploy
   ```

---

## 🧪 Testing

### Productos
1. Navegar a `/home`
2. Verificar que el card "Productos" muestra el número correcto
3. Comparar con la página `/productos`

### Tickets
1. Navegar a `/tickets`
2. Verificar que los mini-cards muestran números coherentes:
   - **Total** = Abiertos + En Progreso + Completados + otros
   - Los números deben coincidir con los tickets visibles en las vistas
3. Crear un stage personalizado con nombre en español/inglés
4. Asignar la categoría correcta al crear el stage
5. Mover tickets a ese stage
6. Verificar que los contadores se actualizan correctamente

---

## 📝 Notas Adicionales

### Stages Personalizados

Cuando los usuarios creen nuevos stages personalizados, asegurarse de:
1. Asignar una `stage_category` apropiada en el formulario de creación
2. El valor por defecto es `'open'` si no se especifica
3. La categoría se puede cambiar al editar el stage

### Compatibilidad

- ✅ **Backward compatible:** El código incluye fallbacks por nombre
- ✅ **Migración suave:** Los stages existentes se categorizan automáticamente
- ✅ **Sin downtime:** Los cambios no requieren detener la aplicación

### Próximos Pasos Sugeridos

1. **UI para stage_category:** Agregar selector en formulario de creación/edición de stages
2. **Validación:** Agregar constraint CHECK en DB para asegurar categoría válida
3. **Documentación usuario:** Explicar a los usuarios qué significa cada categoría
4. **Analytics:** Usar categorías para reportes más detallados

---

## 🐛 Troubleshooting

### Problema: Contadores siguen mostrando cero

**Causa:** Migración no aplicada o categorías no asignadas

**Solución:**
```sql
-- Verificar que todos los stages tienen categoría
SELECT name, stage_category 
FROM ticket_stages 
WHERE stage_category IS NULL;

-- Si hay nulls, ejecutar la migración completa de nuevo
```

### Problema: TypeScript errors sobre `stage_category`

**Causa:** Tipos no sincronizados con la base de datos

**Solución:**
1. Asegurarse de que los archivos `.service.ts` están actualizados
2. Reiniciar el servidor de desarrollo: `ng serve`
3. Limpiar caché: `rm -rf .angular/cache`

---

## ✅ Checklist de Deployment

- [x] Migración SQL creada
- [x] Interfaces TypeScript actualizadas
- [x] Servicio de tickets actualizado
- [x] Componente de tickets actualizado
- [x] Home component actualizado (productos)
- [x] Backward compatibility mantenida
- [x] Documentación creada

**Fecha:** 2025-01-19  
**Autor:** GitHub Copilot  
**Estado:** ✅ Completado
