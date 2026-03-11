-- Migration: Fix missing RLS policies on company_invitations
-- Date: 2026-03-07

CREATE POLICY "Owners and admins can delete invitations" ON public.company_invitations FOR DELETE USING (public.has_company_permission(company_id, ARRAY['owner', 'admin']));
CREATE POLICY "Owners and admins can insert invitations" ON public.company_invitations FOR INSERT WITH CHECK (public.has_company_permission(company_id, ARRAY['owner', 'admin']));
