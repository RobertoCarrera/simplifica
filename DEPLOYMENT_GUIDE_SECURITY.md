# 🚀 Guía de Deployment - Security Features

**Objetivo:** Desplegar las 3 funcionalidades de seguridad a producción

**Tiempo estimado:** 15-20 minutos

---

## ✅ Pre-requisitos

Antes de empezar, verifica que tienes:

- [ ] Supabase CLI instalado (`npm install -g supabase`)
- [ ] Cuenta en Supabase con proyecto activo
- [ ] Credenciales de acceso (login completado)
- [ ] Angular build exitoso (sin errores TypeScript)

```bash
# Verificar instalación
supabase --version  # Debe mostrar versión

# Login (si no lo has hecho)
supabase login
```

---

## 📋 Paso 1: Link al Proyecto Supabase

```bash
# En la raíz del proyecto
cd /f/simplifica

# Link al proyecto (reemplaza con tu PROJECT_REF)
supabase link --project-ref YOUR_PROJECT_REF

# Ejemplo:
# supabase link --project-ref xyzabc123456
```

**Cómo obtener PROJECT_REF:**
1. Ve a https://app.supabase.com/project/_/settings/general
2. Copia el "Reference ID"

---

## 📤 Paso 2: Deploy Edge Functions

### 2.1 Deploy get-csrf-token

```bash
supabase functions deploy get-csrf-token

# Output esperado:
# Deploying get-csrf-token (project ref: xxx)
# Bundled get-csrf-token size: 3.4 kB
# Deployed get-csrf-token (project ref: xxx)
```

**Verificar:**
```bash
curl https://YOUR_PROJECT.supabase.co/functions/v1/get-csrf-token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Debe retornar:
# {
#   "csrfToken": "eyJ1c2VySWQ6MTIzNDU2Nzg5...",
#   "expiresIn": 3600000
# }
```

### 2.2 Deploy upsert-client

```bash
supabase functions deploy upsert-client

# Output esperado:
# Deploying upsert-client (project ref: xxx)
# Bundled upsert-client size: 4.1 kB
# Deployed upsert-client (project ref: xxx)
```

**Verificar:**
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/upsert-client \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","name":"Test","apellidos":"User"}'

# Debe retornar cliente creado/actualizado
```

### 2.3 Deploy normalize-clients

```bash
supabase functions deploy normalize-clients

# Output esperado:
# Deploying normalize-clients (project ref: xxx)
# Bundled normalize-clients size: 4.2 kB
# Deployed normalize-clients (project ref: xxx)
```

**Verificar todas las funciones:**
```bash
supabase functions list

# Debe mostrar:
# ┌─────────────────────┬─────────┬─────────────────────────┐
# │ NAME                │ VERSION │ STATUS                  │
# ├─────────────────────┼─────────┼─────────────────────────┤
# │ get-csrf-token      │ 1       │ deployed                │
# │ upsert-client       │ 2       │ deployed                │
# │ normalize-clients   │ 3       │ deployed                │
# └─────────────────────┴─────────┴─────────────────────────┘
```

---

## 🔐 Paso 3: Configurar Secrets (Opcional)

```bash
# Si quieres usar un CSRF_SECRET personalizado (recomendado)
supabase secrets set CSRF_SECRET=$(openssl rand -base64 32)

# Verificar
supabase secrets list

# Debe mostrar:
# ┌─────────────┬─────────────────┐
# │ NAME        │ DIGEST          │
# ├─────────────┼─────────────────┤
# │ CSRF_SECRET │ sha256:abc123...│
# └─────────────┴─────────────────┘
```

**Nota:** Si no configuras `CSRF_SECRET`, se usará automáticamente `SUPABASE_SERVICE_ROLE_KEY` como fallback.

---

## 🌐 Paso 4: Deploy Frontend (Angular)

### 4.1 Build Production

```bash
npm run build -- --configuration=production

# Verificar que compile sin errores
# Output esperado:
# ✔ Building...
# Application bundle generation complete. [10.956 seconds]
```

### 4.2 Deploy a Vercel/Netlify

**Opción A: Vercel**
```bash
# Instalar Vercel CLI (si no lo tienes)
npm install -g vercel

# Deploy
vercel --prod

# Seguir instrucciones en pantalla
```

**Opción B: Netlify**
```bash
# Instalar Netlify CLI (si no lo tienes)
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist/simplifica

# Seguir instrucciones en pantalla
```

**Opción C: Manual**
1. Sube la carpeta `dist/simplifica/` a tu hosting
2. Configura el servidor para servir `index.html` en todas las rutas

---

## 🧪 Paso 5: Testing End-to-End

### 5.1 Test Automatizado

```bash
# Usar el script de testing
chmod +x test-csrf.sh

# Ejecutar (reemplaza con tus valores)
SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
JWT_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
./test-csrf.sh

# Expected output:
# ========================================
#   CSRF Protection Testing Suite
# ========================================
# Test 1: Fetch CSRF Token
# ✅ CSRF token fetched successfully
# ...
```

### 5.2 Test Manual en Navegador

1. **Abre la aplicación desplegada**
   ```
   https://your-app.vercel.app
   ```

2. **Abre DevTools → Network tab**

3. **Realiza acción que requiera CSRF (ej: crear cliente)**
   - Ve a "Gestión de Clientes"
   - Click en "Nuevo Cliente"
   - Llena formulario y envía

4. **Verifica en Network:**
   - Request a `/get-csrf-token` (GET) → Debe retornar token
   - Request a `/upsert-client` (POST) → Debe tener header `X-CSRF-Token`

**Expected headers:**
```
Request Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  X-CSRF-Token: eyJ1c2VySWQ6MTIzNDU2Nzg5MDEyMzQ1Njc4OTAiLCJ0aW1lc3RhbXAi...
  Content-Type: application/json
```

### 5.3 Test Rate Limiting

```bash
# Envía 105 requests rápidas (debe recibir 429 en #101)
for i in {1..105}; do
  echo "Request #$i"
  curl -X GET https://YOUR_PROJECT.supabase.co/functions/v1/get-csrf-token \
    -H "Authorization: Bearer YOUR_JWT" \
    -i | grep -E "HTTP|X-RateLimit"
done

# Expected:
# Request #100: HTTP/2 200
# Request #101: HTTP/2 429
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 0
```

### 5.4 Test Honeypot

1. Abre formulario de cliente
2. Abre DevTools Console
3. Ejecuta:
   ```javascript
   // Llena el campo honeypot (debería rechazar)
   document.querySelector('[data-honeypot]').value = 'bot@bot.com';
   
   // Intenta enviar (debería ser rechazado silenciosamente)
   ```

---

## 📊 Paso 6: Monitoring

### 6.1 Ver Logs de Edge Functions

```bash
# Logs en tiempo real de get-csrf-token
supabase functions logs get-csrf-token --follow

# Logs de upsert-client
supabase functions logs upsert-client --follow

# Logs de normalize-clients
supabase functions logs normalize-clients --follow
```

### 6.2 Métricas en Supabase Dashboard

1. Ve a https://app.supabase.com/project/YOUR_PROJECT/functions
2. Click en cada función para ver:
   - Invocaciones por hora
   - Errores
   - Latencia
   - Logs detallados

### 6.3 Alertas (Opcional)

Configura alertas para:
- Alto % de responses 429 (rate limit hit)
- Alto % de responses 403 (CSRF failures)
- Errores 5xx
- Latencia > 1s

---

## 🔧 Troubleshooting

### Error: "Module not found .../_shared/..."

**Causa:** Código no está inlined (imports relativos no funcionan)

**Solución:** Las Edge Functions ya tienen el código inlined, no uses `_shared/`

### Error: "CSRF token missing or invalid"

**Causa:** Backend no valida tokens aún

**Solución:** Implementar `validateCsrfToken()` en Edge Functions:

```typescript
// En upsert-client/index.ts
const csrfToken = req.headers.get('X-CSRF-Token');
if (!csrfToken) {
  return new Response(
    JSON.stringify({ error: 'CSRF token missing' }),
    { status: 403 }
  );
}

const userId = 'EXTRACT_FROM_JWT';  // Implementar
const isValid = await validateCsrfToken(csrfToken, userId);
if (!isValid) {
  return new Response(
    JSON.stringify({ error: 'Invalid CSRF token' }),
    { status: 403 }
  );
}
```

### Error: "Rate limit not working"

**Causa:** Función no desplegada o código no actualizado

**Solución:**
```bash
# Re-deploy función
supabase functions deploy FUNCTION_NAME --no-verify-jwt

# Verificar logs
supabase functions logs FUNCTION_NAME
```

### Error de CORS en Frontend

**Causa:** Frontend en dominio diferente al Edge Function

**Solución:** Añadir CORS headers en Edge Functions:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-csrf-token'
};

// En response
return new Response(JSON.stringify(data), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  status: 200
});
```

---

## ✅ Checklist Final

Una vez completados todos los pasos, verifica:

- [ ] Edge Functions desplegadas (3/3)
  - [ ] get-csrf-token
  - [ ] upsert-client
  - [ ] normalize-clients

- [ ] Secrets configurados
  - [ ] CSRF_SECRET (opcional)

- [ ] Frontend desplegado
  - [ ] Build production exitoso
  - [ ] Desplegado en hosting
  - [ ] URL accesible

- [ ] Testing completado
  - [ ] CSRF token se obtiene automáticamente
  - [ ] Header X-CSRF-Token presente en requests
  - [ ] Rate limiting funciona (429 después de 100 req)
  - [ ] Honeypot detecta bots

- [ ] Monitoring configurado
  - [ ] Logs accesibles
  - [ ] Dashboard funcional
  - [ ] Alertas configuradas (opcional)

---

## 🎉 ¡Deployment Completado!

**Estado:** ✅ Aplicación segura en producción

**Próximos pasos:**
1. Monitor logs durante las primeras 24h
2. Ajustar rate limits si es necesario
3. Implementar CSRF validation en backend
4. Añadir honeypot a otros formularios

**Documentación adicional:**
- `SECURITY_FEATURES_IMPLEMENTATION.md` - Overview completo
- `CSRF_INTERCEPTOR_IMPLEMENTATION.md` - Detalles del interceptor
- `FINAL_SECURITY_SUMMARY.md` - Resumen ejecutivo

---

**¿Problemas?** Revisa los logs con:
```bash
supabase functions logs FUNCTION_NAME --follow
```

**¿Preguntas?** Consulta la documentación completa en los archivos MD.
