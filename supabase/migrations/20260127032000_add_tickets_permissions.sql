-- Migration: Add Tickets Permissions to Role Permissions
-- Description: Adds 'tickets.manage' and 'tickets.view' permissions to relevant roles to enable assignee filtering.

DO $$
DECLARE
    r_owner UUID;
    r_admin UUID;
    r_member UUID;
    r_agent UUID;
    r_super_admin UUID;
BEGIN
    -- Get Role IDs
    SELECT id INTO r_owner FROM public.app_roles WHERE name = 'owner';
    SELECT id INTO r_admin FROM public.app_roles WHERE name = 'admin';
    SELECT id INTO r_member FROM public.app_roles WHERE name = 'member';
    SELECT id INTO r_agent FROM public.app_roles WHERE name = 'agent';
    SELECT id INTO r_super_admin FROM public.app_roles WHERE name = 'super_admin';

    -- Insert Permissions (using ON CONFLICT DO NOTHING to avoid duplicates)
    -- We assume the table has a constraint on (role_id, permission) or (role, permission)
    -- Since we don't know the exact constraint name, we'll check existence first or use simple Inserts.
    -- However, standard practice is just INSERT explicitly for role_id.
    
    -- OWNER
    IF r_owner IS NOT NULL THEN
        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'owner', 'tickets.manage', r_owner
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_owner AND permission = 'tickets.manage');
        
        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'owner', 'tickets.view', r_owner
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_owner AND permission = 'tickets.view');
    END IF;

    -- ADMIN
    IF r_admin IS NOT NULL THEN
        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'admin', 'tickets.manage', r_admin
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_admin AND permission = 'tickets.manage');

        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'admin', 'tickets.view', r_admin
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_admin AND permission = 'tickets.view');
    END IF;

    -- MEMBER
    IF r_member IS NOT NULL THEN
        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'member', 'tickets.manage', r_member
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_member AND permission = 'tickets.manage');

        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'member', 'tickets.view', r_member
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_member AND permission = 'tickets.view');
    END IF;
    
    -- AGENT
    IF r_agent IS NOT NULL THEN
        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'agent', 'tickets.manage', r_agent
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_agent AND permission = 'tickets.manage');

        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'agent', 'tickets.view', r_agent
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_agent AND permission = 'tickets.view');
    END IF;

    -- SUPER ADMIN (Just in case)
    IF r_super_admin IS NOT NULL THEN
         INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'super_admin', 'tickets.manage', r_super_admin
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_super_admin AND permission = 'tickets.manage');

        INSERT INTO public.role_permissions (role, permission, role_id)
        SELECT 'super_admin', 'tickets.view', r_super_admin
        WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role_id = r_super_admin AND permission = 'tickets.view');
    END IF;

END $$;
