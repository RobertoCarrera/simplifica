# ✅ VeriFactu - Checklist para Producción

> **Estado actual**: Sistema funcional en modo mock (simulación AEAT)  
> **Fecha**: 25 de Noviembre 2025  
> **Progreso**: ██░░░░░░░░ 20%

---

## 📋 RESUMEN EJECUTIVO

El sistema VeriFactu está **listo para producción en modo mock**. La integración real con AEAT no está implementada porque:
1. AEAT aún no ha publicado el endpoint de producción definitivo
2. El sistema de firma PKCS#7 requiere certificados oficiales de la FNMT

**Recomendación**: Desplegar en producción con modo mock activo. Cuando AEAT publique las especificaciones finales, se implementará la conexión real.

---

## 🗂️ CHECKLIST POR CATEGORÍA

### 1. BASE DE DATOS - Migraciones Pendientes

| # | Tarea | Estado | Prioridad | Archivo |
|---|-------|--------|-----------|---------|
| 1.1 | Añadir NIF a companies | ⏳ Pendiente | 🔴 Alta | `20251125_add_nif_to_companies.sql` |
| 1.2 | Crear tabla verifactu_settings | ⏳ Pendiente | 🔴 Alta | `20251125_verifactu_settings_complete.sql` |
| 1.3 | RLS incluido en migración | ✅ Incluido | - | - |
| 1.4 | Columnas encriptadas incluidas | ✅ Incluido | - | - |

### 2. EDGE FUNCTIONS - Despliegue

| # | Tarea | Estado | Prioridad |
|---|-------|--------|-----------|
| 2.1 | Deploy `invoices-pdf` (QR con URL AEAT) | ⏳ Pendiente | 🔴 Alta |
| 2.2 | Deploy `verifactu-dispatcher` | ⏳ Pendiente | 🔴 Alta |
| 2.3 | Deploy `upload-verifactu-cert` | ⏳ Pendiente | 🟡 Media |
| 2.4 | Deploy `verifactu-cert-history` | ⏳ Pendiente | 🟡 Media |
| 2.5 | Configurar variables de entorno en Supabase | ⏳ Pendiente | 🔴 Alta |

### 3. VARIABLES DE ENTORNO - Configuración

| Variable | Descripción | Valor Producción | Requerido |
|----------|-------------|------------------|-----------|
| `VERIFACTU_MODE` | Modo de operación | `mock` | ✅ |
| `VERIFACTU_MAX_ATTEMPTS` | Reintentos máximos | `7` | Opcional |
| `VERIFACTU_BACKOFF` | Backoff en minutos | `0,1,5,15,60,180,720` | Opcional |
| `VERIFACTU_REJECT_RATE` | Tasa de rechazo simulado | `0` | Opcional |
| `VERIFACTU_CERT_ENC_KEY` | Clave AES-256 (base64 32 bytes) | `[GENERAR]` | ✅ |
| `VERIFACTU_ENABLE_FALLBACK` | Fallback a mock si error | `true` | Opcional |
| `ALLOWED_ORIGINS` | Orígenes permitidos | `https://simplifica.app` | ✅ |
| `ALLOW_ALL_ORIGINS` | Permitir todos (dev only) | `false` | Opcional |

### 4. FRONTEND - Verificación

| # | Tarea | Estado | Prioridad |
|---|-------|--------|-----------|
| 4.1 | Campo NIF en registro funciona | ⏳ Pendiente | 🔴 Alta |
| 4.2 | Edición NIF en configuración funciona | ⏳ Pendiente | 🔴 Alta |
| 4.3 | Panel VeriFactu Settings funciona | ⏳ Pendiente | 🟡 Media |
| 4.4 | Subida de certificados funciona | ⏳ Pendiente | 🟡 Media |

### 5. SEGURIDAD - Validación

| # | Tarea | Estado | Prioridad |
|---|-------|--------|-----------|
| 5.1 | RLS activo en todas las tablas VeriFactu | ⏳ Pendiente | 🔴 Alta |
| 5.2 | Certificados encriptados con AES-256-GCM | ✅ Implementado | - |
| 5.3 | Clave de encriptación como secret | ⏳ Pendiente | 🔴 Alta |

---

## 🚀 PLAN DE IMPLEMENTACIÓN PASO A PASO

### PASO 1: Migración de Base de Datos (Hoy)

```bash
# Conectar a Supabase y ejecutar migraciones
```

**Archivos a aplicar en orden:**
1. `20251125_add_nif_to_companies.sql` - Añade NIF a companies
2. Nueva migración: `20251125_verifactu_settings_complete.sql`

### PASO 2: Configurar Variables de Entorno

```bash
# En Supabase Dashboard > Edge Functions > Secrets
```

### PASO 3: Desplegar Edge Functions

```bash
# Desde la raíz del proyecto
supabase functions deploy invoices-pdf
supabase functions deploy verifactu-dispatcher
supabase functions deploy upload-verifactu-cert
supabase functions deploy verifactu-cert-history
```

### PASO 4: Verificar Frontend

- Probar registro con NIF
- Probar edición de NIF en configuración
- Probar generación de factura con QR

### PASO 5: Testing en Producción

- Crear factura de prueba
- Verificar QR genera URL correcta
- Verificar hash chain funciona
- Verificar eventos se procesan

---

## 📁 ARCHIVOS CLAVE DEL SISTEMA

```
supabase/
├── migrations/
│   ├── 20251125_add_nif_to_companies.sql          # NIF en companies
│   ├── 20251202000000_verifactu_init.sql          # Schema verifactu
│   ├── 20251202000001_verifactu_public_views.sql  # Vistas públicas
│   ├── 20251202000002_verifactu_step2.sql         # Paso 2
│   ├── 20251202000003_verifactu_finalize_...sql   # Hash canónico
│   ├── 20251202000004_verifactu_dlq.sql           # Dead letter queue
│   └── [NUEVO] 20251125_verifactu_settings.sql    # Settings completo
├── functions/
│   ├── invoices-pdf/                              # Genera PDF con QR AEAT
│   ├── verifactu-dispatcher/                      # Procesa eventos
│   ├── upload-verifactu-cert/                     # Sube certificados
│   └── verifactu-cert-history/                    # Historial certs

src/app/
├── components/
│   ├── register/                                  # Registro con NIF
│   └── configuracion/                             # Config con NIF edit
└── services/
    └── auth.service.ts                            # Manejo de NIF
```

---

## ⚠️ LIMITACIONES ACTUALES

1. **AEAT Live no implementado**: El modo `live` lanza error
2. **Firma PKCS#7 no implementada**: Se simula la firma
3. **XML oficial no implementado**: Se usa JSON internamente

Estas limitaciones son **intencionales** porque AEAT no ha publicado las especificaciones finales de producción.

---

## 🔜 PRÓXIMOS PASOS (Post-Producción)

1. Cuando AEAT publique endpoint → Implementar conexión real
2. Obtener certificado FNMT de producción
3. Implementar firma PKCS#7 real
4. Generar XML según especificación AEAT final

---

**¿Empezamos con el Paso 1?** Voy a crear la migración completa para `verifactu_settings`.
