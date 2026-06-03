# Verificación de Bloqueo de Fechas para Servicios

**Tarea:** t_906c84a2  
**Fecha:** 2026-06-03  
**Contexto:** t_0848759f (Implementar bloqueo de fechas para servicios) → DONE

---

## Resumen Ejecutivo

✅ **VERIFICADO** — La funcionalidad de bloqueo de fechas para servicios está correctamente implementada con tres capas de defensa (RPCs + trigger), manejo correcto de solapamientos temporales, y mensajes de error en español en la edge function pública.

---

## Arquitectura de 3 Capas

La funcionalidad implementa un sistema de bloqueo de fechas con tres capas de protección:

### Capa 1: Tabla `service_blocked_dates`

**Migración:** `20260603000001_add_service_blocked_dates.sql`

```sql
CREATE TABLE IF NOT EXISTS service_blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time DEFAULT NULL,
  end_time time DEFAULT NULL,
  reason text DEFAULT NULL,
  all_day boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_service_blocked_dates_range CHECK (end_date >= start_date)
);
```

**Verificaciones:**
- ✅ CHECK constraint `chk_service_blocked_dates_range` garantiza `end_date >= start_date`
- ✅ Soporta bloqueos de día completo (`all_day = true`) o por franja horaria (`start_time`/`end_time`)
- ✅ RLS configurado: SELECT para miembros de la compañía, INSERT/UPDATE/DELETE solo owner/super_admin
- ✅ Índices en `service_id`, `company_id`, y `(start_date, end_date)` para rendimiento
- ✅ Migración `20260602000001` está marcada como SUPERSEDED (no-op), evitando conflictos

### Capa 2: Funciones RPC (`book_slot` + `create_booking_with_resource`)

**Migraciones:** `20260603000002` + `20260603000003`

Ambas funciones RPC implementan la misma lógica de validación en orden:

1. **Bloqueo por profesional** (`professional_blocked_dates`): Verifica si el profesional específico tiene fechas bloqueadas que solapan con la reserva.
2. **Bloqueo por servicio** (`service_blocked_dates`): SOLO si el profesional realiza ese servicio (JOIN con `professional_services`), verifica si el servicio está bloqueado.
3. **Conflicto de reserva** (`bookings`): Verifica que no haya otra reserva activa en el mismo slot.

**Códigos de error devueltos:**
| Código | Significado |
|--------|-------------|
| `professional_blocked` | El profesional tiene esa fecha bloqueada |
| `service_blocked` | El servicio está bloqueado para todos los profesionales |
| `slot_taken` | El profesional ya tiene una reserva en ese horario |
| `no_room_available` | No hay salas disponibles (solo `create_booking_with_resource`) |

**Verificaciones de lógica de solapamiento:**

Para bloqueos `all_day`:
```sql
daterange(start_date, end_date, '[]') && daterange(p_start_time::date, p_end_time::date, '[]')
```
✅ Usa rangos cerrados `[]` — un bloqueo que termina el mismo día que empieza la reserva SÍ se considera solapamiento.

Para bloqueos con hora específica:
```sql
p_start_time::time < end_time AND p_end_time::time > start_time
```
✅ Solapamiento parcial correcto — si la reserva empieza antes del bloqueo pero termina durante, se detecta.

**Verificación de alcance:**
- ✅ `professional_blocked_dates`: Bloquea SOLO al profesional específico (`WHERE professional_id = p_professional_id`)
- ✅ `service_blocked_dates`: Bloquea a TODOS los profesionales que realizan ese servicio (JOIN `professional_services`)

### Capa 3: Trigger de Base de Datos (Red de Seguridad)

**Migración:** `20260604000000_add_booking_blocked_dates_trigger.sql`

```sql
CREATE TRIGGER trg_bookings_blocked_dates
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION trg_check_blocked_dates();
```

**Verificaciones del trigger:**
- ✅ **BEFORE INSERT OR UPDATE** — intercepta cualquier inserción o modificación
- ✅ **Optimización UPDATE**: Si `professional_id`, `start_time` y `end_time` no cambiaron, omite la verificación
- ✅ **NULL professional_id**: Si no hay profesional asignado, no aplica bloqueo
- ✅ Verifica `professional_blocked_dates` y `service_blocked_dates` con la misma lógica que las RPCs
- ✅ **Mensaje de error claro**: `BlockedDateConflict: El profesional tiene esta fecha bloqueada.` / `El servicio está bloqueado en esta fecha para todos los profesionales.`
- ✅ **Catch-all**: Funciona sin importar el path (RPC, edge function, webhook Docplanner, SQL directo)

---

## Integración con el Frontend

### Servicios Angular

**`ServiceBlockedDatesService`** (`src/app/services/service-blocked-dates.service.ts`):
- ✅ `getBlockedDates(serviceIds?)` — listar bloqueos, opcionalmente filtrados por servicio
- ✅ `getBlockedDatesForDate(date)` — bloqueos que cubren una fecha específica
- ✅ `getBlockedDatesInRange(start, end, serviceIds?)` — bloqueos en rango con filtro opcional
- ✅ `createBlockedDate(block)` — crear nuevo bloqueo
- ✅ `deleteBlockedDate(id)` — eliminar bloqueo

**`ProfessionalBlockedDatesService`** (`src/app/services/professional-blocked-dates.service.ts`):
- ✅ Misma API que el servicio de bloqueos de servicio pero para `professional_blocked_dates`

### Edge Function Pública (`booking-public/index.ts`)

La función `booking-public` llama a `create_booking_with_resource` (línea 632) y maneja los tres errores:

```typescript
case 'professional_blocked':
  errorMsg = 'El profesional no está disponible en esta fecha...';
case 'service_blocked':
  errorMsg = 'Este servicio no está disponible en esta fecha...';
case 'no_room_available':
  errorMsg = 'No hay salas disponibles para este horario...';
```

✅ Mensajes en español, código HTTP 409, sin filtrar datos internos.

---

## Escenarios de Prueba Verificados (Análisis de Código)

| # | Escenario | Capa que lo cubre | Resultado esperado |
|---|-----------|-------------------|-------------------|
| 1 | Profesional A bloqueado → reservar con Profesional A | RPC + Trigger | ❌ `professional_blocked` |
| 2 | Profesional A bloqueado → reservar con Profesional B (mismo servicio) | RPC + Trigger | ✅ Permitido |
| 3 | Servicio X bloqueado → Profesional A (que hace X) intenta reserva | RPC + Trigger | ❌ `service_blocked` |
| 4 | Servicio X bloqueado → Profesional B (que NO hace X) intenta reserva | RPC + Trigger | ✅ Permitido (no aplica) |
| 5 | Servicio X bloqueado → Profesional A intenta reservar servicio Y | RPC + Trigger | ✅ Permitido (servicio distinto) |
| 6 | Bloqueo all_day 2026-06-05 → reserva 2026-06-05 10:00-11:00 | RPC + Trigger | ❌ Bloqueado |
| 7 | Bloqueo 2026-06-05 09:00-12:00 → reserva 2026-06-05 11:30-12:30 | RPC + Trigger | ❌ Bloqueado (solape parcial) |
| 8 | Bloqueo 2026-06-05 09:00-12:00 → reserva 2026-06-05 12:00-13:00 | RPC + Trigger | ✅ Permitido (sin solape: 12:00 < 12:00 es false) |
| 9 | INSERT directo en `bookings` con profesional bloqueado | Solo Trigger | ❌ `BlockedDateConflict` |
| 10 | UPDATE de `bookings` cambiando profesional a uno bloqueado | Solo Trigger | ❌ `BlockedDateConflict` |
| 11 | UPDATE de `bookings` sin cambiar profesional/fechas | Trigger (skip) | ✅ Permitido |
| 12 | Profesional bloqueado → reserva con `professional_id = NULL` | Trigger | ✅ Permitido (no aplica bloqueo) |

---

## Posibles Gaps / Mejoras Futuras

1. **Visibilidad en el portal público**: La edge function de disponibilidad (`/availability`) NO devuelve los bloqueos como períodos ocupados. El frontend de reservas públicas podría mostrar slots como disponibles cuando en realidad están bloqueados. Esto se mitiga porque la RPC rechazará la reserva al crearla, pero la UX no es ideal.

2. **Sin tests automatizados**: No hay tests unitarios o de integración para las funciones RPC o el trigger. Sería recomendable añadir tests con `pgTAP` o tests de integración usando el Supabase local.

3. **professional_blocked_dates sin CREATE TABLE visible**: La tabla `professional_blocked_dates` es referenciada en múltiples migraciones pero su CREATE TABLE no está en este snapshot de migraciones. Asumiendo que se creó en una migración anterior no incluida.

---

## Conclusión

La funcionalidad de bloqueo de fechas para servicios está **completa, correcta y bien diseñada** con redundancia defensiva (RPC + Trigger). Los tres niveles de protección garantizan que:

- Un servicio bloqueado impide reservas para **todos** los profesionales que lo realizan
- Un profesional bloqueado impide reservas **solo** para ese profesional
- El trigger actúa como red de seguridad última, independientemente del camino de entrada

La lógica de solapamiento de fechas y horas es correcta, los mensajes de error están en español, y la integración con el frontend (servicios Angular) y la edge function pública es completa.
