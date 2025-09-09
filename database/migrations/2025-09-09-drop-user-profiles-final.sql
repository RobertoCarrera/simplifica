-- =============================================================
-- DROP DEFINITIVO user_profiles (post-migración) - 2025-09-09
-- Ejecutar SOLO después de '2025-09-09-migrate-user-profiles-drop.sql' y validar duplicados.
-- Idempotente: verifica existencia antes de dropear.
-- Incluye (opcional) política extendida para que owners/admins vean usuarios de su compañía.
-- =============================================================
DO $$
DECLARE
  has_table boolean;
BEGIN
  SELECT to_regclass('public.user_profiles') IS NOT NULL INTO has_table;
  IF has_table THEN
    RAISE NOTICE 'Eliminando tabla legacy public.user_profiles ...';
    EXECUTE 'DROP TABLE public.user_profiles CASCADE';
  ELSE
    RAISE NOTICE 'Tabla public.user_profiles ya no existe.';
  END IF;
END $$;

-- Política extendida opcional (crear solo si NO existe ya y si se desea habilitar listados por company)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='users' AND policyname='users_select_company'
  ) THEN
    -- Usar un tag de dollar-quote distinto al del bloque DO para evitar terminar el bloque antes de tiempo
    EXECUTE $POLICY$CREATE POLICY users_select_company ON public.users
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.users u2
          WHERE u2.auth_user_id = auth.uid()
            AND u2.company_id = users.company_id
            AND u2.role IN ('owner','admin')
        )
      )$POLICY$;
    RAISE NOTICE 'Policy users_select_company creada (owners/admins ven usuarios de su compañía).';
  ELSE
    RAISE NOTICE 'Policy users_select_company ya existe, no se recrea.';
  END IF;
END $$;

-- Estado final
SELECT json_build_object(
  'user_profiles_exists', to_regclass('public.user_profiles') IS NOT NULL,
  'policies_users', (SELECT json_agg(policyname ORDER BY policyname) FROM pg_policies WHERE tablename='users')
) AS drop_state;
-- =============================================================
