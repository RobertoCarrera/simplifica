-- Fix Audit Log Column Mismatch (content -> old_data, new_data)

CREATE OR REPLACE FUNCTION public.handle_global_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    audit_action TEXT;
    audit_user_id UUID;
    audit_client_ip TEXT;
    headers JSON;
    old_record JSONB;
    new_record JSONB;
BEGIN
    -- DUPLICATION FIX: Prevent recursive logging
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    -- Get IP from headers
    BEGIN
        headers := current_setting('request.headers', true)::json;
        audit_client_ip := COALESCE(
            headers->>'cf-connecting-ip',
            headers->>'x-forwarded-for',
            inet_client_addr()::text
        );
    EXCEPTION WHEN OTHERS THEN
        audit_client_ip := inet_client_addr()::text;
    END;

    -- Determine user
    audit_user_id := auth.uid();

    -- Determine Action and payloads
    IF TG_OP = 'INSERT' THEN
        audit_action := 'INSERT';
        new_record := to_jsonb(NEW);
        old_record := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        audit_action := 'UPDATE';
        new_record := to_jsonb(NEW);
        old_record := to_jsonb(OLD);
    ELSIF TG_OP = 'DELETE' THEN
        audit_action := 'DELETE';
        new_record := NULL;
        old_record := to_jsonb(OLD);
    END IF;

    INSERT INTO public.audit_logs (
        company_id,
        actor_id,
        actor_email,
        action,
        entity_type,
        entity_id,
        ip_address,
        user_agent,
        old_data,
        new_data
    )
    VALUES (
        COALESCE(
            (to_jsonb(NEW)->>'company_id')::uuid,
            (to_jsonb(OLD)->>'company_id')::uuid
        ),
        audit_user_id,
        (SELECT email FROM auth.users WHERE id = audit_user_id),
        audit_action,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        audit_client_ip,
        current_setting('request.headers', true)::json->>'user-agent',
        old_record,
        new_record
    );

    RETURN NULL;
END;
$$;
