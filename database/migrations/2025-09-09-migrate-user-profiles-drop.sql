-- =============================================================
-- MIGRACIÓN user_profiles -> users Y DROP FINAL - 2025-09-09
-- Ejecutar SOLO si aún existe public.user_profiles.
-- Seguro para múltiples ejecuciones (idempotencia básica).
-- =============================================================

-- 0. Salir si la tabla no existe
DO $$ BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN
    RAISE NOTICE 'Tabla user_profiles no existe, nada que migrar';
  END IF;
END $$;

-- 1. Insertar usuarios faltantes
INSERT INTO public.users (email, name, role, active, company_id, auth_user_id, permissions)
SELECT up.email,
       NULLIF(up.full_name,'') AS name,
       CASE 
         WHEN up.role IN ('admin','manager') THEN 'admin'
         WHEN up.role = 'viewer' THEN 'member'
         WHEN up.role = 'owner' THEN 'owner' -- por si se usó label previo
         ELSE 'member'
       END AS role,
       COALESCE(up.is_active, true) AS active,
       up.company_id,
       up.id AS auth_user_id,
       '{}'::jsonb
FROM public.user_profiles up
LEFT JOIN public.users u ON u.email = up.email
WHERE u.id IS NULL
ON CONFLICT (email) DO NOTHING;

-- 2. Completar nombres donde falten
UPDATE public.users u
SET name = COALESCE(NULLIF(up.full_name,''), u.name)
FROM public.user_profiles up
WHERE u.email = up.email
  AND (u.name IS NULL OR u.name = '')
  AND up.full_name IS NOT NULL;

-- 3. Enlazar auth_user_id donde esté NULL
UPDATE public.users u
SET auth_user_id = up.id
FROM public.user_profiles up
WHERE u.email = up.email
  AND u.auth_user_id IS NULL;

-- 4. Normalizar roles inválidos
UPDATE public.users
SET role = 'member'
WHERE role NOT IN ('owner','admin','member') OR role IS NULL;

-- 5. Asegurar UNIQUE(auth_user_id) si no existe (ignorando si ya está)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.users'::regclass AND conname = 'users_auth_user_id_key'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.users ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id)';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'No se pudo crear UNIQUE(auth_user_id) (posible duplicado), revisar manualmente.';
    END;
  END IF;
END $$;

-- 6. Verificar posibles conflictos (emails duplicados / auth_user redundante)
SELECT 'DUPLICATED_EMAILS' AS check, email, COUNT(*)
FROM public.users GROUP BY email HAVING COUNT(*)>1;

SELECT 'DUPLICATED_AUTH_USER' AS check, auth_user_id, COUNT(*)
FROM public.users WHERE auth_user_id IS NOT NULL GROUP BY auth_user_id HAVING COUNT(*)>1;

-- 7. (Opcional) Mostrar usuarios migrados recientemente (último minuto)
SELECT 'RECENTLY_MIGRATED' AS tag, id, email, role, company_id, created_at
FROM public.users
WHERE created_at > now() - interval '1 minute';

-- 8. Dropear tabla legacy (descomentar cuando verificado)
-- DROP TABLE public.user_profiles CASCADE;  -- <- Descomentar tras comprobar pasos 6

-- 9. Limpiar funciones antiguas si dependían de user_profiles (ahora wrappers ya simples)
-- (Mantener por compatibilidad si el código aún las llama.)

-- 10. Verificación final simple
SELECT json_build_object(
  'total_users', (SELECT COUNT(*) FROM public.users),
  'users_without_auth', (SELECT COUNT(*) FROM public.users WHERE auth_user_id IS NULL),
  'users_with_company', (SELECT COUNT(*) FROM public.users WHERE company_id IS NOT NULL)
) AS migration_state;

-- =============================================================
-- FIN
-- =============================================================
