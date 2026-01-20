-- Migration: Add 'tickets.assignable' Permission
-- Description: Adds 'tickets.assignable' permission to relevant roles to explicitly control who can be assigned to tickets.

DO $$
DECLARE
    r_owner UUID;
    r_admin UUID;
    r_member UUID;
    r_agent UUID;
    r_super_admin UUID;
    r_professional UUID;
BEGIN
    -- Get Role IDs
    SELECT id INTO r_owner FROM public.app_roles WHERE name = 'owner';
    SELECT id INTO r_admin FROM public.app_roles WHERE name = 'admin';
    SELECT id INTO r_member FROM public.app_roles WHERE name = 'member';
    SELECT id INTO r_agent FROM public.app_roles WHERE name = 'agent';
    SELECT id INTO r_super_admin FROM public.app_roles WHERE name = 'super_admin';
    SELECT id INTO r_professional FROM public.app_roles WHERE name = 'professional';

    -- Helper logic to insert permission if not exists
    -- OWNER
    IF r_owner IS NOT NULL THEN
        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'owner', 'tickets.assignable', r_owner
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_owner AND permission = 'tickets.assignable');
    END IF;

    -- ADMIN
    IF r_admin IS NOT NULL THEN
        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'admin', 'tickets.assignable', r_admin
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_admin AND permission = 'tickets.assignable');
    END IF;

    -- MEMBER
    IF r_member IS NOT NULL THEN
        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'member', 'tickets.assignable', r_member
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_member AND permission = 'tickets.assignable');
    END IF;
    
    -- AGENT
    IF r_agent IS NOT NULL THEN
        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'agent', 'tickets.assignable', r_agent
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_agent AND permission = 'tickets.assignable');
    END IF;

    -- PROFESSIONAL
    IF r_professional IS NOT NULL THEN
        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'professional', 'tickets.assignable', r_professional
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_professional AND permission = 'tickets.assignable');
    END IF;

    -- SUPER ADMIN
    IF r_super_admin IS NOT NULL THEN
         INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'super_admin', 'tickets.assignable', r_super_admin
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_super_admin AND permission = 'tickets.assignable');
    END IF;

END $$;
