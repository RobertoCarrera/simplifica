-- Fix company_invitations constraint
ALTER TABLE public.company_invitations DROP CONSTRAINT IF EXISTS company_invitations_role_check;
ALTER TABLE public.company_invitations ADD CONSTRAINT company_invitations_role_check 
    CHECK (role IN ('owner', 'admin', 'member', 'professional', 'agent'));

-- Company members uses app_roles now, skipping constraint

