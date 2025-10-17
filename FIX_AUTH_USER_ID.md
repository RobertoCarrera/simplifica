# 🔧 FIX APLICADO: auth_user_id + hidden_by FK

## ❌ Problemas identificados

### Error 1: "User not associated with a company"
La Edge Function buscaba por campo incorrecto.

### Error 2: "violates foreign key constraint hidden_stages_hidden_by_fkey"
La Edge Function insertaba `auth.users.id` en `hidden_by`, pero ese campo tiene FK a `users.id`.

---

## ✅ Soluciones aplicadas

### Fix 1: Consultar por auth_user_id

```typescript
// ANTES (❌ buscaba por id que no existe)
.select("company_id")
.eq("id", user.id)

// DESPUÉS (✅ busca por auth_user_id y obtiene también el id de users)
.select("id, company_id")
.eq("auth_user_id", user.id)
```

### Fix 2: Usar users.id para FK hidden_by

```typescript
// Obtener ambos IDs
const userId = userData.id;        // users.id (para FK)
const companyId = userData.company_id;

// ANTES (❌ usaba auth.users.id)
hidden_by: user.id  // UUID de auth.users

// DESPUÉS (✅ usa users.id)
hidden_by: userId   // UUID de tabla users (cumple FK)
```

---

## 📊 Estructura de tu BD

```sql
-- Tabla users
CREATE TABLE public.users (
  id UUID PRIMARY KEY,                          -- ← Usamos este para FK
  auth_user_id UUID REFERENCES auth.users(id),  -- ← Buscamos por este
  company_id UUID,
  ...
);

-- Tabla hidden_stages
CREATE TABLE hidden_stages (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  stage_id UUID REFERENCES ticket_stages(id),
  hidden_by UUID REFERENCES users(id),  -- ← FK a users.id (no auth.users)
  ...
);
```

---

## 🚀 Re-deployment

```bash
bash redeploy-hide-stage.sh
```

O manual:
```bash
supabase functions deploy hide-stage --project-ref ufutyjbqfjrlzkprvyvs
```

---

## ✅ Verificación

Logs esperados después de fix:
```
✅ Authenticated user: auth-uuid-123
✅ User id: users-uuid-456, company_id: company-uuid-789
🔄 Processing hide for stage stage-uuid-abc
✅ Stage "Pendiente" is generic
✅ Stage hidden successfully
```

---

## 🎯 Siguiente acción

```bash
bash redeploy-hide-stage.sh
```

Luego probar desde UI. ¡Ahora debe funcionar completamente! 🚀

---

**Fixes aplicados**: 2025-10-17  
**Archivo**: `supabase/functions/hide-stage/index.ts`  
**Cambios**:
1. `.select("id, company_id")` en lugar de solo `company_id`
2. `.eq("auth_user_id", user.id)` en lugar de `.eq("id", user.id)`
3. `hidden_by: userId` en lugar de `hidden_by: user.id`
