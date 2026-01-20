-- [AUDIT FIX]
-- 1. Add email column to snapshot the actor's identity (Resolves JOIN issues with auth schema)
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_email TEXT;

-- 2. Update Trigger to capture email
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
    v_actor_email TEXT;
BEGIN
    v_action := TG_OP;

    -- Extract Context
    BEGIN
        v_headers := current_setting('request.headers', true)::jsonb;
        v_ip := v_headers ->> 'x-forwarded-for';
        v_ua := v_headers ->> 'user-agent';
    EXCEPTION WHEN OTHERS THEN
        v_ip := null;
        v_ua := null;
    END;

    -- Fetch Actor Email (Snapshot)
    SELECT email INTO v_actor_email FROM auth.users WHERE id = auth.uid();

    -- Determine Data
    IF (TG_OP = 'INSERT') THEN
        v_new_data := to_jsonb(NEW);
        v_old_data := null;
        IF TG_TABLE_NAME = 'companies' THEN v_company_id := NEW.id; ELSE v_company_id := NEW.company_id; END IF;
        v_entity_id := NEW.id::text;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        IF TG_TABLE_NAME = 'companies' THEN v_company_id := OLD.id; ELSE v_company_id := OLD.company_id; END IF;
        v_entity_id := OLD.id::text;
    ELSIF (TG_OP = 'DELETE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := null;
        IF TG_TABLE_NAME = 'companies' THEN v_company_id := OLD.id; ELSE v_company_id := OLD.company_id; END IF;
        v_entity_id := OLD.id::text;
    END IF;

    INSERT INTO public.audit_logs (
        company_id,
        actor_id,
        actor_email, -- New
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
        v_actor_email, -- New
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
