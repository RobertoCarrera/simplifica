-- Fix for Duplicate Audit Logs and Localhost IP in Auth Events

-- 1. Modify handle_global_audit to prevent recursive logging (recursion depth > 1)
-- This logic prevents the trigger from logging events caused by other triggers (e.g. stats updates)
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
    changes JSONB;
    headers JSON;
BEGIN
    -- DUPLICATION FIX: Prevent recursive logging
    -- If this trigger is fired by another trigger (depth > 1), we skip logging.
    -- This handles cases like 'update_client_stats_on_change' which updates the table again.
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    -- Get IP from headers if available (for better accuracy behind proxies), else fallback to connection IP
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

    -- Determine user (prioritize auth.uid(), fallback to legacy methods if needed)
    audit_user_id := auth.uid();

    -- Determine Action
    IF TG_OP = 'INSERT' THEN
        audit_action := 'INSERT';
        changes := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        audit_action := 'UPDATE';
        changes := to_jsonb(NEW); -- Storing full new row for now
    ELSIF TG_OP = 'DELETE' THEN
        audit_action := 'DELETE';
        changes := to_jsonb(OLD);
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
        content
    )
    VALUES (
        -- Try to extract company_id from the record if it exists
        COALESCE(
            (to_jsonb(NEW)->>'company_id')::uuid,
            (to_jsonb(OLD)->>'company_id')::uuid
        ),
        audit_user_id,
        (SELECT email FROM auth.users WHERE id = audit_user_id), -- Snapshot email
        audit_action,
        TG_TABLE_NAME, -- entity_type = table name
        COALESCE(NEW.id, OLD.id), -- entity_id
        audit_client_ip,
        current_setting('request.headers', true)::json->>'user-agent',
        changes
    );

    RETURN NULL;
END;
$$;

-- 2. Modify handle_auth_audit to fix IP address (Localhost issue)
CREATE OR REPLACE FUNCTION public.handle_auth_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    headers JSON;
    client_ip TEXT;
BEGIN
    -- Get IP from headers (Cloudflare/Supabase Proxy)
    BEGIN
        headers := current_setting('request.headers', true)::json;
        client_ip := COALESCE(
            headers->>'cf-connecting-ip',
            headers->>'x-forwarded-for',
            inet_client_addr()::text
        );
    EXCEPTION WHEN OTHERS THEN
        client_ip := inet_client_addr()::text;
    END;

    -- Track changes to last_sign_in_at (Login event)
    IF (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at) THEN
        INSERT INTO public.audit_logs (
            company_id,
            actor_id,
            actor_email,
            action,
            entity_type,
            entity_id,
            ip_address,
            user_agent
        )
        VALUES (
            NULL, -- Auth events are global/no company context
            NEW.id,
            NEW.email,
            'auth.login',
            'auth',
            NEW.id,
            client_ip, -- Use resolved IP
            headers->>'user-agent'
        );
    END IF;
    RETURN NEW;
END;
$$;
