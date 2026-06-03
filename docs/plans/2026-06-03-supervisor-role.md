# Rol "Supervisor" — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Añadir el rol "supervisor" que permite a un usuario (robertocarrera@caibs.es) ser invitado a cualquier company de Simplifica y ver todo como si fuese owner.

**Architecture:** El rol `supervisor` ya existe en `app_roles` y en los tipos TypeScript. La implementación consiste en: (1) añadir `supervisor` a todas las RLS policies existentes para que tenga acceso de lectura total, (2) permitir invitaciones con rol `supervisor` desde el panel de admin, (3) asegurar que el flujo de cambio de company funcione para supervisores.

**Tech Stack:** Angular 21, Supabase (PostgreSQL + RLS), TypeScript

---

## Background

- **`app_roles`** ya tiene entrada `supervisor`
- **TypeScript** `AppUser.role` ya incluye `'supervisor'`
- **`hasPermission`** hierarchy ya incluye `'supervisor'` (nivel entre `member` y `admin`)
- **Company switching** ya funciona vía `companyMemberships`
- **Lo que falta**: RLS policies no incluyen `supervisor` → aunque el frontend reconozca el rol, la DB bloquea el acceso

---

## Task 1: Crear migración SQL que añada `supervisor` a todas las RLS policies

**Objective:** Una sola migración que modifique todas las RLS policies para incluir `'supervisor'` al mismo nivel que `'owner'` y `'admin'`.

**Files:**
- Create: `supabase/migrations/20260605000001_add_supervisor_to_rls.sql`

**Context:** Hay 73 referencias a `IN ('owner'` en 35 archivos de migración. El patrón común es:

```sql
ar.name IN ('owner','admin','super_admin','professional','member','agent','developer')
```

Debe convertirse en:

```sql
ar.name IN ('owner','admin','super_admin','supervisor','professional','member','agent','developer')
```

**Reglas:**
1. En TODAS las políticas SELECT, INSERT, UPDATE, DELETE: añadir `'supervisor'` junto a `'owner'` y `'admin'` (mismo nivel de acceso)
2. En RPCs con `SECURITY DEFINER` que chequean `v_user_role_name != 'owner'`: añadir también `AND v_user_role_name != 'supervisor'`
3. NO modificar las políticas que **excluyen** `'professional'` deliberadamente (Path A vs Path B en isolation v2)
4. Políticas que son solo para `'professional'`: NO añadir supervisor (los supervisores usan Path A)

**Step 1: Auditar todas las policies**

```bash
cd /home/ubuntu/simplifica
grep -rn "IN ('owner'" supabase/migrations/ --include='*.sql' | grep -v BACKUP
```

**Step 2: Crear la migración**

La migración debe ser un archivo SQL que haga ALTER POLICY o DROP + CREATE para cada policy.

Patrón para policies con rol en subquery:
```sql
-- Antes:
ar.name IN ('owner','admin','super_admin','member','agent','developer')

-- Después:
ar.name IN ('owner','admin','super_admin','supervisor','member','agent','developer')
```

Patrón para RPCs con role-gating:
```sql
-- Antes:
IF v_user_role_name != 'super_admin' AND v_user_role_name != 'owner' THEN

-- Después:
IF v_user_role_name != 'super_admin' AND v_user_role_name != 'owner' AND v_user_role_name != 'supervisor' THEN
```

**Step 3: Ejecutar contra la DB**

```bash
psql "postgresql://postgres.ufutyjbqfjrlzkprvyvs@aws-1-eu-west-3.pooler.supabase.com:6543/postgres?sslmode=require" \
  -f supabase/migrations/20260605000001_add_supervisor_to_rls.sql
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260605000001_add_supervisor_to_rls.sql
git commit -m "feat: add supervisor role to all RLS policies"
```

---

## Task 2: Añadir `supervisor` al dropdown de roles en el panel de invitaciones

**Objective:** Permitir que los owners/admins inviten usuarios con rol `supervisor`.

**Files:**
- Modify: `src/app/features/admin/invitations/user-invitations.component.ts`
- Modify: `src/app/features/admin/invitations/user-invitations.component.html`

**Context:** Actualmente el dropdown incluye: `member`, `professional`, `agent`, `marketer`, `client`, `admin`, `owner`. Hay que añadir `supervisor`.

**Step 1: Añadir 'supervisor' al array de roles en el TS**

Buscar la línea donde se define el array de roles disponibles (probablemente un array tipo `availableRoles` o similar) y añadir `'supervisor'`.

**Step 2: Verificar que el HTML lo renderiza**

El template probablemente usa `*ngFor` sobre el array — no debería necesitar cambios.

**Step 3: Build + commit**

```bash
cd /home/ubuntu/simplifica && npx ng build --configuration production
git add src/app/features/admin/invitations/
git commit -m "feat: add supervisor to invitation role dropdown"
```

---

## Task 3: Añadir `supervisor` al RPC `accept_company_invitation`

**Objective:** Cuando se acepta una invitación con rol `supervisor`, el RPC debe crear el `company_members` correctamente.

**Files:**
- Modify: `supabase/migrations/20260525000007_fix_professional_invitation_flow.sql` (o crear nueva migración)

**Context:** El RPC `accept_company_invitation` tiene lógica específica para `professional` (crea `professionals` row, activa módulos). Para `supervisor`:
- NO debe crear `professionals` row
- NO debe activar módulos
- Solo crear `company_members` con `role_id` = supervisor
- Tratarlo como un caso similar a `admin` o `member`

**Step 1: Leer el RPC actual**

```bash
read_file supabase/migrations/20260525000007_fix_professional_invitation_flow.sql
```

**Step 2: Crear migración que haga CREATE OR REPLACE con la lógica actualizada**

Añadir manejo para `supervisor`:
```sql
ELSIF v_role_name = 'supervisor' THEN
  -- Same as admin: just create company_members entry
  INSERT INTO public.company_members (user_id, company_id, role_id, status)
  VALUES (v_user_id, v_company_id, v_role_id, 'active')
  ON CONFLICT (user_id, company_id) DO UPDATE SET role_id = v_role_id, status = 'active';
```

**Step 3: Ejecutar migración + commit**

---

## Task 4: Verificar el flujo completo

**Objective:** Test end-to-end que un supervisor puede ser invitado, aceptar, y ver la company.

**Step 1: Invitar a robertocarrera@caibs.es como supervisor**

Usar el panel de admin → invitaciones → email: `robertocarrera@caibs.es`, rol: `supervisor`

**Step 2: Aceptar la invitación**

Navegar al link de invitación, aceptar.

**Step 3: Verificar cambio de company**

En el sidebar/header, cambiar a la company donde se es supervisor. Debería verse todo el contenido.

**Step 4: Verificar acceso a datos**

Navegar a:
- Reservas (calendario) — deberían verse bookings
- Clientes — deberían verse clientes
- Profesionales — deberían verse profesionales
- Configuración — acceso completo

---

## Notas

- **La migración RLS es el 90% del trabajo** — 73 policies en 35 archivos
- El rol `supervisor` YA existe en la DB y en TS types — no hay que crearlo
- El cambio de company YA funciona — solo necesita que RLS deje pasar al supervisor
- No se necesita modificar el `hasPermission` hierarchy — ya incluye supervisor
- No se necesita crear `company_supervisors` table separada — usamos `company_members` existente
