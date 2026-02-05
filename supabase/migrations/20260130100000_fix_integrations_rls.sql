-- Fix RLS and Multi-tenancy for Integrations Table

-- 1. Add company_id column (nullable first to allow backfill)
ALTER TABLE public.integrations
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2. Backfill company_id from company_members
-- Heuristic: Pick the first active company found for the user.
UPDATE public.integrations
SET company_id = (
    SELECT company_id
    FROM public.company_members
    WHERE user_id = public.integrations.user_id
    LIMIT 1
)
WHERE company_id IS NULL;

-- 3. Enforce NOT NULL (after backfill)
-- Remove orphaned integrations that do not belong to any company
DELETE FROM public.integrations WHERE company_id IS NULL;

ALTER TABLE public.integrations
ALTER COLUMN company_id SET NOT NULL;

-- 4. Update RLS Policies
DROP POLICY IF EXISTS "Users can manage own integrations" ON public.integrations;

-- New Policy: Users can only manage integrations that belong to their company
CREATE POLICY "Company members can manage integrations"
    ON public.integrations FOR ALL
    USING (
        company_id IN (
            SELECT company_id FROM public.company_members
            WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
    )
    WITH CHECK (
        company_id IN (
            SELECT company_id FROM public.company_members
            WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
    );
