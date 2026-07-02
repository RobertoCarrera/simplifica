-- Rafter v0.57b: fix OLD.assigned_to in handle_global_audit trigger
-- Date: 2026-06-29
--
-- The v0.51 filter (20260624_filter_bookings_update_audit.sql)
-- references `OLD.assigned_to` in its has_meaningful_change check,
-- but the `bookings` table does NOT have an `assigned_to` column
-- (it was renamed to `professional_id` at some point and the trigger
-- was never updated).
--
-- Every UPDATE on a bookings row errors with:
--   "record 'old' has no field 'assigned_to'" (SQLSTATE 42703)
--
-- This blocks the v0.51 filter from ever writing legitimate status
-- changes to audit_logs. The trigger compiles because the column
-- reference is in a string only executed at runtime.
--
-- Also: `professional_id` and `resource_id` were missing from the
-- meaningful-change list, so legitimate professional/resource changes
-- were also being skipped. Now both are tracked.
--
-- This migration:
-- 1. Replaces the function with a corrected version (no assigned_to)
-- 2. Adds professional_id and resource_id to the meaningful-change list
-- 3. Documents the bug in the COMMENT ON FUNCTION

CREATE OR REPLACE FUNCTION public.handle_global_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'temp'
AS $function$
DECLARE
    audit_action TEXT;
    audit_user_id UUID;
    audit_client_ip TEXT;
    headers JSON;
    old_record JSONB;
    new_record JSONB;
    diff_columns JSONB;
    has_meaningful_change BOOLEAN := false;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

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

    audit_user_id := auth.uid();

    IF TG_OP = 'INSERT' THEN
        audit_action := 'INSERT';
        new_record := to_jsonb(NEW);
        old_record := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        IF to_jsonb(NEW) = to_jsonb(OLD) THEN
            RETURN NULL;
        END IF;

        -- Rafter v0.57b: removed OLD.assigned_to (column was renamed to
        -- professional_id and never updated in the trigger). Also added
        -- professional_id and resource_id to the meaningful-change list
        -- since those are the actual columns in the bookings table.
        IF TG_TABLE_NAME = 'bookings' THEN
            has_meaningful_change :=
                (OLD.status                IS DISTINCT FROM NEW.status) OR
                (OLD.professional_id       IS DISTINCT FROM NEW.professional_id) OR
                (OLD.resource_id           IS DISTINCT FROM NEW.resource_id) OR
                (OLD.start_time            IS DISTINCT FROM NEW.start_time) OR
                (OLD.end_time              IS DISTINCT FROM NEW.end_time) OR
                (OLD.cancelled_at          IS DISTINCT FROM NEW.cancelled_at) OR
                (OLD.payment_status        IS DISTINCT FROM NEW.payment_status) OR
                (OLD.payment_method        IS DISTINCT FROM NEW.payment_method) OR
                (OLD.notes                 IS DISTINCT FROM NEW.notes) OR
                (OLD.client_id             IS DISTINCT FROM NEW.client_id);
            IF NOT has_meaningful_change THEN
                RETURN NULL;
            END IF;
        END IF;

        audit_action := 'UPDATE';
        new_record := to_jsonb(NEW);
        old_record := to_jsonb(OLD);

        SELECT jsonb_object_agg(key, jsonb_build_object('old', old_record->key, 'new', new_record->key))
        INTO diff_columns
        FROM jsonb_each(old_record) old_kv
        JOIN LATERAL (
            SELECT key FROM jsonb_each(new_record) WHERE key = old_kv.key
        ) new_kv USING (key)
        WHERE old_record->key IS DISTINCT FROM new_record->key;
    ELSIF TG_OP = 'DELETE' THEN
        audit_action := 'DELETE';
        new_record := NULL;
        old_record := to_jsonb(OLD);
    END IF;

    INSERT INTO public.audit_logs (
        company_id, actor_id, actor_email, action, entity_type, entity_id,
        ip_address, user_agent, old_data, new_data
    ) VALUES (
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
$function$;

COMMENT ON FUNCTION public.handle_global_audit() IS
'Global audit trigger. v0.57b removes the dead reference to
OLD.assigned_to (column was renamed to professional_id at some
point but the trigger was never updated). Every bookings UPDATE
was erroring with SQLSTATE 42703, blocking the v0.51 filter from
recording real status changes. Now status, professional_id,
resource_id, start_time, end_time, cancelled_at, payment_status,
payment_method, notes, client_id are all tracked.';
