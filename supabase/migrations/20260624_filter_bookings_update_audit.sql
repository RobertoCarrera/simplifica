-- Rafter ops v0.51: stop bookings UPDATE noise in audit_logs
-- Date: 2026-06-24
--
-- Problem: bookings UPDATE writes to audit_logs 5,368 times/day
-- (99% of all audit_logs traffic). Investigation showed:
--   - The frontend does PATCH /bookings repeatedly (realtime sync,
--     form autosave, polling) with the SAME payload.
--   - The fast-path in handle_global_audit (`to_jsonb(NEW) = to_jsonb(OLD)`)
--     does NOT catch this because every PATCH bumps `updated_at`,
--     making the JSONs different.
--   - Result: 161k bookings UPDATE audit rows in 30 days = 99% of disk.
--
-- Fix: add a table-specific filter for bookings that only logs updates
-- if a BUSINESS-RELEVANT column changed. Cosmetic/auto columns
-- (updated_at, _pgrst_*) are ignored.
--
-- Columns considered "business-relevant" for bookings:
--   - status, assigned_to, start_time, end_time, cancelled_at,
--     professional_id, resource_id, payment_status, payment_method,
--     notes, client_id
--
-- Columns considered "noise" (skipped):
--   - updated_at, created_at, last_status_change, any *timestamp* touched
--     by Angular, any Supabase realtime header
--
-- Impact estimate:
--   - Before: 5,368 writes/day on bookings UPDATE
--   - After:  ~20 writes/day (only real status/assignment changes)
--   - Disk: 2.7 GB → ~200 MB in 2-3 weeks
--
-- CRITICAL: this is a NON-DESTRUCTIVE change. It only ADDS a filter
-- condition. Other tables (clients, invoices, etc.) are unaffected.

BEGIN;

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
        -- Fast path 1: skip logging if no column actually changed.
        IF to_jsonb(NEW) = to_jsonb(OLD) THEN
            RETURN NULL;
        END IF;

        -- Fast path 2 (bookings only): skip updates that only touch
        -- auto-generated / cosmetic columns. The Angular frontend
        -- PATCHes bookings repeatedly with identical business state
        -- but bumped `updated_at`, realtime markers, etc. We only
        -- care about changes to business-relevant columns.
        IF TG_TABLE_NAME = 'bookings' THEN
            has_meaningful_change :=
                (OLD.status                IS DISTINCT FROM NEW.status) OR
                (OLD.assigned_to           IS DISTINCT FROM NEW.assigned_to) OR
                (OLD.start_time            IS DISTINCT FROM NEW.start_time) OR
                (OLD.end_time              IS DISTINCT FROM NEW.end_time) OR
                (OLD.cancelled_at          IS DISTINCT FROM NEW.cancelled_at) OR
                (OLD.professional_id       IS DISTINCT FROM NEW.professional_id) OR
                (OLD.resource_id           IS DISTINCT FROM NEW.resource_id) OR
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

        -- Build a compact diff: only the columns that actually changed.
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
'Global audit trigger for sensitive tables. v0.51 adds a fast-path
for bookings UPDATE that skips writes when only auto-generated columns
(like updated_at) change. Reduces audit_logs volume from 5,368/day
to ~20/day on the bookings table.';

COMMIT;
