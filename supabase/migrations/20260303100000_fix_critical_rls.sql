-- Fix Critical RLS Vulnerabilities
-- 1. payment_integrations: Cross-tenant leak fix
-- 2. item_tags: Public access fix + Schema hardening

-- ==============================================================================
-- 1. Fix payment_integrations RLS
-- ==============================================================================

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Re-create policies with explicit company_id check
CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id -- CRITICAL FIX
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

-- ==============================================================================
-- 2. Fix item_tags RLS
-- ==============================================================================

-- A. Add company_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'item_tags'
        AND column_name = 'company_id'
    ) THEN
        ALTER TABLE "public"."item_tags" ADD COLUMN "company_id" uuid;
    END IF;
END $$;

-- B. Backfill company_id from parent records
-- Clients
UPDATE public.item_tags it
SET company_id = c.company_id
FROM public.clients c
WHERE it.record_type = 'client'
  AND it.record_id = c.id
  AND it.company_id IS NULL;

-- Tickets
UPDATE public.item_tags it
SET company_id = t.company_id
FROM public.tickets t
WHERE it.record_type = 'ticket'
  AND it.record_id = t.id
  AND it.company_id IS NULL;

-- Services
UPDATE public.item_tags it
SET company_id = s.company_id
FROM public.services s
WHERE it.record_type = 'service'
  AND it.record_id = s.id
  AND it.company_id IS NULL;

-- C. Delete orphans (items where company_id could not be resolved)
DELETE FROM public.item_tags WHERE company_id IS NULL;

-- D. Enforce NOT NULL and FK
ALTER TABLE "public"."item_tags" ALTER COLUMN "company_id" SET NOT NULL;

IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_tags_company_id_fkey'
) THEN
    ALTER TABLE "public"."item_tags"
    ADD CONSTRAINT "item_tags_company_id_fkey"
    FOREIGN KEY ("company_id")
    REFERENCES "public"."companies"("id")
    ON DELETE CASCADE;
END IF;

-- E. Update RLS Policies to use company_id
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON "public"."item_tags";
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON "public"."item_tags";
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON "public"."item_tags";

CREATE POLICY "item_tags_select" ON "public"."item_tags" FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "item_tags_insert" ON "public"."item_tags" FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "item_tags_delete" ON "public"."item_tags" FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = item_tags.company_id
      AND u.deleted_at IS NULL
  )
);
