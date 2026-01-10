-- Migration: Refactor Roles to Table
-- Description: Moves role definitions from text constraints to a dedicated `app_roles` table.

-- 1. Create app_roles table
CREATE TABLE IF NOT EXISTS public.app_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE, -- internal key: 'super_admin', 'owner', 'admin', 'member', etc.
    label TEXT NOT NULL,       -- display name: 'Super Admin', 'Propietario', etc.
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Roles are viewable by authenticated users" ON public.app_roles
    FOR SELECT USING (auth.role() = 'authenticated');

-- 2. Seed Initial Roles
INSERT INTO public.app_roles (name, label, description) VALUES
    ('super_admin', 'Super Administrador', 'Administrador global del sistema'),
    ('owner', 'Propietario', 'Dueño de la empresa'),
    ('admin', 'Administrador', 'Administrador de la empresa'),
    ('member', 'Miembro', 'Empleado regular'),
    ('professional', 'Profesional', 'Prestador de servicios'),
    ('agent', 'Agente', 'Agente comercial'),
    ('client', 'Cliente', 'Cliente final')
ON CONFLICT (name) DO NOTHING;

-- 3. Add column to public.users (Global Role)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS app_role_id UUID REFERENCES public.app_roles(id);

-- 4. Add column to public.company_members (Context Role)
ALTER TABLE public.company_members ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.app_roles(id);

-- 5. Data Migration: company_members
-- Map existing text roles to role_ids
DO $$
DECLARE
    r_owner UUID;
    r_admin UUID;
    r_member UUID;
    r_client UUID;
    r_professional UUID;
    r_agent UUID;
BEGIN
    SELECT id INTO r_owner FROM public.app_roles WHERE name = 'owner';
    SELECT id INTO r_admin FROM public.app_roles WHERE name = 'admin';
    SELECT id INTO r_member FROM public.app_roles WHERE name = 'member';
    SELECT id INTO r_client FROM public.app_roles WHERE name = 'client';
    SELECT id INTO r_professional FROM public.app_roles WHERE name = 'professional';
    SELECT id INTO r_agent FROM public.app_roles WHERE name = 'agent';

    UPDATE public.company_members SET role_id = r_owner WHERE role = 'owner';
    UPDATE public.company_members SET role_id = r_admin WHERE role = 'admin';
    UPDATE public.company_members SET role_id = r_member WHERE role = 'member';
    UPDATE public.company_members SET role_id = r_client WHERE role = 'client';
    UPDATE public.company_members SET role_id = r_professional WHERE role = 'professional';
    UPDATE public.company_members SET role_id = r_agent WHERE role = 'agent';
    -- Fallback for any unknown
    UPDATE public.company_members SET role_id = r_member WHERE role_id IS NULL AND role IS NOT NULL;
END $$;

-- 6. Data Migration: public.users (Global Role)
-- Map existing text roles to app_role_id
DO $$
DECLARE
    r_super_admin UUID;
    r_owner UUID;
    r_member UUID;
BEGIN
    SELECT id INTO r_super_admin FROM public.app_roles WHERE name = 'super_admin';
    SELECT id INTO r_owner FROM public.app_roles WHERE name = 'owner';
    SELECT id INTO r_member FROM public.app_roles WHERE name = 'member';

    -- Previously users.role had 'owner', 'admin' etc. 
    -- Make 'admin' in users table -> 'super_admin' in app_roles? 
    -- No, currently users.role = 'owner' for Roberto. 
    -- But Roberto wants to be super Admin.
    
    -- General migration:
    UPDATE public.users SET app_role_id = (SELECT id FROM public.app_roles WHERE name = users.role) WHERE role IS NOT NULL AND role != 'admin';
    
    -- Special case: 'admin' in public.users was treated as 'super_admin' by AuthService code logic
    UPDATE public.users SET app_role_id = r_super_admin WHERE role = 'admin';

    -- Ensure Roberto is Super Admin (Update by specific logic if needed, or rely on manual fix later)
    -- We will handle Roberto specifically in a separate block or relying on his previous role 'owner' being migrated to 'owner'
    -- but we want him to be super_admin.
END $$;

-- 7. Specific Fix for Roberto (using known email)
DO $$
DECLARE
    v_role_super_admin UUID;
BEGIN
    SELECT id INTO v_role_super_admin FROM public.app_roles WHERE name = 'super_admin';
    
    UPDATE public.users 
    SET app_role_id = v_role_super_admin 
    WHERE email = 'robertocarreratech@gmail.com';
END $$;

-- 8. Add Foreign Key constraints and deprecate text columns (optional now, strict later)
-- We won't drop the columns yet to avoid breaking the App immediately.
-- But we can add a helper view or function to smooth the transition for RLS.

-- 9. Update role_permissions (Add role_id)
-- Note: role_permissions has 'role' text column.
ALTER TABLE public.role_permissions ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.app_roles(id);

-- Migrate role_permissions
UPDATE public.role_permissions rp
SET role_id = (SELECT id FROM public.app_roles ar WHERE ar.name = rp.role)
WHERE rp.role_id IS NULL;

-- 10. Update RLS policies on role_permissions to use role_id?
-- OR just leave them for now as they use text 'role'. 
-- We should keep using text role for RLS in the short term until code is updated.
