-- Migration: Create in-app notification when a service is contracted
--
-- Fires AFTER INSERT on client_variant_assignments.
-- Notifies the assigned professional (or company admins if none assigned).

CREATE OR REPLACE FUNCTION public.notify_on_service_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_client_name   TEXT;
    v_company_id    UUID;
    v_service_name  TEXT;
    v_prof_user_id  UUID;
    v_admin         RECORD;
BEGIN
    -- 1. Get the client's name and company_id
    SELECT c.name, c.company_id
    INTO   v_client_name, v_company_id
    FROM   public.clients c
    WHERE  c.id = NEW.client_id;

    IF v_company_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 2. Get the service name
    SELECT s.name
    INTO   v_service_name
    FROM   public.services s
    WHERE  s.id = NEW.service_id;

    IF v_service_name IS NULL THEN
        RETURN NEW;
    END IF;

    -- Default client name when missing
    IF v_client_name IS NULL OR v_client_name = '' THEN
        v_client_name := 'Un cliente';
    END IF;

    -- 3. Find the assigned professional for this client
    --    client_assignments uses company_member_id (not professional_id),
    --    so we join through company_members → professionals.
    SELECT p.user_id
    INTO   v_prof_user_id
    FROM   public.client_assignments ca
    JOIN   public.company_members cm ON cm.id = ca.company_member_id
    JOIN   public.professionals p    ON p.user_id = cm.user_id
                                     AND p.company_id = cm.company_id
    WHERE  ca.client_id = NEW.client_id
    AND    p.user_id IS NOT NULL
    LIMIT  1;

    IF v_prof_user_id IS NOT NULL THEN
        -- 4. Notify the assigned professional
        INSERT INTO public.notifications
            (recipient_id, company_id, type, title, content, reference_id, metadata, is_read)
        VALUES
            (v_prof_user_id,
             v_company_id,
             'service_contracted',
             'Nuevo servicio contratado',
             v_client_name || ' ha contratado ' || v_service_name,
             NEW.id::text,
             jsonb_build_object(
                 'service_id', NEW.service_id,
                 'variant_id', NEW.variant_id,
                 'client_id',  NEW.client_id
             ),
             false);
    ELSE
        -- 5. No professional assigned → notify company admins/owners
        FOR v_admin IN
            SELECT cm.user_id
            FROM   public.company_members cm
            JOIN   public.app_roles ar ON ar.id = cm.role_id
            WHERE  cm.company_id = v_company_id
            AND    ar.name IN ('owner', 'admin', 'super_admin')
            AND    cm.status = 'active'
        LOOP
            INSERT INTO public.notifications
                (recipient_id, company_id, type, title, content, reference_id, metadata, is_read)
            VALUES
                (v_admin.user_id,
                 v_company_id,
                 'service_contracted',
                 'Nuevo servicio contratado',
                 v_client_name || ' ha contratado ' || v_service_name,
                 NEW.id::text,
                 jsonb_build_object(
                     'service_id', NEW.service_id,
                     'variant_id', NEW.variant_id,
                     'client_id',  NEW.client_id
                 ),
                 false);
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

-- Attach the trigger
DROP TRIGGER IF EXISTS trg_notify_on_service_contract ON public.client_variant_assignments;
CREATE TRIGGER trg_notify_on_service_contract
    AFTER INSERT ON public.client_variant_assignments
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_on_service_contract();
