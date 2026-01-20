-- Migration: 20260126161500_fix_tickets_rls.sql

-- 1. Drop the dangerous policy (allows any user with company_id to see all tickets)
DROP POLICY IF EXISTS "tickets_select_company_only" ON public.tickets;

-- 2. Re-create it RESTRICTED to internal users (Staff/Admin) only
-- We check if the current auth user exists in public.users for this company
CREATE POLICY "staff_can_view_company_tickets"
ON public.tickets
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = tickets.company_id
      AND u.active = true
  )
);

-- Note: "clients_can_view_own_tickets" already exists and handles the Client side safely.
