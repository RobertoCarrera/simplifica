# 🧹 Limpieza Legacy Auth (`user_profiles`)

Este archivo lista tareas para completar la transición al modelo minimal `public.users` + `public.companies`.

## Estado Actual
- Nuevo servicio: `AuthService` refactorizado (sin dependencias a `user_profiles`).
- SQL base: `database/base-auth-structure.sql` activo.
- Archivos legacy marcados como deprecados.

## Checklist Limpieza
1. [x] Verificar que ninguna llamada en frontend consulte `user_profiles` vía RPC o vistas. (grep sin resultados activos en src/)
2. [x] Eliminar funciones SQL que referencien `user_profiles` (triggers/helpers legacy removidos o deprecados).
3. [ ] Migrar invitaciones para que creen fila en `users` (email, company_id, role, auth_user_id NULL) en lugar de insertar en otra tabla.
4. [x] Añadir política RLS opcional para que `owner|admin` pueda listar todos los usuarios de su `company_id` (creada en script drop final si se desea).
5. [x] Crear script de migración final que:
   - Copie datos útiles de `user_profiles` (full_name) a `users.name` si faltan
   - Verifique consistencia (emails únicos)
   - Dropee `user_profiles` y sus índices/policies.
6. [ ] Actualizar cualquier documentación externa (wiki interna / Notion) apuntando al nuevo modelo.

## Ejemplo Política Extendida (Pendiente)
```sql
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'users_select_company' AND tablename = 'users'
  ) THEN
    CREATE POLICY users_select_company ON public.users FOR SELECT USING (
      company_id IN (
        SELECT company_id FROM public.users WHERE auth_user_id = auth.uid() AND role IN ('owner','admin')
      ) OR auth_user_id = auth.uid()
    );
  END IF;
END $$;
```

## Invitaciones (Nueva Estrategia Simplificada)
1. Insert preliminar en `public.users` con: email, company_id, role deseado, auth_user_id NULL, active true.
2. Enviar email Supabase `auth.admin.inviteUserByEmail(email, { redirectTo })`.
3. Al confirmar el usuario: `ensureAppUser` detecta fila por email y rellena `auth_user_id`.

## Notas
- Evitar triggers automágicos hasta que la lógica de negocio esté estabilizada.
- Mantener scripts idempotentes y versionados incrementalmente.

---
Última actualización: 2025-09-09 (scripts finales creados, pendiente implementación flujo invitaciones y docs externas).