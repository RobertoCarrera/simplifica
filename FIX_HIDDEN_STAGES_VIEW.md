# 🔧 FIX: Sistema de Estados Ocultos - VIEW vs Consulta Directa

## 📋 Problema Identificado

El frontend mostraba **SIEMPRE `is_hidden: false`** aunque la Edge Function insertaba correctamente en `hidden_stages`.

### Causa Raíz

La VIEW `visible_stages_by_company` estaba diseñada para **EXCLUIR** estados ocultos:

```sql
WHERE 
  -- Incluir estados genéricos no ocultos
  (ts.company_id IS NULL AND hs.id IS NULL)  -- ❌ Solo muestra si NO hay hidden_stages
```

Esta VIEW es correcta para **mostrar tickets** (donde NO quieres ver estados ocultos), pero **incorrecta para configuración** (donde SÍ necesitas verlos para poder des-ocultarlos).

## ✅ Solución Implementada

**Opción B (limpia):** El servicio de configuración consulta directamente las tablas.

### Lo que YA estaba correcto ✅

El servicio `SupabaseTicketStagesService.getGenericStages()` **YA** implementaba correctamente la Opción B:

```typescript
// 1. Consulta directa a ticket_stages (genéricos)
const { data: stages } = await this.supabase
  .from('ticket_stages')
  .select('*')
  .is('company_id', null)
  .order('position');

// 2. Consulta directa a hidden_stages
const { data: hiddenStages } = await this.supabase
  .from('hidden_stages')
  .select('stage_id')
  .eq('company_id', companyId);

// 3. Marca is_hidden correctamente
const hiddenStageIds = new Set(hiddenStages?.map(h => h.stage_id) || []);
const stagesWithHiddenInfo = stages.map(stage => ({
  ...stage,
  is_hidden: hiddenStageIds.has(stage.id)
}));
```

### Lo que se agregó 🆕

1. **Botón "Volver"** en la parte superior de `/configuracion/estados`:
   ```html
   <div class="header-top">
     <button class="btn-back" routerLink="/configuracion">
       <i class="fas fa-arrow-left"></i> Volver
     </button>
   </div>
   ```

2. **Import de RouterLink**:
   ```typescript
   import { RouterLink } from '@angular/router';
   imports: [CommonModule, FormsModule, RouterLink]
   ```

3. **Estilos del botón**:
   ```css
   .btn-back {
     display: inline-flex;
     align-items: center;
     gap: 0.5rem;
     padding: 0.5rem 1rem;
     background: #f3f4f6;
     border: 1px solid #d1d5db;
     color: #374151;
     transition: all 0.2s;
   }
   ```

## 🔍 Verificación

### 1. Verifica la tabla `hidden_stages`

```bash
# En Supabase Dashboard > SQL Editor
SELECT * FROM hidden_stages;
```

**Esperado:** Deberías ver registros insertados cuando ocultas estados.

### 2. Verifica el comportamiento del frontend

1. F5 en `http://localhost:4200/configuracion/estados`
2. Click en "Ocultar" para un estado genérico
3. **Esperado:** Badge "Oculto" aparece inmediatamente + opacity reducida
4. Click en "Mostrar"
5. **Esperado:** Badge desaparece + opacity normal

### 3. Verifica logs de Edge Function

```bash
supabase functions logs hide-stage --follow
```

**Esperado:**
```
✅ Authenticated user: auth-uuid
✅ User id: users-uuid, company_id: company-uuid
🔄 Processing hide for stage stage-uuid
✅ Stage "Recibido" is generic
✅ Stage hidden successfully
```

## 📊 Diagnóstico si sigue sin funcionar

Si `is_hidden` sigue siendo `false`:

### Query de debugging:

```sql
-- Ver si hay registros en hidden_stages
SELECT 
  ts.name as stage_name,
  hs.id as hidden_record_id,
  c.name as company_name,
  u.email as hidden_by
FROM ticket_stages ts
LEFT JOIN hidden_stages hs ON hs.stage_id = ts.id
LEFT JOIN companies c ON c.id = hs.company_id
LEFT JOIN users u ON u.id = hs.hidden_by
WHERE ts.company_id IS NULL
ORDER BY ts.position;
```

### Prueba manual de inserción:

```sql
-- Insertar manualmente para verificar que la lógica funciona
INSERT INTO hidden_stages (company_id, stage_id, hidden_by)
VALUES (
  'tu-company-id', -- Reemplaza con tu company_id
  'stage-id-a-ocultar', -- Reemplaza con un stage.id genérico
  (SELECT id FROM users WHERE company_id = 'tu-company-id' LIMIT 1)
);
```

Luego F5 en Angular y verifica si aparece el badge "Oculto".

## 🎯 Resumen

| Componente | Estado | Observación |
|------------|--------|-------------|
| Edge Function | ✅ Correcto | Inserta/elimina en hidden_stages |
| RLS Policies | ✅ Correcto | Permitido con service_role |
| Servicio Angular | ✅ Correcto | Consulta directa a tablas |
| Componente Angular | ✅ Correcto | Llama a loadStages() después de hide/unhide |
| VIEW | ⚠️ No usada | Solo para tickets, NO para configuración |
| Botón Volver | ✅ Agregado | RouterLink a /configuracion |

## 📁 Archivos Modificados

- `src/app/components/stages-management/stages-management.component.ts`
  - Agregado botón "Volver" en header
  - Import de RouterLink
  - Estilos del botón

## 📝 Archivos Creados

- `verify-hidden-stages.sql` - Queries de verificación y debugging

## 🚀 Próximos Pasos

1. **Ejecuta** `verify-hidden-stages.sql` en Supabase SQL Editor
2. **F5** en http://localhost:4200/configuracion/estados
3. **Prueba** ocultar/mostrar estados
4. **Verifica** que el badge "Oculto" aparece correctamente
5. **Si sigue fallando:** Comparte resultado de query #1 en verify-hidden-stages.sql

## 💡 Notas Importantes

- **NO uses `visible_stages_by_company`** para configuración
- **SÍ usa `visible_stages_by_company`** para mostrar tickets (excluye ocultos)
- El método `getGenericStages()` consulta directamente las tablas ✅
- El método `getVisibleStages()` filtra estados ocultos para tickets ✅
- Ambos métodos son complementarios y sirven propósitos diferentes
