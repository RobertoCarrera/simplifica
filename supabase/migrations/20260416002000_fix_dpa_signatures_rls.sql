-- Fix: dpa_signatures RLS policies only check company_members.
-- Users who completed onboarding before the search_path bug was fixed
-- (or via the registration trigger that silently fails due to missing `role` column)
-- have a company but no company_members record.
-- Expand both SELECT and INSERT to also accept users who own the company
-- via public.users.company_id (direct ownership fallback).

-- INSERT policy
DROP POLICY IF EXISTS dpa_signatures_insert_own_company ON public.dpa_signatures;

CREATE POLICY dpa_signatures_insert_own_company
ON public.dpa_signatures
FOR INSERT
TO public
WITH CHECK (
  -- via company_members (normal path)
  company_id IN (
    SELECT cm.company_id
    FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
  )
  OR
  -- via direct company ownership (fallback for users without company_members record)
  company_id IN (
    SELECT u.company_id
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.company_id IS NOT NULL
  )
);

-- SELECT policy
DROP POLICY IF EXISTS dpa_signatures_select_own_company ON public.dpa_signatures;

CREATE POLICY dpa_signatures_select_own_company
ON public.dpa_signatures
FOR SELECT
TO public
USING (
  company_id IN (
    SELECT cm.company_id
    FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
  )
  OR
  company_id IN (
    SELECT u.company_id
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.company_id IS NOT NULL
  )
);
