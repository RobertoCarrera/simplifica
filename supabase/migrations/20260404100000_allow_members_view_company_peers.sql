-- Fix: Equip tab (client-team-access) only showing 1 member for non-admin users.
--
-- Root cause: The company_members SELECT RLS only had two policies:
--   1. "Company admins can view members" — Admins see all members of their company
--   2. "Users can view own memberships" — Non-admins see ONLY their own row
--
-- When a professional or member opens the Equip tab, PostgREST returns only
-- their own company_member row, so the component renders only themselves.
--
-- Fix: Add a policy allowing any active company member to see all other members
-- in their company. Peers need visibility for assignment flows and team coordination.
-- Management (INSERT/UPDATE/DELETE) remains restricted to admins only.

-- Fix: Equip tab (client-team-access) only showing users with app accounts,
-- not all professionals. Root cause: client_assignments referenced company_members
-- (only 3 users with login), but the professionals table has all 8 team members.
--
-- Changes:
--   1. Add professional_id to client_assignments (references professionals.id)
--   2. Migrate existing rows via user_id match
--   3. Make company_member_id nullable (backward compat)
--   4. Update RLS on client_assignments to use professional_id
--   5. Add RLS on company_members: members can view company peers (via get_my_company_ids)

-- 1. Add professional_id column
ALTER TABLE public.client_assignments
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE;

-- 2. Migrate existing assignments: match company_members.user_id → professionals.user_id
UPDATE public.client_assignments ca
SET professional_id = p.id
FROM public.company_members cm
JOIN public.professionals p ON p.user_id = cm.user_id AND p.company_id = cm.company_id
WHERE ca.company_member_id = cm.id
  AND ca.professional_id IS NULL
  AND cm.user_id IS NOT NULL;

-- 3. Make company_member_id nullable
ALTER TABLE public.client_assignments
  ALTER COLUMN company_member_id DROP NOT NULL;

-- 4. Update RLS on client_assignments
DROP POLICY IF EXISTS "Manage assignments" ON public.client_assignments;
DROP POLICY IF EXISTS "View assignments" ON public.client_assignments;

CREATE POLICY "Manage assignments"
  ON public.client_assignments
  FOR ALL
  USING (
    current_user_is_admin(
      (SELECT company_id FROM public.professionals WHERE id = client_assignments.professional_id)
    )
  );

CREATE POLICY "View assignments"
  ON public.client_assignments
  FOR SELECT
  USING (
    current_user_is_admin(
      (SELECT company_id FROM public.professionals WHERE id = client_assignments.professional_id)
    )
    OR
    professional_id IN (
      SELECT id FROM public.professionals WHERE user_id = get_my_public_id()
    )
  );

-- 5. Add peer-visibility policy on company_members.
-- Uses SECURITY DEFINER function get_my_company_ids() to avoid self-referential
-- recursion (which caused 500 errors when the inner query hit its own RLS).
CREATE POLICY "Members can view company peers"
  ON public.company_members
  FOR SELECT
  USING (
    company_id = ANY(get_my_company_ids())
  );

