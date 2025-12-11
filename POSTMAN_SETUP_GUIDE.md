# Guía para Probar VeriFactu con Postman

## Error que estabas teniendo
El error `getaddrinfo ENOTFOUND xkybniinrhbvdkyrxnac.supabase.co` indica que estabas usando una URL incorrecta.

**URL CORRECTA de tu proyecto:** `https://ufutyjbqfjrlzkprvyvs.supabase.co`

## Pasos para configurar Postman

### 1. Importar la Colección

1. Abre Postman
2. Click en **Import** (arriba a la izquierda)
3. Arrastra el archivo `POSTMAN_VERIFACTU_COLLECTION.json` o haz click en "Upload Files"
4. Confirma la importación

### 2. Configurar Variables

Después de importar, necesitas configurar tu **Supabase Anon Key**:

1. En Postman, ve a la colección "Simplifica - VeriFactu Diagnostics"
2. Click en la pestaña **Variables**
3. Busca la variable `SUPABASE_ANON_KEY`
4. En la columna "CURRENT VALUE", pega tu Anon Key de Supabase

**¿Dónde encuentro mi Anon Key?**
- Ve a tu proyecto Supabase: https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs
- Click en **Settings** → **API**
- Copia el valor de **anon / public key**

### 3. Ejecutar las Pruebas en Orden

#### Prueba 1: Health Check
**Propósito:** Verifica que el edge function está desplegado y responde.

```json
POST https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/verifactu-dispatcher
{
  "action": "health"
}
```

**Respuesta esperada:**
```json
{
  "status": "ok",
  "function": "verifactu-dispatcher",
  "timestamp": "..."
}
```

#### Prueba 2: Debug Environment
**Propósito:** Muestra qué variables de entorno están configuradas.

```json
{
  "action": "debug-env"
}
```

**Respuesta esperada:**
```json
{
  "hasEncryptionKey": true,
  "mode": "live",
  "fallbackEnabled": true
}
```

#### Prueba 3: Diagnostic Info
**Propósito:** Estado general del sistema VeriFactu.

```json
{
  "action": "diag",
  "company_id": "cd830f43-f6f0-4b78-a2a4-505e4e0976b5"
}
```

**Respuesta esperada:**
```json
{
  "mode": "live",
  "fallbackEnabled": true,
  "maxAttempts": 3,
  "backoffMinutes": [5, 15, 60],
  "pendingEvents": 0
}
```

#### Prueba 4: Test Certificate ⭐ **LA MÁS IMPORTANTE**
**Propósito:** Valida el certificado y prueba la conexión con AEAT.

```json
{
  "action": "test-cert",
  "company_id": "cd830f43-f6f0-4b78-a2a4-505e4e0976b5"
}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "checks": {
    "encryptionKey": true,
    "settingsExist": true,
    "certificateDecryption": true,
    "certificateFormat": true,
    "aeatConnection": true
  },
  "message": "All checks passed"
}
```

**Si hay un error, te dirá exactamente qué falla:**
```json
{
  "success": false,
  "checks": {
    "encryptionKey": true,
    "settingsExist": true,
    "certificateDecryption": false,
    "certificateFormat": false,
    "aeatConnection": false
  },
  "error": "Descripción del error específico"
}
```

#### Prueba 5: Get Config
**Propósito:** Ver la configuración de VeriFactu para tu empresa.

```json
{
  "action": "config",
  "company_id": "cd830f43-f6f0-4b78-a2a4-505e4e0976b5"
}
```

## Diagnóstico según Resultados

### Si health falla
- El edge function no está desplegado o la URL es incorrecta
- Verifica que usas: `https://ufutyjbqfjrlzkprvyvs.supabase.co`

### Si debug-env muestra mode: "mock"
- La variable `VERIFACTU_MODE` no está configurada como "live"
- Ve a Supabase Dashboard → Edge Functions → verifactu-dispatcher → Settings
- Verifica que `VERIFACTU_MODE=live`

### Si test-cert falla en certificateDecryption
- La contraseña del certificado (`VERIFACTU_CERT_ENC_KEY`) es incorrecta
- El certificado está corrupto o en formato incorrecto

### Si test-cert falla en aeatConnection
- Los endpoints de AEAT están mal configurados (ya los corregimos)
- El certificado no es válido para el entorno PRE de AEAT
- Problemas de red/firewall

### Si ves "simulation": true en respuestas
- El edge function necesita ser redesplegado con el código actualizado
- Ve a Supabase Dashboard → Edge Functions → verifactu-dispatcher
- Click en "Deploy" para actualizar con los últimos cambios

## URLs Importantes

- **Proyecto Supabase:** https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs
- **Edge Functions:** https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/functions
- **Edge Function URL:** https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/verifactu-dispatcher

## Próximos Pasos

1. ✅ Importar colección en Postman
2. ✅ Configurar SUPABASE_ANON_KEY
3. ▶️ Ejecutar "1. Health Check"
4. ▶️ Ejecutar "2. Debug Environment"
5. ▶️ Ejecutar "4. Test Certificate" (la más importante)
6. 📊 Compartir los resultados

Con estos resultados podré ver exactamente qué está fallando y cómo solucionarlo.
