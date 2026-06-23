# Kill Switch Global de Automatizaciones

Panel: `/admin/system-health` → sección "Controles Globales"
Visible solo para `super_admin` (RLS en `system_settings`).

## Estado actual (2026-06-23)

| Switch | Estado | Lo que pausa | Cron | A quién afecta |
|---|---|---|---|---|
| `process_reminders_paused` | ⚠️ **PAUSADO** | Recordatorios 24h/1h + petición de reseña 2h | `0 * * * *` (cada hora) | Clientes (email) |
| `notify_inactive_clients_paused` | ✅ Activo | "Te echamos de menos" a clientes sin reservas | `30 2 * * *` (diario 02:30) | Clientes (email) |
| `marketing_automation_paused` | ✅ Activo | Campañas + secuencias de follow-up + lead nurturing | `30 9 * * *` (diario 09:30) | Leads y clientes (email) |

## Cómo funciona

- Tabla `public.system_settings` (single-row, `id=1`).
- RLS: solo `super_admin` puede SELECT/UPDATE.
- Cada EF afectado lee su flag al inicio del `try` y devuelve `{paused: true, processed: 0}` si está activo.
- **Fail-open**: si la tabla falla, el EF procesa normal (mejor que silenciar para siempre).
- Helper `public.is_super_admin()` SECURITY DEFINER para chequear rol.

## Cron jobs NO cubiertos (deliberado)

Estos NO afectan a clientes directamente, solo a staff/owner o infraestructura:

| Cron | Qué hace | Por qué no se puede pausar |
|---|---|---|
| `send-daily-digest-15min` | Resumen diario al owner | Notificación interna, no email a cliente |
| `check-gdpr-deadlines` | Inserta registros GDPR | Sin envío de email |
| `check-completed-sessions` | Notifica al profesional que acabó sesión | Notificación interna |
| `aws-jobs-processor-5min` | Procesa cola AWS | Infraestructura |
| `docplanner-auto-sync` | Sync con sistema externo | Integración |

Si en el futuro se quiere cubrir alguno, replicar el patrón:
1. Añadir columna `<nombre>_paused` a `system_settings`
2. EF lee al inicio del `try`
3. UI: añadir toggle

## Cuándo usar el kill switch

- **Testear** sin que se manden emails reales a clientes
- **Silenciar temporalmente** después de un envío masivo que se fue de madre
- **Debugging** cuando un EF hace cosas raras
- **Antes de un deploy** riesgoso del EF correspondiente

## Cómo revertir / extender

SQL para ver estado:
```sql
SELECT * FROM public.system_settings;
```

SQL para pausar manualmente (en lugar de UI):
```sql
UPDATE public.system_settings
SET process_reminders_paused = true,
    process_reminders_paused_at = now(),
    process_reminders_paused_by = '<auth_uid>'
WHERE id = 1;
```

Migraciones:
- `20260623_system_settings_kill_switch.sql` — creación tabla + primer toggle
- `20260623_extend_system_settings_kill_switches.sql` — añade 2 toggles más

## Limitaciones conocidas

- Race window: entre el `UPDATE` SQL y el próximo cron tick puede pasar hasta 1h.
- `paused_by` FK a `auth.users(id)`: si se borra el user, hay que nullear la columna antes.
- Solo cubre EFs específicos — no es un kill switch genérico para futuros cron jobs.
