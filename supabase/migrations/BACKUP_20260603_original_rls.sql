-- BACKUP: Original RLS policies before professional isolation fix (2026-06-03)
-- To restore: run this entire file in Supabase SQL Editor

BEGIN;

-- bookings_select (original OR-based)
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;
CREATE POLICY "bookings_select" ON public.bookings FOR SELECT USING (
  (company_id = get_auth_user_company_id())
  OR
  (professional_id = public.get_auth_user_professional_id())
);

-- clients_select (original permissive)
DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin', 'professional', 'member', 'agent', 'developer')
      AND u.company_id = clients.company_id
  )
);

COMMIT;
