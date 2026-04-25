-- ============================================================
-- Fix storage upload policy for public-assets bucket
-- Date: 2026-04-15
-- Problem: The "Users can upload to own company folder in public-assets"
--          policy relies on get_user_company_id() (PL/pgSQL STABLE SECURITY DEFINER).
--          In Supabase Storage's RLS evaluation context, this function does not
--          always resolve correctly (returns NULL → policy check fails → 400 RLS error).
-- Fix: Create a dedicated SQL LANGUAGE function for storage RLS that is
--      inlineable by the query planner and replace the storage policies with it.
-- ============================================================

-- 1. Create a lightweight SQL function specifically for storage RLS checks.
--    SQL LANGUAGE functions are inlined by the planner — no PL/pgSQL overhead,
--    no execution context ambiguity in the storage layer.
CREATE OR REPLACE FUNCTION public.storage_get_company_id()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT company_id::text
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- 2. Refresh storage INSERT / UPDATE / DELETE policies for public-assets
--    to use the new inline-friendly function.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'Storage schema not found, skipping';
    RETURN;
  END IF;

  -- INSERT
  EXECUTE 'DROP POLICY IF EXISTS "Users can upload to own company folder in public-assets" ON storage.objects';
  EXECUTE $q$
    CREATE POLICY "Users can upload to own company folder in public-assets"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'public-assets'
        AND (storage.foldername(name))[1] = public.storage_get_company_id()
      )
  $q$;

  -- UPDATE
  EXECUTE 'DROP POLICY IF EXISTS "Users can update own company assets" ON storage.objects';
  EXECUTE $q$
    CREATE POLICY "Users can update own company assets"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'public-assets'
        AND (storage.foldername(name))[1] = public.storage_get_company_id()
      )
  $q$;

  -- DELETE
  EXECUTE 'DROP POLICY IF EXISTS "Users can delete own company assets" ON storage.objects';
  EXECUTE $q$
    CREATE POLICY "Users can delete own company assets"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'public-assets'
        AND (storage.foldername(name))[1] = public.storage_get_company_id()
      )
  $q$;
END;
$$;
