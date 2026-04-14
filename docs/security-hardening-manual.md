# Hardening Manual — Acciones Requieren Supabase Dashboard

> **Objetivo:** Documentar las configuraciones de seguridad críticas de Supabase que **solo pueden hacerse manualmente** desde el Dashboard, ya que no se pueden aplicar por código o migración.

**⚠️ Precauciones generales antes de tocar nada en el Dashboard de producción:**
- Hacer un backup logical de la base de datos antes de cambios significativos.
- Si no estás seguro, pregunta a Roberto antes de aplicar.
- Nunca trabajes en el Dashboard de producción fuera del horario de menor tráfico sin avisar a Roberto.

---

## 1. CORS Auth — Permitir solo orígenes de Simplifica

### Dónde ir
```
Supabase Dashboard → Authentication → URL Configuration
```

### Paso a paso

1. Navega a **Supabase Dashboard**.
2. En el menú lateral izquierdo, despliega **Authentication**.
3. Haz clic en **URL Configuration**.

### Qué configurar

| Campo | Valor |
|---|---|
| **Site URL** | `https://app.simplificacrm.es` |
| **Redirect URLs** | Añadir una por una: |
| | `https://app.simplificacrm.es/**` |
| | `https://simplifica-agenda.vercel.app/**` |
| | `https://simplifica-portal-frontend.vercel.app/**` |
| | `https://portal.simplificacrm.es/**` |
| **Custom OAuth Redirect URL** | Déjalo vacío o con el valor actual |
| **CORS Origin** | Déjalo vacío **o** configura solo: |
| | `https://app.simplificacrm.es` |
| | `https://simplifica-agenda.vercel.app` |
| | `https://simplifica-portal-frontend.vercel.app` |
| | `https://portal.simplificacrm.es` |

### Qué NO configurar

- ❌ **No pongas wildcards sueltos** como `*` en CORS Origin.
- ❌ **No uses dominios genéricos** que no pertenezcan a Simplifica.
- ❌ **No pongas URLs de desarrollo local** (`localhost:*`) en producción.

### Comando SQL de verificación post-cambio

```sql
-- Verificar que la configuración se ha guardado correctamente
SELECT 
    name, value
FROM auth.config
WHERE name IN ('site_url', 'redirect_urls', 'external_oauth_urls');
```

Si no devuelve resultados (tabla `auth.config` puede no existir en todos los proyectos), verificar manualmente en el Dashboard tras guardar.

### Rollback

1. Volver a **Authentication → URL Configuration**.
2. Restaurar los valores anteriores desde la configuración visible.
3. Guardar.

---

## 2. Rate Limiting en Auth

> **Nota:** Esta funcionalidad requiere **Supabase Pro o Team**. Si no ves esta opción, estáis en un plan gratuito.

### Dónde ir
```
Supabase Dashboard → Authentication → Rate Limits
```

### Paso a paso

1. Navega a **Supabase Dashboard**.
2. **Authentication** → **Rate Limits**.

### Qué configurar

| Campo | Valor recomendado |
|---|---|
| **Max requests per IP per hour** (login) | `20` |
| **Max requests per IP per hour** (signup) | `5` |
| **Max requests per IP per hour** (magic link) | `3` |

### Qué NO configurar

- ❌ **No pongas límites excesivamente altos** (eso anula la protección).
- ❌ **No deshabilites el rate limiting** si está disponible.
- ❌ **No apliques límites agresivos** (< 3 requests/hora para login) sin avisar, puede bloquear clientes legítimos.

### Comando SQL de verificación post-cambio

> **Nota:** El rate limiting a nivel de infraestructura **no se puede verificar via SQL** desde el tenant. Confirma visualmente en el Dashboard tras guardar.

### Rollback

1. Volver a **Authentication → Rate Limits**.
2. Restaurar los valores por defecto o anteriores.
3. Guardar.

---

## 3. Regenerar Anon Key

> **⚠️ Warning:** Regenerar la Anon Key romperá la autenticación de todos los clientes hasta que actualicen la nueva key en sus `.env`. Coordina con Roberto antes de proceder.

### Dónde ir
```
Supabase Dashboard → Settings → API
```

### Paso a paso

1. Navega a **Supabase Dashboard**.
2. En el menú lateral izquierdo, despliega **Settings**.
3. Haz clic en **API**.
4. En la sección **Replace API Key**, busca la fila de la **anon key**.
5. Haz clic en **Regenerate**.
6. Confirma la acción cuando te lo pida.

### Qué configurar

- **Anon Key:** Regenerar y copiar la nueva key (formato: `eyJ...`).
- **Service Role Key:** **No regenerar** a menos que la actual esté comprometida.

### Qué NO configurar

- ❌ **No regeneres la `service_role` key** sin un motivo grave (compromiso confirmado).
- ❌ **No compartas la nueva key por canales no seguros** (no por email plano o Telegram).
- ❌ **No commitees la nueva key** en el repositorio.

### Comando SQL de verificación post-cambio

```sql
-- Verificar que las keys tienen formato JWT válido (no comprueba el contenido, solo el formato)
SELECT 
    id, key_id, key_type, created_at
FROM vault.secrets
WHERE key_type = 'anon'
ORDER BY created_at DESC
LIMIT 5;
```

### Rollback

**No hay rollback directo.** Si necesitas revoke emergency:

1. Ir a **Settings → API**.
2. Volver a hacer click en **Regenerate** junto a la anon key.
3. Comunicar la nueva key a Roberto por canal seguro.

---

## 4. Auditar contenido de `public-assets`

### Dónde ir
```
Supabase Dashboard → Storage → storage-assets → public-assets
```
O ejecutar el SQL desde **SQL Editor**.

### Paso a paso (SQL Editor)

1. Navega a **Supabase Dashboard**.
2. **SQL Editor** en el menú lateral.
3. Ejecuta la consulta de abajo.

### Query de auditoría

```sql
SELECT 
    name, 
    bucket_id, 
    created_at, 
    metadata,
    size
FROM storage.objects 
WHERE bucket_id = 'public-assets' 
ORDER BY created_at DESC 
LIMIT 50;
```

### Qué verificar

- ✅ Solo archivos públicos: logos, CSS, fuentes, imágenes estáticas, favicons.
- ✅ Nombres de archivo sin información sensible (no `factura_2026.pdf`, no `dni_juan.pdf`).
- ✅ Sin archivos de backup o `.env`.

### Qué mover a bucket privado

- ❌ Archivos con datos personales o de clientes (DNI, contratos, facturas).
- ❌ Archivos de configuración.
- ❌ Backups o exports.
- ❌ Cualquier cosa que no sea recurso estático público.

### Rollback

Si encuentras archivos sensibles en `public-assets`:

1. **Storage** → Selecciona el archivo.
2. **Move** → Mover a un bucket privado (`client_documents`, `project_files`, etc.).
3. Verificar que las **policies** del bucket destino permiten el acceso correcto.

---

## 5. Verificar policies de storage en producción

### Dónde ir
```
Supabase Dashboard → SQL Editor
```

### Paso a paso

1. Navega a **Supabase Dashboard**.
2. **SQL Editor**.
3. Ejecuta la consulta de abajo.

### Query de verificación

```sql
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    cmd, 
    qual, 
    with_check
FROM pg_policies 
WHERE schemaname = 'storage'
AND (
    policyname LIKE '%client_documents%' 
    OR policyname LIKE '%project_files%'
    OR policyname LIKE '%public_assets%'
)
ORDER BY schemaname, tablename, policyname;
```

### Qué verificar

- ✅ Cada bucket tiene al menos una policy de **SELECT** (lectura).
- ✅ Cada bucket tiene al menos una policy de **INSERT/UPDATE/DELETE** según necesidad.
- ✅ Las policies son `permissive = true` (no restictivas).
- ✅ `qual` y `with_check` contienen `tenant_id` o `company_id` para asegurar aislamiento multi-tenant.

### Qué NO modificar sin aprobación

- ❌ **No eliminar policies** sin hablar con Roberto primero.
- ❌ **No cambiar `permissive = false`** sin entender el impacto.
- ❌ **No hacer DELETE de policies** desde el SQL Editor si no estás seguro.

### Rollback

Si una policy se ha modificado incorrectamente:

1. Identificar el nombre de la policy y la tabla afectada desde el resultado del query.
2. Recrear la policy manualmente:

```sql
-- Ejemplo genérico de recrear una policy (sustituir por lapolicy real)
CREATE POLICY "policy_name_here" ON storage.objects
FOR ALL
USING (tenant_id = auth.jwt() ->> 'tenant_id')
WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id');
```

3. Si no estás seguro de cómo recrearla, pedir ayuda a Sincronia (el agente).

---

## Checklist rápido antes de cerrar sesión del Dashboard

- [ ] ¿Has guardado todos los cambios?
- [ ] ¿Has copiado las nuevas keys a los `.env` locales?
- [ ] ¿Has notificado a Roberto si regeneraste la anon key?
- [ ] ¿Hay alguien más trabajando en el Dashboard? (coordinar para evitar conflictos)

---

## Referencias

- [Supabase Auth Docs — Redirect URLs](https://supabase.com/docs/guides/auth/concepts/redirect-urls)
- [Supabase Storage — Security](https://supabase.com/docs/guides/storage/security)
- [Supabase RLS — Best Practices](https://supabase.com/docs/guides/auth/row-level-security)

---

*Documento creado por Sincronia (agente de seguridad Simplifica). Actualizado: 2026-04-13.*
