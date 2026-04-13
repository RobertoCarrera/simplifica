# Auditoría de Seguridad — Sistema de Login e Invitaciones
**Fecha:** 2026-05-28  
**Auditor:** GitHub Copilot Security Audit  
**Versión Auditada:** Rama principal (HEAD)  
**Metodología:** OWASP Top 10 2021 · OWASP WSTG v4.2 · RGPD Art. 32 · ENS Básico  
**Ámbito:** Edge Functions de autenticación/invitaciones · RLS PostgreSQL · Guards Angular · Gestión de sesión · Configuración HTTP

---

## Resumen Ejecutivo

Se identificaron **19 hallazgos** distribuidos en 4 niveles de criticidad:

| Severidad   | Recuento |
|-------------|----------|
| 🔴 CRÍTICO  | 2        |
| 🟠 ALTO     | 6        |
| 🟡 MEDIO    | 7        |
| 🔵 BAJO     | 4        |

Los dos hallazgos críticos permiten en teoría: (1) falsificar claims JWT arbitrarios incluyendo `user_role` y `company_id`, y (2) que cualquier usuario autenticado cree invitaciones de empresa no autorizadas. Se recomienda atención inmediata sobre ambos.

---

## Índice

- [F-AUTH-01](#f-auth-01--hook-custom-access-token-sin-secreto) 🔴 CRÍTICO — Hook JWT sin secreto
- [F-AUTH-02](#f-auth-02--rls-insert-en-company_invitations-sin-validación-de-compañía) 🔴 CRÍTICO — RLS INSERT sin validación de compañía
- [F-AUTH-03](#f-auth-03--enumeración-de-usuarios-en-create-invited-user) 🟠 ALTO — Enumeración de usuarios
- [F-AUTH-04](#f-auth-04--rls-select-expone-token-de-invitación-al-invitado) 🟠 ALTO — Token expuesto en RLS SELECT
- [F-AUTH-05](#f-auth-05--rls-update-permite-reutilizar-tokens-caducados) 🟠 ALTO — Reciclaje de tokens caducados
- [F-AUTH-06](#f-auth-06--adminGuard-sin-revalidación-en-servidor) 🟠 ALTO — AdminGuard sin revalidación
- [F-CONF-01](#f-conf-01--security_headers-ausente-en-funciones-críticas) 🟠 ALTO — SECURITY_HEADERS ausente
- [F-AUTH-07](#f-auth-07--token-de-invitación-devuelto-al-llamante-en-send-company-invite) 🟠 ALTO — Token en respuesta a llamante
- [F-AUTH-08](#f-auth-08--auth-callback-redirige-flujo-invite-a-reset-password) 🟡 MEDIO — Callback invite → reset-password
- [F-CONF-02](#f-conf-02--csp-style-src-unsafe-inline-en-vercel) 🟡 MEDIO — CSP `unsafe-inline` estilos
- [F-CONF-03](#f-conf-03--hsts-sin-preload) 🟡 MEDIO — HSTS sin `preload`
- [F-CONF-04](#f-conf-04--cors-permite-get-en-endpoints-post-only) 🟡 MEDIO — CORS permite GET
- [F-AUTH-09](#f-auth-09--last_active_company_id-en-localstorage-sin-cifrar) 🟡 MEDIO — UUID de empresa en localStorage
- [F-AUTH-10](#f-auth-10--getinvitationbyemail-devuelve-campo-token-al-cliente) 🟡 MEDIO — Campo `token` en consulta cliente
- [F-AUTH-11](#f-auth-11--anonkey-usado-como-bearer-en-handleownerregistration) 🟡 MEDIO — anonKey como Bearer
- [F-AUTH-12](#f-auth-12--send-company-invite-devuelve-http-200-para-errores-de-autenticación) 🟡 MEDIO — HTTP 200 para errores auth
- [F-CONF-05](#f-conf-05--consolelog-de-estado-sensible-en-producción) 🔵 BAJO — `console.log` sensible en prod
- [F-CONF-06](#f-conf-06--inconsistencia-en-extracción-de-ip-entre-funciones) 🔵 BAJO — IP extraction inconsistente
- [F-CONF-07](#f-conf-07--csp-sin-upgrade-insecure-requests-ni-report-uri) 🔵 BAJO — CSP incompleta

---

## Hallazgos Detallados

---

### F-AUTH-01 — Hook `custom-access-token` sin secreto
**Severidad:** 🔴 CRÍTICO  
**CVSS 3.1:** 9.8 (AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:N)  
**OWASP:** A07:2021 – Identification and Authentication Failures  
**RGPD:** Art. 32(1)(b) — integridad y confidencialidad del tratamiento  

**Archivo:** [`supabase/functions/custom-access-token/index.ts`](supabase/functions/custom-access-token/index.ts)

**Descripción:**  
El hook de Supabase Auth que inyecta `company_id` y `user_role` en cada JWT comprueba el secreto `HOOK_SECRET` mediante comparación segura (`timingSafeEqual`). Sin embargo, si la variable de entorno `HOOK_SECRET` está vacía o no definida, el check es saltado completamente con solo un `console.warn`:

```typescript
if (!HOOK_SECRET) {
  console.warn('⚠️ HOOK_SECRET not set...');
  // Flow continues — no authentication performed
}
```

Cualquier actor que conozca (o adivine) la URL de la Edge Function puede invocarla directamente, construir un payload con `user_role: 'super_admin'` y `company_id` arbitrario, y obtener un JWT con claims falsificados.

**Proof of Concept:**
```bash
curl -X POST https://<project>.supabase.co/functions/v1/custom-access-token \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<victim-uuid>","user_metadata":{},"app_metadata":{},"role":"authenticated"}'
# → JWT firmado con company_id y user_role arbitrarios si HOOK_SECRET está vacío
```

**Impacto:**  
Escalada de privilegios completa. Un atacante puede impersonar a cualquier usuario con rol `owner` o `super_admin` de cualquier empresa sin credenciales.

**Remediación:**
```typescript
if (!HOOK_SECRET) {
  console.error('CRITICAL: HOOK_SECRET is not set. Rejecting all requests.');
  return new Response(JSON.stringify({ error: 'Service misconfigured' }), { status: 500 });
}
```
Además, asegurarse de que `HOOK_SECRET` siempre esté configurado en los secretos del proyecto Supabase. Añadir alertas de monitoreo para peticiones a este endpoint.

**Estado:** Abierto

---

### F-AUTH-02 — RLS INSERT en `company_invitations` sin validación de compañía
**Severidad:** 🔴 CRÍTICO  
**CVSS 3.1:** 8.8 (AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:N)  
**OWASP:** A01:2021 – Broken Access Control  
**RGPD:** Art. 32(1)(b)  

**Archivo:** [`supabase/migrations/20260311153000_fix_superadmin_invitations_v2.sql`](supabase/migrations/20260311153000_fix_superadmin_invitations_v2.sql)

**Descripción:**  
La política INSERT de la tabla `company_invitations` tiene la siguiente estructura (simplificada):

```sql
CREATE POLICY "company_invitations_insert" ON company_invitations
FOR INSERT WITH CHECK (
  is_super_admin(auth.uid())                          -- super admin: ok
  OR (
    invited_by_user_id = auth.uid()                   -- ← CATCH-ALL sin check de company_id
    AND ... (condición de membresía)
  )
);
```

La rama de membresía verifica que `invited_by_user_id = auth.uid()`, pero **no impone** que el `company_id` del registro insertado coincida con la empresa a la que pertenece el usuario autenticado. Un usuario legítimo de la empresa A puede insertar una invitación válida para la empresa B siempre que se fije a sí mismo como `invited_by_user_id`.

**Proof of Concept:**
```sql
-- Usuario autenticado de Empresa A:
INSERT INTO company_invitations (company_id, email, invited_by_user_id, token, status, role)
VALUES (
  '<empresa-B-uuid>',           -- empresa de la víctima
  'victim@empresa-b.com',
  auth.uid(),                   -- propio UUID como inviter
  gen_random_uuid()::text,
  'pending',
  'owner'
);
-- → INSERT permite → víctima recibe email de invitación a empresa B con rol owner
```

**Impacto:**  
Un usuario de cualquier empresa puede forzar invitaciones con cualquier rol (incluido `owner`) a cualquier otra empresa, tomando el control de instancias de terceros.

**Remediación:**  
Añadir una comprobación de membresía explícita sobre `company_id`:

```sql
AND EXISTS (
  SELECT 1 FROM company_members cm
  WHERE cm.user_id = auth.uid()
    AND cm.company_id = company_invitations.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
)
```

**Estado:** Abierto

---

### F-AUTH-03 — Enumeración de usuarios en `create-invited-user`
**Severidad:** 🟠 ALTO  
**CVSS 3.1:** 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)  
**OWASP:** A07:2021 – Identification and Authentication Failures  
**RGPD:** Art. 5(1)(c) — minimización de datos  

**Archivo:** [`supabase/functions/create-invited-user/index.ts`](supabase/functions/create-invited-user/index.ts)

**Descripción:**  
Para determinar si el email a invitar ya tiene cuenta en Supabase Auth, la función usa:

```typescript
const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 50 });
const existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
```

Esto tiene dos problemas:
1. **Enumeración silenciosa**: si hay más de 50 usuarios en el sistema, el `find()` falla silenciosamente y crea un usuario duplicado en vez de vincular el existente.
2. **Privacidad**: la función descarga un listado de 50 cuentas completas (incluyendo email, metadatos, fechas) en cada invocación — innecesario.

**Remediación:**  
Usar la API de búsqueda directa por email, que no devuelve listados y no tiene el límite de 50:

```typescript
const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({
  // Supabase Admin API supports filtering via getUserByEmail
});
// Better: use getUserByEmail if available, or a DB lookup via a function call.
```

O bien, en su defecto, resolver la búsqueda con una función de base de datos que sólo devuelva el UUID si existe:

```typescript
const { data } = await supabaseAdmin.rpc('get_auth_user_id_by_email', { p_email: email });
```

**Estado:** Abierto

---

### F-AUTH-04 — RLS SELECT expone campo `token` al invitado vía coincidencia de email
**Severidad:** 🟠 ALTO  
**CVSS 3.1:** 7.1 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N)  
**OWASP:** A01:2021 – Broken Access Control  
**RGPD:** Art. 32(1)(b)  

**Archivo:** [`supabase/migrations/20260311153000_fix_superadmin_invitations_v2.sql`](supabase/migrations/20260311153000_fix_superadmin_invitations_v2.sql)  
**Archivo cliente:** [`src/app/features/portal/invite/portal-invite.component.ts`](src/app/features/portal/invite/portal-invite.component.ts)

**Descripción:**  
La política SELECT incluye:

```sql
OR lower(email) = lower(auth.jwt() ->> 'email')
```

Esto permite que un usuario autenticado cuyo email coincide con el de la invitación lea **toda la fila**, incluyendo la columna `token`. El componente `portal-invite.component.ts` también consulta `getInvitationByEmail()` seleccionando el campo `token` sin restricción.

Esto significa que un usuario autenticado puede obtener el token secreto de sus propias invitaciones directamente desde la API de Supabase, sin necesidad de acceder al correo.

**Remediación:**  
Eliminar la columna `token` de las consultas SELECT realizadas por el cliente (seleccionar solo los campos necesarios: `id`, `status`, `email`, `role`, `expires_at`). Si se requiere el token en algún flujo, generarlo en el momento del uso vía RPC, nunca devolverlo en listados.

**Estado:** Abierto

---

### F-AUTH-05 — RLS UPDATE permite reciclar tokens de invitación caducados
**Severidad:** 🟠 ALTO  
**CVSS 3.1:** 7.1 (AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:H/A:N)  
**OWASP:** A01:2021 – Broken Access Control  

**Archivo:** [`supabase/migrations/20260311153000_fix_superadmin_invitations_v2.sql`](supabase/migrations/20260311153000_fix_superadmin_invitations_v2.sql)

**Descripción:**  
La política UPDATE es:

```sql
FOR UPDATE USING (
  is_super_admin(auth.uid())
  OR invited_by_user_id = auth.uid()   -- inviter puede actualizar su propia invitación
)
```

No restringe qué columnas pueden actualizarse. Esto permite al `invited_by_user_id` ejecutar:

```sql
UPDATE company_invitations
SET status = 'pending', expires_at = now() + interval '7 days'
WHERE id = '<invitation-uuid>';
```

Rehabilitando una invitación expirada o revocada **sin necesidad de crear una nueva** y sin generación de un nuevo token, lo que rompe la lógica de caducidad.

**Remediación:**  
Restringir las columnas actualizables mediante una policy `WITH CHECK` que no permita cambiar `status`, `token`, `expires_at` desde el cliente (solo desde Service Role o RPC explícita):

```sql
-- Sólo permitir UPDATE a campos no-sensibles (e.g. mensaje personalizado)
-- Para re-enviar: usar una función RPC que genere nuevo token + nueva fecha
```

**Estado:** Abierto

---

### F-AUTH-06 — `AdminGuard` sin revalidación en servidor
**Severidad:** 🟠 ALTO  
**CVSS 3.1:** 7.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:L/A:N)  
**OWASP:** A01:2021 – Broken Access Control  

**Archivo:** [`src/app/guards/auth.guard.ts`](src/app/guards/auth.guard.ts)

**Descripción:**  
`AdminGuard` decide si una ruta de administración es accesible basándose en el perfil cargado localmente en un signal de Angular:

```typescript
map(([profile]) => {
  const role = profile?.role;
  if (role === 'super_admin' || role === 'admin' || role === 'owner') {
    return true;
  }
  this.router.navigate(['/']);
  return false;
})
```

Este perfil se obtiene de caché local y no se revalida contra la base de datos en cada activación del guard. Si la sesión JWT es válida pero el rol del usuario ha sido degradado (por ejemplo, de `admin` a `user`) en la base de datos, el guard continuará permitiendo el acceso hasta que la sesión expire o la página se recargue.

Adicionalmente, `AuthGuard` tiene este fallback en `catchError`:

```typescript
catchError(error => {
  const session = this.authService.getCurrentSessionSync();
  if (session) return of(true);  // ← permite acceso si falla la carga del perfil
  ...
})
```

Un error intermitente en la carga del perfil (red, lentitud de BD) puede dejar pasar a un usuario sin rol verificado.

**Remediación:**  
- Añadir en `AdminGuard` una llamada de verificación al servidor con el JWT actual (por ejemplo, una RPC de Supabase o una consulta `single()` a `company_members` con `auth.uid()`).
- En el `catchError` de `AuthGuard`, fallar cerrado: si no se puede determinar el rol, denegar acceso en lugar de permitirlo.

**Estado:** Abierto

---

### F-CONF-01 — `SECURITY_HEADERS` ausente en funciones críticas
**Severidad:** 🟠 ALTO  
**CVSS 3.1:** 6.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N)  
**OWASP:** A05:2021 – Security Misconfiguration  

**Archivos:**
- [`supabase/functions/create-invited-user/index.ts`](supabase/functions/create-invited-user/index.ts)
- [`supabase/functions/send-client-consent-invite/index.ts`](supabase/functions/send-client-consent-invite/index.ts)
- [`supabase/functions/send-company-invite/index.ts`](supabase/functions/send-company-invite/index.ts)

**Descripción:**  
El archivo [`supabase/functions/_shared/security.ts`](supabase/functions/_shared/security.ts) define `SECURITY_HEADERS` (incluyendo `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc.) y las funciones auxiliares `jsonResponse()` y `errorResponse()`. Sin embargo, las tres funciones anteriores **no importan** este módulo y construyen sus propias respuestas directamente con `new Response(...)` sin cabeceras de seguridad.

Los headers de seguridad aplicados por Vercel sólo cubren el frontend Angular. Las Edge Functions tienen sus propias URLs directamente accesibles (`.supabase.co/functions/v1/...`) y carecen de todas las protecciones de cabeceras.

**Remediación:**  
Reemplazar todas las construcciones manuales de respuesta con `jsonResponse()` y `errorResponse()` importadas de `_shared/security.ts`:

```typescript
import { jsonResponse, errorResponse, SECURITY_HEADERS } from '../_shared/security.ts';

// En vez de:
return new Response(JSON.stringify({ ... }), { headers: { 'Content-Type': 'application/json' } });

// Usar:
return jsonResponse({ ... });
```

**Estado:** Abierto

---

### F-AUTH-07 — Token de invitación devuelto al llamante en `send-company-invite`
**Severidad:** 🟠 ALTO  
**CVSS 3.1:** 6.8 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)  
**OWASP:** A02:2021 – Cryptographic Failures  
**RGPD:** Art. 5(1)(f) — confidencialidad  

**Archivo:** [`supabase/functions/send-company-invite/index.ts`](supabase/functions/send-company-invite/index.ts) (línea final del handler)

**Descripción:**  
En la respuesta de éxito, la función devuelve el token de invitación al frontend del operador:

```typescript
return new Response(JSON.stringify({
  success: true,
  invitation_id: invitationId || null,
  token: inviteToken  // ← token secreto expuesto
}), { status: 200 });
```

El token es un secreto de un solo uso que debería conocer únicamente el destinatario (a través del email). Al devolverlo al operador que originó la invitación:
- Queda registrado en los logs del navegador y en herramientas de red (DevTools).
- Permite al operador aceptar la invitación directamente, suplantando al invitado.
- Si el canal de respuesta es interceptado (XSS, extensión maliciosa), el token queda comprometido.

**Remediación:**  
Eliminar el campo `token` de la respuesta. Devolver únicamente `invitation_id` y `success`:

```typescript
return jsonResponse({ success: true, invitation_id: invitationId || null });
```

**Estado:** Abierto

---

### F-AUTH-08 — `auth-callback` redirige flujo `invite` a `/reset-password`
**Severidad:** 🟡 MEDIO  
**CVSS 3.1:** 5.4 (AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:L/A:N)  
**OWASP:** A07:2021 – Identification and Authentication Failures  

**Archivo:** [`src/app/features/auth/auth-callback/auth-callback.component.ts`](src/app/features/auth/auth-callback/auth-callback.component.ts)

**Descripción:**  
El componente de callback procesa el parámetro `type` de la URL. Cuando `type === 'invite'`, redirige a `/reset-password`. Esta lógica corresponde al flujo antiguo de Supabase donde las invitaciones requerían establecer contraseña. El flujo actual de la aplicación es **passwordless** (magic link / token personalizado), por lo que esta rama errónea podría:

1. Confundir al usuario obligándole a crear una contraseña que nunca se usará.
2. En una explotación sofisticada, un atacante podría manipular el parámetro `type` en el magic link para forzar el flujo incorrecto.

Adicionalmente, el parsing de tokens de la URL usa `.split('=')` simple:
```typescript
const token = fragment.split('access_token=')[1]?.split('&')[0];
```
Este enfoque falla si el token contiene `&` codificado como `%26` o en casos de URL encoding múltiple.

**Remediación:**  
- Reemplazar la redirección a `/reset-password` cuando `type === 'invite'` por el flujo actual (navegación al portal de invitaciones con el token).
- Usar `URLSearchParams` o `new URL()` para parsear fragmentos de URL en lugar de `split('=')`:
```typescript
const params = new URLSearchParams(fragment);
const accessToken = params.get('access_token');
```

**Estado:** Abierto

---

### F-CONF-02 — CSP `style-src 'unsafe-inline'` en Vercel
**Severidad:** 🟡 MEDIO  
**CVSS 3.1:** 5.4 (AV:N/AC:H/PR:N/UI:R/S:C/C:L/I:L/A:N)  
**OWASP:** A05:2021 – Security Misconfiguration  

**Archivo:** [`vercel.json`](vercel.json)

**Descripción:**  
La Content Security Policy configurada incluye `'unsafe-inline'` para `style-src`:

```json
"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ..."
```

Aunque `script-src` correctamente excluye `'unsafe-inline'`, la permisividad en estilos permite ataques de CSS Injection (exfiltración de datos mediante selectores de atributo), clickjacking vía `z-index` y otros vectores de inyección de estilos.

**Remediación:**  
Usar `nonce` o `hash` para los estilos inline necesarios, o migrar todos los estilos inline a hojas de estilos externas:

```json
"style-src 'self' 'nonce-{NONCE}' https://fonts.googleapis.com ..."
```

Si la migración completa no es viable a corto plazo, añadir al menos `'unsafe-inline'` **solo** en un header `Content-Security-Policy-Report-Only` para monitorear sin bloquear, y eliminar de la política aplicada.

**Estado:** Abierto

---

### F-CONF-03 — HSTS sin `preload`
**Severidad:** 🟡 MEDIO  
**CVSS 3.1:** 4.3 (AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:N)  
**OWASP:** A05:2021 – Security Misconfiguration  

**Archivo:** [`vercel.json`](vercel.json)

**Descripción:**  
```json
"Strict-Transport-Security": "max-age=31536000; includeSubDomains"
```

La directiva `preload` está ausente. Sin ella, un usuario que nunca haya visitado el sitio podría ser redirigido a HTTP antes del primer HSTS header (TOFU — Trust On First Use). El preload elimina este vector incluyendo el dominio en la lista precargada de los navegadores.

**Remediación:**  
```json
"Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload"
```
Y registrar el dominio en [https://hstspreload.org](https://hstspreload.org).

**Estado:** Abierto

---

### F-CONF-04 — CORS permite `GET` en endpoints `POST`-only
**Severidad:** 🟡 MEDIO  
**CVSS 3.1:** 4.3 (AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:N)  
**OWASP:** A05:2021 – Security Misconfiguration  

**Archivo:** [`supabase/functions/_shared/cors.ts`](supabase/functions/_shared/cors.ts)

**Descripción:**  
```typescript
'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
```

Las Edge Functions del sistema de invitaciones (`send-company-invite`, `create-invited-user`, `send-client-consent-invite`) son exclusivamente `POST`. Permitir `GET` en el header CORS amplía la superficie de ataque y puede facilitar ataques CSRF mediante etiquetas `<img>` o `<script>` en orígenes no permitidos (cuando el CORS check falla silenciosamente en algunos proxies).

**Remediación:**  
Especificar solo los métodos necesarios por función, o eliminar `GET` del header global:

```typescript
'Access-Control-Allow-Methods': 'POST, OPTIONS'
```

**Estado:** Abierto

---

### F-AUTH-09 — `last_active_company_id` en localStorage sin cifrar
**Severidad:** 🟡 MEDIO  
**CVSS 3.1:** 4.3 (AV:N/AC:L/PR:L/UI:R/S:U/C:L/I:N/A:N)  
**OWASP:** A02:2021 – Cryptographic Failures  
**RGPD:** Art. 25 — privacidad por diseño  

**Archivo:** [`src/app/services/auth.service.ts`](src/app/services/auth.service.ts)

**Descripción:**  
```typescript
localStorage.setItem('last_active_company_id', companyId);
```

El `company_id` (UUID de empresa) se persiste en `localStorage` en claro, saltando `SecureStorageService` (que usa AES-GCM y almacena la clave en `sessionStorage`). Cualquier script de terceros con acceso a `window.localStorage` (extensiones de navegador, XSS) puede leer este UUID.

Aunque un UUID solo no permite acceso, en combinación con otros datos expone la afiliación del usuario a empresas — información que puede ser sensible (especialmente dado que la app gestiona datos clínicos bajo Art. 9 RGPD).

**Remediación:**  
```typescript
await this.secureStorageService.setItem('last_active_company_id', companyId);
```

**Estado:** Abierto

---

### F-AUTH-10 — `getInvitationByEmail()` devuelve campo `token` al cliente Angular
**Severidad:** 🟡 MEDIO  
**CVSS 3.1:** 4.9 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)  
**OWASP:** A01:2021 – Broken Access Control  

**Archivo:** [`src/app/features/portal/invite/portal-invite.component.ts`](src/app/features/portal/invite/portal-invite.component.ts)

**Descripción:**  
`getInvitationByEmail()` incluye `token` en el selector de columnas de la consulta anon a `company_invitations`. Recuperar el token directamente en el cliente y almacenarlo en memoria del componente expone el secreto en:
- La memoria JavaScript del navegador (devtools, extensiones)
- Logs de red (si se imprime por error)
- Cualquier snapshot de estado de la aplicación

**Remediación:**  
Excluir `token` del select en el cliente. Si el token es necesario para acciones posteriores, recuperarlo de parámetros de URL o de `sessionStorage` (donde ya fue almacenado al navegar a la ruta `/invite?token=...`).

**Estado:** Abierto

---

### F-AUTH-11 — `anonKey` usado como `Authorization: Bearer` en `handleOwnerRegistration()`
**Severidad:** 🟡 MEDIO  
**CVSS 3.1:** 5.3 (AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N)  
**OWASP:** A07:2021 – Identification and Authentication Failures  

**Archivo:** [`src/app/features/portal/invite/portal-invite.component.ts`](src/app/features/portal/invite/portal-invite.component.ts)

**Descripción:**  
```typescript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${environment.supabase.anonKey}`
}
```

Se usa la `anonKey` pública de Supabase como token de autorización en la llamada a la Edge Function `create-invited-user`. La `anonKey` no es un JWT de usuario — es una clave pública conocida por cualquiera que inspeccione el bundle JavaScript. La Edge Function debería recibir o bien sin `Authorization` (dependiendo solo de los parámetros del body para autenticarse) o bien el JWT de sesión del usuario actual.

Aunque en la práctica la Edge Function valida el `token` de invitación del body, el uso incorrecto del header `Authorization` puede:
- Crear confusión en logs y auditorías de acceso.
- En un refactor futuro, llevar a omitir la validación correcta al asumir que la sesión ya fue verificada por el header.

**Remediación:**  
```typescript
const session = await this.supabase.auth.getSession();
const jwt = session.data.session?.access_token;
headers: {
  'Authorization': `Bearer ${jwt ?? environment.supabase.anonKey}`,
  // ...
}
```
O bien, si la Edge Function no requiere usuario autenticado, eliminar el header `Authorization`.

**Estado:** Abierto

---

### F-AUTH-12 — `send-company-invite` devuelve HTTP 200 para errores de autenticación
**Severidad:** 🟡 MEDIO  
**CVSS 3.1:** 4.0 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:N)  
**OWASP:** A09:2021 – Security Logging and Monitoring Failures  

**Archivo:** [`supabase/functions/send-company-invite/index.ts`](supabase/functions/send-company-invite/index.ts)

**Descripción:**  
Todos los casos de error (fallo de autorización, usuario no encontrado, error interno) devuelven HTTP 200 con `{ success: false }` en el body, incluyendo el catch global del handler:

```typescript
// Fallo de autorización
return new Response(JSON.stringify({ success: false, error: "unauthorized" }), { status: 200 });

// Error interno
return new Response(JSON.stringify({ success: false, error: "Error interno..." }), { status: 200 });
```

Esto impide que las herramientas de monitoreo (alertas de WAF, SIEM, sistemas de métricas HTTP) detecten actividad anómala como múltiples intentos de autorización fallidos. Un atacante que prueba permisos no deja rastro en los códigos de estado HTTP.

**Remediación:**  
- Usar HTTP 401 para no autenticado, 403 para no autorizado, 500 para errores internos.
- Solo mantener 200 para respuestas de éxito real.

**Estado:** Abierto

---

### F-CONF-05 — `console.log` de estado sensible en producción
**Severidad:** 🔵 BAJO  
**CVSS 3.1:** 3.1 (AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N)  
**OWASP:** A09:2021 – Security Logging and Monitoring Failures  

**Archivos:**
- [`src/app/services/auth.service.ts`](src/app/services/auth.service.ts)
- [`src/app/features/auth/auth-callback/auth-callback.component.ts`](src/app/features/auth/auth-callback/auth-callback.component.ts)

**Descripción:**  
Múltiples `console.log` emiten el estado de autenticación (`isSuperAdmin`, `userId`, detalles de sesión) en producción. Cualquier script de terceros con acceso a la consola (extensiones, marcos embebidos) puede acceder a esta información.

**Remediación:**  
Condicionar todos los logs de depuración a `!environment.production`:
```typescript
if (!environment.production) {
  console.log('Auth state:', details);
}
```
O usar el servicio `src/disable-console.ts` que ya existe en el proyecto de forma consistente.

**Estado:** Abierto

---

### F-CONF-06 — Inconsistencia en extracción de IP entre Edge Functions
**Severidad:** 🔵 BAJO  
**CVSS 3.1:** 3.7 (AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:N)  
**OWASP:** A05:2021 – Security Misconfiguration  

**Archivos:**
- [`supabase/functions/create-invited-user/index.ts`](supabase/functions/create-invited-user/index.ts) — usa `x-forwarded-for` directo
- [`supabase/functions/send-client-consent-invite/index.ts`](supabase/functions/send-client-consent-invite/index.ts) — usa `x-real-ip || cf-connecting-ip`
- [`supabase/functions/send-company-invite/index.ts`](supabase/functions/send-company-invite/index.ts) — usa `getClientIP()` de `_shared/security.ts` ✅

**Descripción:**  
La función `getClientIP()` de `_shared/security.ts` aplica la prioridad correcta (CF-Connecting-IP → X-Real-IP → X-Forwarded-For con sanitización). Las otras dos funciones usan headers directamente y son potencialmente manipulables por un cliente que inyecte headers personalizados, permitiendo bypass del rate-limiting basado en IP.

**Remediación:**  
Reemplazar todos los accesos directos a headers de IP con `getClientIP(req)` de `_shared/security.ts`.

**Estado:** Abierto

---

### F-CONF-07 — CSP sin `upgrade-insecure-requests` ni `report-uri`
**Severidad:** 🔵 BAJO  
**CVSS 3.1:** 2.6 (AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:L/A:N)  
**OWASP:** A05:2021 – Security Misconfiguration  

**Archivo:** [`vercel.json`](vercel.json)

**Descripción:**  
- Falta `upgrade-insecure-requests` en la CSP, por lo que recursos cargados por HTTP no son promovidos automáticamente a HTTPS.
- No hay directiva `report-uri` ni `report-to`, por lo que las violaciones de CSP no se reportan a ningún endpoint de monitoreo. Sin visibilidad de violaciones no es posible detectar ataques XSS activos.

**Remediación:**  
```json
"Content-Security-Policy": "... upgrade-insecure-requests; report-uri /api/csp-report"
```
Implementar un endpoint sencillo para recibir y loguear violaciones CSP.

**Estado:** Abierto

---

## Hallazgos Positivos (Buenas Prácticas Confirmadas)

Se documentan para registro las protecciones correctas encontradas:

| Área | Buena práctica |
|------|---------------|
| Rate Limiting | Deno KV persistente con CAS atómico — correcto entre réplicas |
| `custom-access-token` | `timingSafeEqual` para comparación de secreto (previene timing attacks) |
| CORS | Allowlist de orígenes con `Vary: Origin` |
| `send-company-invite` | Prevención de auto-invitarse, sanitización de mensaje personalizado |
| `create-invited-user` | Validación de formato UUID antes de consulta DB |
| `SecureStorageService` | AES-GCM 256-bit con clave en `sessionStorage` |
| Login | Validación estricta de `returnTo` (regex + checks anti-bypass) |
| `invite-token.guard` | Limpieza del hash tras procesar el token (`history.replaceState`) |
| Portal de invitación | `ALLOWED_LEGAL_URLS` whitelist para apertura de URLs legales |
| Inactividad | Timeout de 30 minutos con limpieza de sesión |
| `vercel.json` | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` |
| CSP | `script-src 'self'` sin `'unsafe-inline'` para scripts |

---

## Hoja de Ruta de Remediación

### Sprint inmediato (< 1 semana)

| ID | Acción |
|----|--------|
| F-AUTH-01 | Añadir fail-fast cuando `HOOK_SECRET` está vacío |
| F-AUTH-02 | Añadir check de `company_id` en la política RLS INSERT |
| F-AUTH-07 | Eliminar campo `token` de la respuesta de `send-company-invite` |
| F-CONF-01 | Importar `jsonResponse`/`errorResponse` en las 3 Edge Functions afectadas |

### Sprint corto plazo (< 1 mes)

| ID | Acción |
|----|--------|
| F-AUTH-03 | Reemplazar `listUsers({perPage:50})` por búsqueda directa por email |
| F-AUTH-04 | Excluir columna `token` de consultas SELECT cliente |
| F-AUTH-05 | Restringir UPDATE de `company_invitations` vía RPC explícita |
| F-AUTH-06 | Añadir revalidación en servidor en `AdminGuard` |
| F-AUTH-08 | Corregir flujo `type=invite` en `auth-callback` |
| F-AUTH-12 | Corregir códigos HTTP en `send-company-invite` |
| F-CONF-06 | Unificar extracción de IP con `getClientIP()` |

### Medio plazo (< 3 meses)

| ID | Acción |
|----|--------|
| F-AUTH-09 | Migrar `last_active_company_id` a `SecureStorageService` |
| F-AUTH-10 | Eliminar `token` del select en `getInvitationByEmail()` |
| F-AUTH-11 | Corregir uso de `anonKey` en `handleOwnerRegistration()` |
| F-CONF-02 | Eliminar `'unsafe-inline'` de `style-src` con migración a nonces |
| F-CONF-03 | Añadir `preload` a HSTS y registrar en hstspreload.org |
| F-CONF-04 | Restringir métodos CORS a `POST, OPTIONS` |
| F-CONF-05 | Condicionar `console.log` a `!environment.production` |
| F-CONF-07 | Añadir `upgrade-insecure-requests` y `report-uri` a la CSP |

---

*Informe generado con metodología OWASP Top 10 2021 · WSTG v4.2 · RGPD Art. 32 · ENS Básico*
