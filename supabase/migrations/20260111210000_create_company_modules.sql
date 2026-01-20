-- Migration: Create company_modules table and Admin RPCs
-- Date: 2026-01-11 12:35:00

-- 1. Create company_modules table
CREATE TABLE IF NOT EXISTS public.company_modules (
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL, -- Logical key, e.g. 'crm', 'accounting'
    status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (company_id, module_key)
);

-- Enable RLS
ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Super Admins can do everything
CREATE POLICY "Super Admins can manage company_modules" ON public.company_modules
    FOR ALL
    TO authenticated
    USING (public.is_super_admin(auth.uid()))
    WITH CHECK (public.is_super_admin(auth.uid()));

-- RLS Policy: Users can read their own company modules
CREATE POLICY "Users can view their own company modules" ON public.company_modules
    FOR SELECT
    TO authenticated
    USING (
        company_id = (SELECT company_id FROM public.users WHERE id = auth.uid()) 
        OR 
        public.is_super_admin(auth.uid())
    );


-- 2. RPC: admin_list_company_modules
-- Returns a list of all available modules (from catalog or implicit) and their status for the given company.
CREATE OR REPLACE FUNCTION public.admin_list_company_modules(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_modules JSONB;
BEGIN
    -- Check permissions
    IF NOT public.is_super_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access Denied: Super Admin only';
    END IF;

    -- Return generic modules merged with company status
    -- We assume current hardcoded modules or fetch from modules_catalog if robust.
    -- For now, let's join with existing user_modules or effective_modules logic?
    -- Actually, let's use the modules_catalog table we restored earlier.
    
    SELECT jsonb_agg(
        jsonb_build_object(
            'key', mc.key,
            'label', mc.label,
            'status', COALESCE(cm.status, 'inactive') -- Default to inactive if not present
        )
    )
    INTO v_modules
    FROM public.modules_catalog mc
    LEFT JOIN public.company_modules cm 
        ON mc.key = cm.module_key AND cm.company_id = p_company_id;

    RETURN jsonb_build_object('modules', COALESCE(v_modules, '[]'::jsonb));
END;
$$;


-- 3. RPC: admin_toggle_company_module
-- Sets the status of a module for a company
CREATE OR REPLACE FUNCTION public.admin_toggle_company_module(
    p_company_id UUID,
    p_module_key TEXT,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check permissions
    IF NOT public.is_super_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Access Denied: Super Admin only';
    END IF;

    IF p_status NOT IN ('active', 'inactive') THEN
         RAISE EXCEPTION 'Invalid status. Must be active or inactive';
    END IF;

    INSERT INTO public.company_modules (company_id, module_key, status, updated_at)
    VALUES (p_company_id, p_module_key, p_status, now())
    ON CONFLICT (company_id, module_key)
    DO UPDATE SET status = EXCLUDED.status, updated_at = now();

    RETURN jsonb_build_object('success', true);
END;
$$;
