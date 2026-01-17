-- [AUDIT SYSTEM PHASE 1]
-- 1. Create Audit Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL,
    actor_id UUID REFERENCES auth.users(id),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_audit_company_date ON public.audit_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs(entity_type, entity_id);

-- RLS: Only Admins/Owners can read. NO ONE can insert/update/delete properly via API.
-- Inserts happen via Security Definer Trigger.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view company audit logs" ON public.audit_logs
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.app_roles ar ON u.app_role_id = ar.id
        WHERE u.auth_user_id = auth.uid()
        AND u.company_id = audit_logs.company_id
        AND ar.name IN ('admin', 'owner', 'super_admin')
    )
);

-- 2. Generic Audit Trigger Function
CREATE OR REPLACE FUNCTION public.handle_global_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_old_data JSONB;
    v_new_data JSONB;
    v_action TEXT;
    v_company_id UUID;
    v_headers JSONB;
    v_ip TEXT;
    v_ua TEXT;
    v_entity_id TEXT;
BEGIN
    v_action := TG_OP;

    -- Extract Context (Best Effort)
    BEGIN
        v_headers := current_setting('request.headers', true)::jsonb;
        v_ip := v_headers ->> 'x-forwarded-for';
        v_ua := v_headers ->> 'user-agent';
    EXCEPTION WHEN OTHERS THEN
        v_ip := null;
        v_ua := null;
    END;

    -- Determine Data & Company ID
    IF (TG_OP = 'INSERT') THEN
        v_new_data := to_jsonb(NEW);
        v_old_data := null;
        
        IF TG_TABLE_NAME = 'companies' THEN
            v_company_id := NEW.id;
        ELSE
            v_company_id := NEW.company_id;
        END IF;
        
        v_entity_id := NEW.id::text;
        
    ELSIF (TG_OP = 'UPDATE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        
        IF TG_TABLE_NAME = 'companies' THEN
            v_company_id := OLD.id;
        ELSE
            v_company_id := OLD.company_id;
        END IF;
        
        v_entity_id := OLD.id::text;
        
    ELSIF (TG_OP = 'DELETE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := null;
        
        IF TG_TABLE_NAME = 'companies' THEN
            v_company_id := OLD.id;
        ELSE
            v_company_id := OLD.company_id;
        END IF;
        
        v_entity_id := OLD.id::text;
    END IF;

    -- Insert Log
    INSERT INTO public.audit_logs (
        company_id,
        actor_id,
        entity_type,
        entity_id,
        action,
        old_data,
        new_data,
        ip_address,
        user_agent
    ) VALUES (
        v_company_id,
        auth.uid(),
        TG_TABLE_NAME,
        v_entity_id,
        v_action,
        v_old_data,
        v_new_data,
        v_ip,
        v_ua
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- 3. Attach Triggers to Critical Tables
-- Drop first to allow re-runnability
DROP TRIGGER IF EXISTS audit_trigger_users ON public.users;
CREATE TRIGGER audit_trigger_users AFTER INSERT OR UPDATE OR DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.handle_global_audit();

DROP TRIGGER IF EXISTS audit_trigger_bookings ON public.bookings;
CREATE TRIGGER audit_trigger_bookings AFTER INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.handle_global_audit();

DROP TRIGGER IF EXISTS audit_trigger_invoices ON public.invoices;
CREATE TRIGGER audit_trigger_invoices AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.handle_global_audit();

DROP TRIGGER IF EXISTS audit_trigger_companies ON public.companies;
CREATE TRIGGER audit_trigger_companies AFTER INSERT OR UPDATE OR DELETE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.handle_global_audit();

DROP TRIGGER IF EXISTS audit_trigger_verifactu ON public.verifactu_settings;
CREATE TRIGGER audit_trigger_verifactu AFTER INSERT OR UPDATE OR DELETE ON public.verifactu_settings
FOR EACH ROW EXECUTE FUNCTION public.handle_global_audit();
