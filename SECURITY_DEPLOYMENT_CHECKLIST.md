# ✅ Security Deployment Checklist

**Fecha:** 2025-10-07  
**Objetivo:** Desplegar las 4 capas de seguridad en producción

---

## 🚨 Pre-requisitos OBLIGATORIOS

- [ ] **Backup de base de datos** creado
- [ ] **Supabase CLI** instalado y configurado
- [ ] **Node.js build** sin errores (verificado)
- [ ] **Credenciales Supabase** (PROJECT_REF, API keys)

---

## 📋 Checklist de Deployment (Orden Recomendado)

### 1️⃣ **Database Security (RLS) - PRIMERO Y MÁS CRÍTICO**

**Tiempo estimado:** 5-10 minutos  
**Impacto:** 🚨 CRÍTICO - Protege 30+ tablas vulnerables

- [ ] **Crear backup manual** en Supabase Dashboard
  - Settings → Database → Backups → Create Manual Backup
  
- [ ] **Abrir SQL Editor** en Supabase
  - https://app.supabase.com/project/YOUR_PROJECT/sql
  
- [ ] **Copiar contenido** de `database/ENABLE_RLS_ALL_TABLES.sql`
  
- [ ] **Ejecutar script** (Run o F5)
  
- [ ] **Verificar output**:
  - ✅ Tabla 1: Todas las tablas con RLS habilitado
  - ✅ Tabla 2: Lista vacía de tablas sin RLS
  - ✅ Tabla 3: +60 políticas creadas
  
- [ ] **Verificar en Dashboard**: Ir a Database → Tables
  - Debe mostrar **0 tablas "Unrestricted"**
  
- [ ] **Test multi-tenant**:
  ```sql
  -- Ejecutar como usuario de Empresa A
  SELECT COUNT(*) FROM service_tags;
  -- Debe retornar SOLO tags de empresa A
  ```

**Documentación:** `RLS_COMPLETE_HARDENING_GUIDE.md`

---

### 2️⃣ **Edge Functions (Rate Limit + CSRF)**

**Tiempo estimado:** 10-15 minutos  
**Impacto:** 🔒 Alto - Protege endpoints de API

- [ ] **Link proyecto** Supabase
  ```bash
  cd /f/simplifica
  supabase link --project-ref YOUR_PROJECT_REF
  ```

- [ ] **Deploy get-csrf-token**
  ```bash
  supabase functions deploy get-csrf-token
  ```
  
- [ ] **Verificar deployment**:
  ```bash
  curl https://YOUR_PROJECT.supabase.co/functions/v1/get-csrf-token \
    -H "Authorization: Bearer YOUR_JWT_TOKEN"
  # Debe retornar: {"csrfToken": "...", "expiresIn": 3600000}
  ```

- [ ] **Deploy upsert-client**
  ```bash
  supabase functions deploy upsert-client
  ```

- [ ] **Deploy normalize-clients**
  ```bash
  supabase functions deploy normalize-clients
  ```

- [ ] **Verificar todas las funciones**:
  ```bash
  supabase functions list
  # Debe mostrar: get-csrf-token, upsert-client, normalize-clients (status: deployed)
  ```

- [ ] **Test rate limiting**:
  ```bash
  # Enviar 105 requests (debe recibir 429 en request #101)
  for i in {1..105}; do
    curl -X GET https://YOUR_PROJECT.supabase.co/functions/v1/get-csrf-token \
      -H "Authorization: Bearer YOUR_JWT" -i | grep -E "HTTP|X-RateLimit"
  done
  ```

**Documentación:** `DEPLOYMENT_GUIDE_SECURITY.md`

---

### 3️⃣ **Frontend Angular (CSRF Interceptor + Honeypot)**

**Tiempo estimado:** 5-10 minutos  
**Impacto:** 🛡️ Medio - Protección client-side

- [ ] **Build production**
  ```bash
  cd /f/simplifica
  npm run build -- --configuration=production
  ```
  
- [ ] **Verificar build exitoso**
  - Sin errores TypeScript
  - Bundle: ~1.90 MB
  
- [ ] **Deploy a hosting** (Vercel/Netlify/etc)
  ```bash
  # Vercel
  vercel --prod
  
  # O Netlify
  netlify deploy --prod --dir=dist/simplifica
  ```

- [ ] **Test CSRF interceptor** en navegador:
  - Abrir app desplegada
  - DevTools → Network
  - Crear cliente (POST request)
  - Verificar header `X-CSRF-Token` presente

- [ ] **Test honeypot**:
  - Abrir formulario cliente
  - DevTools Console:
    ```javascript
    document.querySelector('[data-honeypot]').value = 'bot@bot.com';
    // Intentar enviar → debe ser rechazado
    ```

**Documentación:** `CSRF_INTERCEPTOR_IMPLEMENTATION.md`

---

### 4️⃣ **Secrets Configuration (Opcional pero Recomendado)**

**Tiempo estimado:** 2 minutos  
**Impacto:** 🔐 Medio - Mejora seguridad CSRF

- [ ] **Configurar CSRF_SECRET**
  ```bash
  supabase secrets set CSRF_SECRET=$(openssl rand -base64 32)
  ```

- [ ] **Verificar secret**
  ```bash
  supabase secrets list
  # Debe mostrar: CSRF_SECRET (con digest)
  ```

---

## 🧪 Testing Completo (Post-Deployment)

### Test 1: RLS Multi-Tenant Isolation

```sql
-- Como usuario de Empresa A
SELECT COUNT(*) FROM clients;  -- Solo clientes de A
SELECT COUNT(*) FROM service_tags;  -- Solo tags de A
SELECT COUNT(*) FROM gdpr_consent_records;  -- Solo GDPR de A

-- Intentar acceder a Empresa B (debe fallar)
SELECT COUNT(*) FROM clients WHERE company_id = 'EMPRESA_B_UUID';  -- 0 results
```

- [ ] Verificado ✅

### Test 2: Rate Limiting

```bash
# 101+ requests deben retornar 429
for i in {1..105}; do
  echo "Request #$i"
  curl -X GET https://YOUR_PROJECT.supabase.co/functions/v1/get-csrf-token \
    -H "Authorization: Bearer YOUR_JWT" -i | grep "HTTP"
done
```

- [ ] Request #101 retorna `429 Too Many Requests` ✅

### Test 3: CSRF Protection

```bash
# 1. Obtener token
TOKEN=$(curl -s https://YOUR_PROJECT.supabase.co/functions/v1/get-csrf-token \
  -H "Authorization: Bearer YOUR_JWT" | jq -r '.csrfToken')

# 2. Usar token en request
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/upsert-client \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "X-CSRF-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","name":"Test","apellidos":"User"}'
```

- [ ] Request exitosa con token válido ✅

### Test 4: Honeypot Detection

- [ ] Llenar campo honeypot → Request rechazada ✅
- [ ] Submit < 2 segundos → Request rechazada ✅

---

## 📊 Verificación Final

### Dashboard Supabase

- [ ] **Database → Tables**: 0 tablas "Unrestricted"
- [ ] **Edge Functions**: 3 funciones deployed
- [ ] **Logs**: Sin errores críticos

### Métricas de Seguridad

| Feature | Estado | Verificado |
|---------|--------|------------|
| RLS habilitado | ✅ 30+ tablas | [ ] |
| Rate Limiting | ✅ 100 req/min | [ ] |
| CSRF Protection | ✅ Tokens HMAC | [ ] |
| Honeypot Fields | ✅ Bot detection | [ ] |
| Multi-tenancy | ✅ Aislamiento OK | [ ] |

---

## 🚨 Troubleshooting

### Error: "Row-level security policy violation"

**Solución:**
```sql
-- Verificar que el usuario tiene company_id
SELECT company_id FROM users WHERE auth_user_id = auth.uid();

-- Si es NULL, asignar company_id
UPDATE users SET company_id = 'VALID_UUID' WHERE auth_user_id = auth.uid();
```

### Error: "Module not found .../_shared/..."

**Solución:** Ya está corregido (código inlined). Re-deploy función:
```bash
supabase functions deploy FUNCTION_NAME
```

### Error: "CSRF token missing or invalid"

**Solución:** Verificar que get-csrf-token está desplegado:
```bash
supabase functions logs get-csrf-token
```

---

## ✅ Deployment Completo

Una vez completado TODO el checklist:

- [ ] **RLS**: 30+ tablas protegidas
- [ ] **Edge Functions**: 3 funciones deployed
- [ ] **Frontend**: Desplegado con interceptor
- [ ] **Testing**: Todos los tests pasados
- [ ] **Monitoring**: Logs sin errores
- [ ] **Documentación**: Revisada

---

## 📚 Documentación de Referencia

- **RLS Guide:** `RLS_COMPLETE_HARDENING_GUIDE.md`
- **CSRF Interceptor:** `CSRF_INTERCEPTOR_IMPLEMENTATION.md`
- **Security Features:** `SECURITY_FEATURES_IMPLEMENTATION.md`
- **Final Summary:** `FINAL_SECURITY_SUMMARY.md`
- **Deployment Guide:** `DEPLOYMENT_GUIDE_SECURITY.md`

---

**Status:** 🎯 **LISTO PARA PRODUCCIÓN**

**Próximo paso:** Ejecutar checklist en orden (1 → 2 → 3 → 4)

**Tiempo total estimado:** 30-45 minutos

**Impacto:** 🚨 **CRÍTICO** - Protege toda la aplicación
