-- 1. Add unique constraint to user_modules to allow clean upsert logic
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_modules_user_id_module_key_key' 
        AND conrelid = 'public.user_modules'::regclass
    ) THEN
        ALTER TABLE public.user_modules ADD CONSTRAINT user_modules_user_id_module_key_key UNIQUE (user_id, module_key);
    END IF;
END $$;

-- 2. Create the admin_set_user_module RPC
CREATE OR REPLACE FUNCTION public.admin_set_user_module(
    p_target_user_id uuid,
    p_module_key text,
    p_status text -- 'activado' | 'desactivado'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_role text;
    v_caller_company_id uuid;
    v_target_company_id uuid;
BEGIN
    -- 1. Get caller info
    SELECT role, company_id INTO v_caller_role, v_caller_company_id 
    FROM public.users WHERE id = auth.uid();
    
    -- 2. Basic Role check
    IF v_caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Access denied: insuficient privileges';
    END IF;

    -- 3. Get target user info
    SELECT company_id INTO v_target_company_id FROM public.users WHERE id = p_target_user_id;
    
    -- 4. Scope Check: If caller has a company, target must be in the same company
    IF v_caller_company_id IS NOT NULL THEN
        IF v_target_company_id IS NULL OR v_target_company_id <> v_caller_company_id THEN
            RAISE EXCEPTION 'Access denied: target user belongs to a different company or no company';
        END IF;
    END IF;
    -- Note: If v_caller_company_id IS NULL, we assume it's a platform-level admin who can manage anyone.

    -- 5. Upsert logic
    INSERT INTO public.user_modules (user_id, module_key, status, updated_at)
    VALUES (p_target_user_id, p_module_key, p_status, now())
    ON CONFLICT (user_id, module_key) 
    DO UPDATE SET 
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at;

    RETURN true;
END;
$$;
