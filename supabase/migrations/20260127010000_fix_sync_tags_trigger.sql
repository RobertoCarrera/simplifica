-- Fix sync_ticket_tags_from_services function to use correct table names
-- Replaces references to non-existent 'ticket_tag_relations', 'service_tag_relations'
-- with 'tickets_tags', 'services_tags', and 'global_tags'

CREATE OR REPLACE FUNCTION public.sync_ticket_tags_from_services()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Cuando se crea un ticket_service, sincronizar tags del servicio al ticket
    IF TG_OP = 'INSERT' THEN
        -- Agregar tags del servicio al ticket si no existen
        INSERT INTO tickets_tags (ticket_id, tag_id)
        SELECT 
            NEW.ticket_id,
            st.tag_id
        FROM services_tags st
        JOIN global_tags gt ON st.tag_id = gt.id
        WHERE st.service_id = NEW.service_id
        AND NOT EXISTS (
            SELECT 1 FROM tickets_tags tt 
            WHERE tt.ticket_id = NEW.ticket_id 
            AND tt.tag_id = st.tag_id
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$function$;
