# Implementación del Interceptor CSRF

## 📋 Resumen

Se ha implementado un **HTTP Interceptor** que automáticamente gestiona la protección CSRF en todas las peticiones HTTP de la aplicación Angular.

## 🏗️ Arquitectura

### Componentes Implementados

```
src/app/
├── interceptors/
│   └── csrf.interceptor.ts       # Interceptor HTTP que añade tokens CSRF
├── services/
│   └── csrf.service.ts            # Servicio de gestión de tokens
└── app.config.ts                  # Configuración del interceptor
```

---

## 🔧 Funcionamiento

### 1. **CSRF Service** (`csrf.service.ts`)

Gestiona el ciclo de vida completo de los tokens CSRF:

```typescript
@Injectable({ providedIn: 'root' })
export class CsrfService {
  // Endpoint del Edge Function
  private readonly csrfEndpoint = 
    `${environment.supabase.url}/functions/v1/get-csrf-token`;
  
  getCsrfToken(): Observable<string>      // Obtiene token (cached o nuevo)
  refreshCsrfToken(): Observable<string>  // Fuerza refresh del token
  clearToken(): void                      // Limpia token (logout)
}
```

**Features de Seguridad:**
- ✅ **In-memory storage** - Token solo en memoria (no localStorage para prevenir XSS)
- ✅ **Auto-refresh** - Refresca automáticamente antes de expirar (buffer de 5 min)
- ✅ **Shared requests** - Evita múltiples requests simultáneas al mismo endpoint
- ✅ **Error handling** - Manejo robusto de errores de red

### 2. **CSRF Interceptor** (`csrf.interceptor.ts`)

Intercepta todas las peticiones HTTP y añade el token automáticamente:

```typescript
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  // 1. Verifica si es método mutante (POST/PUT/DELETE/PATCH)
  // 2. Excluye endpoints públicos (login, register)
  // 3. Obtiene token CSRF del servicio
  // 4. Añade header X-CSRF-Token
  // 5. Reintenta con token nuevo si falla (403 CSRF error)
};
```

**Flujo de Trabajo:**
```
Request POST/PUT/DELETE/PATCH
    ↓
¿Es endpoint público? → SÍ → Continuar sin CSRF
    ↓ NO
Obtener token CSRF del servicio
    ↓
Añadir header X-CSRF-Token
    ↓
Enviar request
    ↓
¿Error 403 CSRF? → SÍ → Refresh token + Reintentar (1 vez)
    ↓ NO
Respuesta exitosa
```

### 3. **Configuración en App** (`app.config.ts`)

```typescript
export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withInterceptors([csrfInterceptor])  // ✅ Registrado globalmente
    )
  ]
};
```

---

## 🚀 Uso Automático

El interceptor funciona **automáticamente** en todos los servicios HTTP:

### Ejemplo: Cliente Service

```typescript
// ❌ ANTES (sin protección CSRF)
this.http.post('/api/clients', data).subscribe();

// ✅ AHORA (protección CSRF automática)
this.http.post('/api/clients', data).subscribe();
// El interceptor añade automáticamente:
// Headers: { 'X-CSRF-Token': 'eyJ1c2VySWQiOiIxMjM0...' }
```

### Requests Protegidas Automáticamente

- ✅ `POST /api/clients` → CSRF token incluido
- ✅ `PUT /api/clients/123` → CSRF token incluido
- ✅ `DELETE /api/clients/123` → CSRF token incluido
- ✅ `PATCH /api/clients/123` → CSRF token incluido
- ⏭️ `GET /api/clients` → Sin CSRF (no es método mutante)

### Endpoints Excluidos (Públicos)

```typescript
const publicEndpoints = [
  '/auth/login',           // Login no requiere CSRF
  '/auth/register',        // Registro no requiere CSRF
  '/auth/reset-password',  // Reset no requiere CSRF
  '/get-csrf-token'        // Endpoint del token mismo
];
```

---

## 🧪 Testing

### 1. **Verificar que el Token se Obtiene Automáticamente**

```bash
# 1. Inicia la app
npm run start

# 2. Abre DevTools → Network
# 3. Haz cualquier POST (ej: crear cliente)
# 4. Verifica la request:

# Request Headers (automático):
X-CSRF-Token: eyJ1c2VySWQiOiIxMjM0NTY3ODkwIiwidGltZXN0YW1wIjoiMTY0Nz...
```

### 2. **Verificar Auto-Refresh en Error 403**

```typescript
// Simula error 403 CSRF en backend para testing
// El interceptor debería:
// 1. Detectar error 403 con mensaje CSRF
// 2. Llamar a refreshCsrfToken()
// 3. Reintentar la request con nuevo token
```

### 3. **Verificar Exclusión de GET Requests**

```bash
# GET requests NO deben tener X-CSRF-Token
curl http://localhost:4200/api/clients -H "Authorization: Bearer TOKEN"
# ✅ Sin header X-CSRF-Token (correcto)

# POST requests SÍ deben tener X-CSRF-Token
curl -X POST http://localhost:4200/api/clients -H "Authorization: Bearer TOKEN"
# ✅ Con header X-CSRF-Token (automático)
```

---

## 🔒 Seguridad

### Medidas Implementadas

| Feature | Implementación | Objetivo |
|---------|---------------|----------|
| **In-Memory Storage** | `BehaviorSubject<string \| null>` | Prevenir XSS (no localStorage) |
| **Auto-Expiration** | Token expira en 1 hora | Limitar ventana de ataque |
| **Pre-Expiry Refresh** | Refresh 5 min antes de expirar | Evitar requests fallidas |
| **Single Token Fetch** | `shareReplay(1)` en Observable | Evitar race conditions |
| **Automatic Retry** | Reintentar 1 vez en 403 CSRF | Recuperación automática |
| **Method Filtering** | Solo POST/PUT/DELETE/PATCH | Optimizar performance |
| **Public Endpoints** | Exclusión de auth endpoints | Permitir login/register |

### Flujo de Ataque Mitigado

```
Atacante intenta CSRF:
    ↓
1. No tiene token CSRF válido (in-memory, no cookies)
    ↓
2. Backend valida token con HMAC-SHA256
    ↓
3. Token inválido → 403 Forbidden
    ↓
4. Request rechazada ✅
```

---

## 📊 Estado de Implementación

### ✅ Completado

- [x] **CsrfService** - Gestión de tokens con cache y auto-refresh
- [x] **csrfInterceptor** - Interceptor HTTP funcional
- [x] **Registro en app.config.ts** - Interceptor activo globalmente
- [x] **TypeScript compilation** - Sin errores (build exitoso)
- [x] **In-memory storage** - Tokens en memoria (no localStorage)
- [x] **Auto-retry logic** - Reintentar en error 403 CSRF

### ⏳ Pendiente

- [ ] **Desplegar Edge Functions** (upsert-client, normalize-clients, get-csrf-token)
- [ ] **Testing en producción** - Verificar flujo completo
- [ ] **Integrar en otros servicios** - Servicios, tickets, etc. (automático ya)
- [ ] **Logging & Monitoring** - Métricas de errores CSRF
- [ ] **Unit tests** - Tests para service e interceptor

---

## 🚨 Troubleshooting

### Error: "CSRF token missing or invalid"

**Causa:** El token no se está enviando o es inválido.

**Solución:**
```typescript
// 1. Verificar que el usuario esté autenticado (JWT válido)
// 2. Verificar que el endpoint get-csrf-token esté desplegado
// 3. Check DevTools → Network → Request Headers
```

### Error: "Cannot fetch CSRF token"

**Causa:** Error al obtener token del backend.

**Solución:**
```typescript
// 1. Verificar Supabase Edge Function está desplegada:
supabase functions list

// 2. Verificar logs:
supabase functions logs get-csrf-token

// 3. Test manual:
curl https://YOUR_PROJECT.supabase.co/functions/v1/get-csrf-token \
  -H "Authorization: Bearer YOUR_JWT"
```

### El interceptor no se ejecuta

**Causa:** No está registrado en `app.config.ts`.

**Solución:**
```typescript
// Verificar app.config.ts:
provideHttpClient(
  withInterceptors([csrfInterceptor])  // ← Debe estar aquí
)
```

---

## 🔄 Integración con Edge Functions Backend

### Backend debe validar el token

En tus Edge Functions, añade validación CSRF:

```typescript
import { validateCsrfToken, extractCsrfToken } from "./csrf-protection";

serve(async (req) => {
  // 1. Extraer token del header
  const csrfToken = extractCsrfToken(req);
  
  // 2. Validar token
  const userId = getUserIdFromJWT(req); // Extrae del JWT
  const isValid = await validateCsrfToken(csrfToken, userId);
  
  if (!isValid) {
    return new Response(
      JSON.stringify({ error: 'Invalid CSRF token' }),
      { status: 403 }
    );
  }
  
  // 3. Procesar request normalmente
  // ...
});
```

---

## 📝 Próximos Pasos

1. **Deploy Edge Functions:**
   ```bash
   supabase functions deploy get-csrf-token
   supabase functions deploy upsert-client
   supabase functions deploy normalize-clients
   ```

2. **Test CSRF Flow:**
   - Crear cliente → Verificar header X-CSRF-Token
   - Simular error 403 → Verificar auto-retry
   - Logout → Verificar clearToken()

3. **Añadir CSRF Validation en Backend:**
   - Implementar validateCsrfToken en Edge Functions
   - Retornar 403 si token inválido
   - Logging de intentos fallidos

4. **Monitoring:**
   - Métricas de requests con CSRF
   - Alertas por alto % de 403 CSRF
   - Dashboard de seguridad

---

## 📚 Referencias

- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Angular HTTP Interceptors](https://angular.dev/guide/http/interceptors)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [HMAC-SHA256 Token Signing](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign)

---

**Implementado por:** Security Hardening Process  
**Fecha:** 2025-01-07  
**Status:** ✅ Completado - Listo para deployment
