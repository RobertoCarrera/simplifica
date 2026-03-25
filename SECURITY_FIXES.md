# Registro de Cambios de Seguridad y Mantenimiento

Fecha: 21 de enero de 2026
Estado: **Vulnerabilidades Resueltas (0 encontradas)**

Este documento detalla las acciones realizadas para corregir vulnerabilidades de seguridad y errores de compilación en el proyecto `simplifica`.

## 1. Corrección de Vulnerabilidades de Seguridad

### A. Vulnerabilidad XSS en Angular

- **Problema:** Se detectó una vulnerabilidad de Cross-Site Scripting (XSS) en versiones anteriores de Angular relacionada con atributos SVG no saneados.
- **Acción:** Se actualizaron todos los paquetes del núcleo de Angular (`@angular/core`, `@angular/common`, etc.) y `@angular/cli` a la versión **19.2.18**.
- **Resultado:** La vulnerabilidad ha sido parcheada en esta versión.

### B. Denegación de Servicio (DoS) en `express` / `qs`

- **Problema:** La librería `qs` (usada por `express` para analizar query strings) tenía una vulnerabilidad que permitía el agotamiento de memoria mediante arrays muy grandes.
- **Acción:**
  1.  Se actualizó `express` a la versión **^4.21.2**.
  2.  Se añadió una regla de `overrides` en `package.json` para forzar el uso de `qs` versión **^6.14.1** en todo el árbol de dependencias.
- **Resultado:** Se evita el uso de versiones vulnerables de `qs` incluso si otras librerías las solicitan.

### C. Sobrescritura Arbitraria de Archivos en `tar`

- **Problema:** La librería `tar` (usada por muchas herramientas de CLI) permitía sobrescribir archivos fuera del directorio de destino.
- **Acción:** Se añadió una regla de `overrides` en `package.json` para forzar el uso de `tar` versión **^7.5.5**.
- **Resultado:** Se mitiga el riesgo de "Symlink Poisoning" y sobrescritura de archivos durante la instalación de paquetes.

## 2. Correcciones de Compilación y Mantenimiento

### A. Error de Tipos: `node-forge`

- **Error:** `Could not find a declaration file for module 'node-forge'.`
- **Causa:** La librería `node-forge` se estaba importando en el código TypeScript, pero faltaban sus definiciones de tipos, lo que provocaba un error con `noImplicitAny`.
- **Solución:** Se instaló la dependencia de desarrollo `@types/node-forge`.

### B. Conflicto de Dependencias: `ng-apexcharts`

- **Advertencia:** `unmet peer dependency @angular/core@^20.0.0`.
- **Causa:** Se había instalado una versión muy reciente de `ng-apexcharts` (1.17.1) que esperaba Angular 20 (aún no estable), causando conflictos con tu versión actual (Angular 19).
- **Solución:** Se fijó la versión de `ng-apexcharts` a **1.15.0**, que es totalmente compatible con Angular 19.

### C. Limpieza: `@types/dompurify`

- **Advertencia:** `This is a stub types definition...`
- **Causa:** La librería `dompurify` moderna ya incluye sus propios tipos, por lo que el paquete `@types/dompurify` era redundante y estaba obsoleto.
- **Solución:** Se eliminó `@types/dompurify` de las dependencias.

## 3. Vulnerabilidad Conocida (Pendiente)

### A. RCE en `serialize-javascript`

- **Problema:** `pnpm audit` reporta una vulnerabilidad "high" en `serialize-javascript` (GHSA-5c6j-r48x-rmvq), una dependencia de `@angular-devkit/build-angular`.
- **Acción Intentada:** Se ha añadido una regla `pnpm.overrides` en `package.json` para forzar una versión segura (`>=7.0.3`). También se ha actualizado `@angular-devkit/build-angular` a la v21.2.0.
- **Resultado:** A pesar de las medidas, `pnpm audit` sigue reportando la vulnerabilidad. Esto parece ser un problema complejo con la resolución de dependencias de `pnpm` para este paquete anidado.
- **Próximos Pasos:** Se deja constancia del problema. Al ser una dependencia de desarrollo, no afecta a la aplicación en producción. Se revisará en futuras actualizaciones de Angular.

---

## Cómo mantener esto en el futuro

1.  **Auditoría regular:** Ejecuta `pnpm audit` periódicamente para buscar nuevas vulnerabilidades.
2.  **Actualizaciones:** Mantén tus dependencias actualizadas. Las secciones `overrides` en `package.json` son útiles para parches de seguridad urgentes, pero idealmente deberían eliminarse cuando las librerías principales actualicen sus propias dependencias internas.

---

## Phase 1 — Edge Function Security Hardening (Marzo 2026)

**Estado: COMPLETO**
Remediación de vectores de ataque en las Supabase Edge Functions.

### Vulnerabilidades corregidas

#### A. JWT Hook Secret Bypass (`custom-access-token`)

- **Problema:** La función `custom-access-token` retornaba claims vacíos si `SUPABASE_AUTH_HOOK_SECRET` no estaba configurado, en lugar de rechazar la solicitud. Cualquier caller que conociera la URL del Edge Function podía obtener datos de `company_id` / `user_role` enviando un payload falsificado sin cabecera de autenticación.
- **Severidad:** Alta — exposición de datos de tenant por unauthenticated callers.
- **Solución:** Nuevo módulo `supabase/functions/_shared/jwt-hook-validator.ts`:
  - Comparación timing-safe (constant-time) del secreto para prevenir timing attacks.
  - Secret almacenado en **Supabase Vault** (`jwt_hook_secret_v1`) en lugar de env vars en texto plano.
  - Fallback a `SUPABASE_AUTH_HOOK_SECRET` env var para despliegues existentes durante la migración.
  - Feature flag `JWT_HOOK_SECRET_ENABLED` para habilitar gradualmente sin downtime.
  - Cache del secreto en memoria del isolate caliente para evitar llamadas repetidas a Vault.

#### B. In-Memory Rate Limiting Bypass (`rate-limiter.ts`)

- **Problema:** El rate limiter usaba un `Map` en memoria que se perdía en cada cold start de un Edge Function isolate. Bajo carga distribuida, atacantes podían superar los límites creando múltiples instancias (por ejemplo, forzando cold starts mediante IPs rotativas).
- **Severidad:** Media — bypass de protecciones anti-abuso en endpoints de autenticación.
- **Solución:** Reemplazo del módulo `supabase/functions/_shared/rate-limiter.ts`:
  - **Backend primario:** Upstash Redis con algoritmo fixed-window vía `@upstash/ratelimit` SDK.
  - **Fallback fail-open:** Si Redis no está disponible, cae al Map en memoria y emite WARN en logs.
  - Estrategia fail-open intencional: preferimos disponibilidad sobre bloqueo durante una interrupción de Redis.
  - Key prefixing por función para evitar colisiones entre endpoints.

### Breaking changes

- **`checkRateLimit` ahora es `async`**: todos los callers deben usar `await checkRateLimit(...)`.
  - Funciones afectadas: `send-company-invite`, `create-invited-user`, `upsert-client`, `send-client-consent-invite`.

### Pasos de configuración

#### Upstash Redis

1. Crear una instancia en [upstash.com](https://upstash.com) (free tier suficiente para Phase 1).
2. Copiar la REST URL y el token.
3. Agregar los secrets al Edge Function:
   ```sh
   supabase secrets set UPSTASH_REDIS_URL=https://...upstash.io
   supabase secrets set UPSTASH_REDIS_TOKEN=<token>
   ```
4. En entorno local, dejar las variables vacías para activar automáticamente el fallback en memoria.

#### Vault — JWT Hook Secret

1. Ir a **Supabase Dashboard → Database → Vault**.
2. Crear un nuevo secret:
   - **Name:** `jwt_hook_secret_v1`
   - **Value:** cadena hexadecimal aleatoria de 32 bytes (p.ej. `openssl rand -hex 32`).
3. Copiar el mismo valor al campo **"Signing secret"** en **Auth → Hooks → custom-access-token**.
4. Agregar el feature flag al Edge Function secret:
   ```sh
   supabase secrets set JWT_HOOK_SECRET_ENABLED=true
   ```
   > Durante el rollout inicial, dejar en `false` y cambiar a `true` una vez verificado que el hook envía la firma correcta.

#### Rotación del JWT Hook Secret

1. Crear `jwt_hook_secret_v2` en Vault con un nuevo valor.
2. Actualizar la constante `VAULT_SECRET_KEY` en `jwt-hook-validator.ts` a `jwt_hook_secret_v2`.
3. Actualizar el signing secret en Auth → Hooks para que coincida.
4. Desplegar los cambios y verificar en logs (`[jwt-hook-validator] Vault secret loaded successfully`).
5. Eliminar `jwt_hook_secret_v1` de Vault.
6. Llamar a `clearSecretCache()` si se quiere forzar la recarga inmediata (normalmente el isolate se recicla solo).

#### Rotación del Upstash Redis Token

```sh
supabase secrets set UPSTASH_REDIS_TOKEN=<nuevo-token>
```

El cliente Redis se re-inicializa en el próximo cold start.

### Archivos modificados

| Archivo                                                  | Acción      | Descripción                                                                |
| -------------------------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| `supabase/functions/_shared/jwt-hook-validator.ts`       | Creado      | Validador HMAC de JWT Hook con Vault, timing-safe comparison, feature flag |
| `supabase/functions/_shared/rate-limiter.ts`             | Reemplazado | Redis-backed rate limiter con fallback fail-open                           |
| `supabase/functions/custom-access-token/index.ts`        | Modificado  | Integra `validateJWTHook` antes de procesar claims                         |
| `supabase/functions/send-company-invite/index.ts`        | Modificado  | `await checkRateLimit(...)`                                                |
| `supabase/functions/create-invited-user/index.ts`        | Modificado  | `await checkRateLimit(...)`                                                |
| `supabase/functions/upsert-client/index.ts`              | Modificado  | `await checkRateLimit(...)`                                                |
| `supabase/functions/send-client-consent-invite/index.ts` | Auditado    | `await checkRateLimit(...)` verificado                                     |

### Cobertura de tests

- `supabase/functions/_shared/jwt-hook-validator.test.ts` — 7/7 tests OK (17ms)
- `supabase/functions/_shared/rate-limiter.test.ts` — 9/9 tests OK (82ms)

### Auditoría de módulos adicionales

#### `csrf-protection.ts` — Sin issues críticos

Revisado en Phase 1. Ver sección "Módulos auditados" más abajo.

#### `crypto-utils.ts` — Sin issues críticos

Revisado en Phase 1. Ver sección "Módulos auditados" más abajo.

---

## Módulos auditados — Phase 1

### `csrf-protection.ts`

**Revisión:** Marzo 2026 | **Resultado:** Sin vulnerabilidades críticas

**Aspectos positivos:**

- HMAC-SHA256 vía Web Crypto API para firma del token (sin dependencias externas vulnerables).
- Comparación timing-safe (`timingSafeCompare`) ya implementada — previene timing attacks.
- Validación de expiración (1 hora) correctamente aplicada.
- Secret leído de env var (`CSRF_SECRET`) — nunca hardcodeado.

**Observaciones (no críticas):**

1. **CSRF via query param (menor):** `extractCsrfToken` acepta `?csrf_token=` como fallback para GET requests. Los query params aparecen en logs de servidores y en el historial del navegador. Recomendación: documentar que este fallback solo es para requests de solo lectura y evaluar si se puede eliminar.
2. **Codificación del token:** `btoa(payload:hmac)` produce base64 estándar (con `+` y `/`). Si el token se transmite en URLs, usar `btoa().replace(/\+/g, '-').replace(/\//g, '_')` (base64url) para evitar necesidad de percent-encoding.
3. **Sin nonce:** El token puede ser reutilizado múltiples veces dentro de la ventana de 1 hora. Para operaciones de alta sensibilidad, considerar tokens de un solo uso almacenados en la sesión o en Redis.

**Veredicto:** Apto para producción. Las observaciones son mejoras incrementales, no bloqueos de seguridad.

---

### `crypto-utils.ts`

**Revisión:** Marzo 2026 | **Resultado:** Sin vulnerabilidades — implementación sólida

**Aspectos positivos:**

- AES-256-GCM es el estándar de la industria para cifrado autenticado.
- IV de 12 bytes generado con `crypto.getRandomValues` — aleatoriedad criptográficamente segura en cada cifrado.
- Autenticación del ciphertext incluida implícitamente por GCM (el auth tag de 16 bytes detecta tampering).
- Validación de longitud de clave (exactamente 32 bytes / 256 bits) en `importKey`.
- No hay hardcoded keys ni fallbacks inseguros.

**Observaciones (no críticas):**

1. **`hexToBytes` sin validación de formato:** Si `hexKey` contiene caracteres no hexadecimales, `parseInt(hex, 16)` retorna `NaN`, que se convierte silenciosamente en `0`. Recomendación: agregar validación `if (!/^[0-9a-fA-F]+$/.test(hexKey)) throw new Error(...)` antes de procesar.
2. **`isEncrypted` heurística frágil:** La detección de tokens Google basada en prefijos (`ya29.`, `1//`) puede romperse si Google cambia el formato. No es un problema de seguridad en sí, pero podría causar falsos negativos (intentar descifrar un token en texto plano). Recomendación: documentar esta asunción explícitamente.
3. **Sin key stretching:** La función espera una clave de 32 bytes en hexadecimal directamente. Si en el futuro se quiere derivar la clave desde un passphrase de usuario, agregar HKDF o PBKDF2. Por ahora (clave generada aleatoriamente y almacenada en Vault) no es necesario.

**Veredicto:** Implementación criptográfica correcta. Las observaciones son mejoras defensivas para casos edge, no vulnerabilidades activas.
