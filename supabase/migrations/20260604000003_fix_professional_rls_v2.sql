-- Migration: Fix RLS professional isolation — v2 (safe)
-- Date: 2026-06-03
-- v1 failed because it used JOIN (not LEFT JOIN) and only 3 roles
-- v2 preserves original LEFT JOIN + full role list for Path A
-- Path B is new: professional/member access via client_assignments/company_members
--
-- BACKUP: migrations/BACKUP_20260603_original_rls.sql

BEGIN;

-- =============================================================================
-- FIX 1: clients_select
-- Path A (unchanged from original, minus 'professional'): admins, owners, members,
--   agents, developers see all clients in their company — identical behavior
-- Path B (new): any staff user sees clients assigned to them via 
--   company_members → client_assignments
-- =============================================================================
DROP POLICY IF EXISTS "clients_select" ON public.clients;

CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = clients.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin', 'member', 'agent', 'developer')
  )
  OR
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.company_members cm 
      ON cm.user_id = u.id 
      AND cm.company_id = clients.company_id
      AND cm.status = 'active'
    JOIN public.client_assignments ca 
      ON ca.company_member_id = cm.id 
      AND ca.client_id = clients.id
    WHERE u.auth_user_id = auth.uid()
  )
);

-- =============================================================================
-- FIX 2: bookings_select
-- Path A: same role-based check — non-professionals see all company bookings
-- Path B: professionals see only bookings where professional_id = their own
-- =============================================================================
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;

CREATE POLICY "bookings_select" ON public.bookings FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = bookings.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin', 'member', 'agent', 'developer')
  )
  OR
  professional_id = public.get_auth_user_professional_id()
);

COMMIT;
