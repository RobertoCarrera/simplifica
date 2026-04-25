-- Fix clients_tags RLS policies to support multi-company members
-- Root cause: users can be members of multiple companies via company_members table,
-- but get_user_company_id() only returns the JWT/primary company. When a user
-- operates in a secondary company, the old policy blocked INSERTs with 403.

DROP POLICY IF EXISTS "Members can manage own company client tags" ON public.clients_tags;
DROP POLICY IF EXISTS "Members can view own company client tags" ON public.clients_tags;

-- ALL policy: covers INSERT (with implicit WITH CHECK), UPDATE, DELETE
CREATE POLICY "Members can manage own company client tags"
ON public.clients_tags
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = clients_tags.client_id
    AND (
      c.company_id = get_user_company_id()
      OR public.is_company_member(c.company_id)
    )
  )
);

-- SELECT policy (explicit, for clarity)
CREATE POLICY "Members can view own company client tags"
ON public.clients_tags
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = clients_tags.client_id
    AND (
      c.company_id = get_user_company_id()
      OR public.is_company_member(c.company_id)
    )
  )
);
