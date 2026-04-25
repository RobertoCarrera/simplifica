-- ============================================================
-- Fix storage upload policy for public-assets bucket (v2)
-- Date: 2026-04-16
-- Problem: storage_get_company_id() queries public.users.company_id,
--          which is NULL for company owners/admins who are linked to
--          a company exclusively via company_members (not users.company_id).
--          Result: the INSERT policy's WITH CHECK evaluates NULL = text → FALSE
--          → 400 "new row violates row-level security policy".
-- Fix: Replace the single-value function approach with EXISTS checks that
--      verify the user has an active membership in the target company via
--      EITHER users.company_id (legacy) OR company_members (current).
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'Storage schema not found, skipping';
    RETURN;
  END IF;

  -- ── INSERT ──────────────────────────────────────────────────────────────
  -- Use IN with UNION ALL to avoid name column ambiguity that occurs with EXISTS + JOIN.
  -- At top-level, `name` resolves to storage.objects.name (correct).
  -- Inside EXISTS + JOIN users, `name` would resolve to users.name (wrong).
  EXECUTE 'DROP POLICY IF EXISTS "Users can upload to own company folder in public-assets" ON storage.objects';
  EXECUTE $q$
    CREATE POLICY "Users can upload to own company folder in public-assets"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'public-assets'
        AND (storage.foldername(name))[1] IN (
          SELECT u.company_id::text
          FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.company_id IS NOT NULL
          UNION ALL
          SELECT cm.company_id::text
          FROM public.company_members cm
          JOIN public.users u ON u.id = cm.user_id
          WHERE u.auth_user_id = auth.uid()
            AND cm.status = 'active'
        )
      )
  $q$;

  -- ── UPDATE ──────────────────────────────────────────────────────────────
  EXECUTE 'DROP POLICY IF EXISTS "Users can update own company assets" ON storage.objects';
  EXECUTE $q$
    CREATE POLICY "Users can update own company assets"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'public-assets'
        AND (storage.foldername(name))[1] IN (
          SELECT u.company_id::text
          FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.company_id IS NOT NULL
          UNION ALL
          SELECT cm.company_id::text
          FROM public.company_members cm
          JOIN public.users u ON u.id = cm.user_id
          WHERE u.auth_user_id = auth.uid()
            AND cm.status = 'active'
        )
      )
  $q$;

  -- ── DELETE ──────────────────────────────────────────────────────────────
  EXECUTE 'DROP POLICY IF EXISTS "Users can delete own company assets" ON storage.objects';
  EXECUTE $q$
    CREATE POLICY "Users can delete own company assets"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'public-assets'
        AND (storage.foldername(name))[1] IN (
          SELECT u.company_id::text
          FROM public.users u
          WHERE u.auth_user_id = auth.uid()
            AND u.company_id IS NOT NULL
          UNION ALL
          SELECT cm.company_id::text
          FROM public.company_members cm
          JOIN public.users u ON u.id = cm.user_id
          WHERE u.auth_user_id = auth.uid()
            AND cm.status = 'active'
        )
      )
  $q$;
END;
$$;
