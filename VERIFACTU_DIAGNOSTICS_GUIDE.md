# Guía Rápida: Ejecución de Diagnósticos VeriFactu

## ⚡ Ejecución Rápida

### Opción 1: Script Automatizado (Recomendado)
```bash
# Dar permisos de ejecución
chmod +x run-verifactu-diagnostics.sh

# Ejecutar
./run-verifactu-diagnostics.sh
```

### Opción 2: Comandos Manuales

#### 1. Aplicar permisos (Supabase SQL Editor o CLI)
```bash
supabase db execute -f fix-verifactu-permissions.sql
```

O copia el contenido de `fix-verifactu-permissions.sql` en el SQL Editor de Supabase Dashboard.

#### 2. Verificar estructura de tablas
```bash
supabase db execute -f check-verifactu-tables.sql
```

#### 3. Test endpoints del dispatcher

**Config:**
```bash
curl -X POST https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/verifactu-dispatcher \
  -H "Content-Type: application/json" \
  -H "apikey: TU_SERVICE_ROLE_KEY" \
  -d '{"action":"config"}'
```

**Diagnóstico:**
```bash
curl -X POST https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/verifactu-dispatcher \
  -H "Content-Type: application/json" \
  -H "apikey: TU_SERVICE_ROLE_KEY" \
  -d '{"action":"diag"}'
```

**Health:**
```bash
curl -X POST https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/verifactu-dispatcher \
  -H "Content-Type: application/json" \
  -H "apikey: TU_SERVICE_ROLE_KEY" \
  -d '{"action":"health"}'
```

## 📊 Interpretación de Resultados

### Respuesta de `diag` (Diagnóstico)
```json
{
  "ok": true,
  "events_ok": true,        // ✅ Puede acceder a verifactu.events
  "events_error": null,
  "events_sample": [...],   // Últimos 3 eventos
  "meta_ok": true,          // ✅ Puede acceder a verifactu.invoice_meta
  "meta_error": null,
  "meta_sample": [...],
  "pending_count": 5,       // 5 eventos esperando procesamiento
  "pending_error": null,
  "mode": "mock",           // Modo actual
  "fallbackEnabled": false,
  "maxAttempts": 7,
  "backoffMinutes": [0,1,5,15,60,180,720]
}
```

### ❌ Si `events_ok: false` o `meta_ok: false`
- **Causa**: Permisos insuficientes en el esquema verifactu
- **Solución**: Ejecutar `fix-verifactu-permissions.sql` con privilegios de superusuario
- **Cómo**: 
  1. Ir a Supabase Dashboard > SQL Editor
  2. Pegar contenido de `fix-verifactu-permissions.sql`
  3. Ejecutar (Run)
  4. Re-ejecutar test `diag`

### ⚠️ Si `pending_count: 0`
- **Significa**: No hay eventos pendientes (puede ser normal o indicar que no se están creando)
- **Verificar**: 
  1. ¿Hay facturas en `public.invoices`?
  2. ¿Se está creando metadata en `verifactu.invoice_meta`?
  3. Revisar triggers que crean eventos

### ✅ Si `pending_count > 0` pero no se procesan
- **Causa**: El dispatcher no está ejecutándose (cron desactivado o no desplegado)
- **Solución**: 
  1. Desplegar edge function: `supabase functions deploy verifactu-dispatcher`
  2. Configurar cron en Dashboard (cada 2-5 minutos recomendado)
  3. Verificar logs: `supabase functions logs verifactu-dispatcher`

## 🔧 Soluciones Rápidas

### Problema: "relation 'verifactu.events' does not exist"
```sql
-- Verificar si el esquema existe
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'verifactu';

-- Si no existe, crearlo (requiere migración completa)
-- Ver migraciones en supabase/migrations/
```

### Problema: "permission denied for schema verifactu"
```sql
-- Ejecutar fix-verifactu-permissions.sql como postgres
GRANT USAGE ON SCHEMA verifactu TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA verifactu TO service_role;
```

### Problema: Dispatcher responde pero no procesa eventos
1. Verificar que la Edge Function esté desplegada:
   ```bash
   supabase functions list
   ```

2. Ver logs en tiempo real:
   ```bash
   supabase functions logs verifactu-dispatcher --follow
   ```

3. Invocar manualmente (sin action) para forzar procesamiento:
   ```bash
   curl -X POST https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/verifactu-dispatcher \
     -H "apikey: TU_SERVICE_ROLE_KEY"
   ```

## 🚀 Desplegar Cambios

Si has modificado el código del dispatcher:

```bash
# Desplegar función actualizada
supabase functions deploy verifactu-dispatcher --no-verify-jwt

# Ver logs para confirmar
supabase functions logs verifactu-dispatcher
```

## 📝 Variables de Entorno

Configurar en Supabase Dashboard > Edge Functions > verifactu-dispatcher > Settings:

```bash
VERIFACTU_MODE=mock                        # mock | live
VERIFACTU_ENABLE_FALLBACK=false            # true | false
VERIFACTU_MAX_ATTEMPTS=7                   # número de intentos
VERIFACTU_BACKOFF=0,1,5,15,60,180,720     # minutos entre reintentos
VERIFACTU_REJECT_RATE=0                    # 0-1 (para mock, % de rechazos simulados)
ALLOW_ALL_ORIGINS=false                    # CORS
ALLOWED_ORIGINS=https://tu-dominio.com     # CORS
```

## ✅ Checklist de Verificación

- [ ] Script SQL de permisos ejecutado sin errores
- [ ] `events_ok: true` en endpoint de diagnóstico
- [ ] `meta_ok: true` en endpoint de diagnóstico
- [ ] Edge Function desplegada (`supabase functions list`)
- [ ] Variables de entorno configuradas
- [ ] Cron configurado (opcional, recomendado para producción)
- [ ] Logs muestran procesamiento sin errores
- [ ] Al menos 1 evento pendiente procesado correctamente

## 🆘 Obtener Ayuda

Si después de ejecutar los diagnósticos sigues teniendo problemas:

1. Captura la salida completa de `run-verifactu-diagnostics.sh`
2. Captura los logs: `supabase functions logs verifactu-dispatcher --limit 50`
3. Ejecuta manualmente: `supabase db execute -f check-verifactu-tables.sql`
4. Comparte todos los outputs para análisis detallado
