-- Migration: Create Contract Service RPC (placeholder for complex logic)
-- This RPC allows the frontend to contract a service even if the Edge Function is down or restricted.
-- It creates a Ticket for the staff to process the contract manually.

CREATE OR REPLACE FUNCTION contract_service_rpc(
  p_service_id UUID,
  p_variant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_client_id uuid;
    v_company_id uuid;
    v_service_name text;
    v_variant_name text;
    v_ticket_id uuid;
    v_description text;
    v_stage_id uuid;
BEGIN
    -- 1. Identify Client & Company from Auth User
    SELECT id, company_id INTO v_client_id, v_company_id
    FROM public.clients
    WHERE auth_user_id = v_user_id
    LIMIT 1;

    IF v_client_id IS NULL THEN
        RAISE EXCEPTION 'User is not a registered client' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Get Service Info
    SELECT name INTO v_service_name
    FROM public.services
    WHERE id = p_service_id;

    IF v_service_name IS NULL THEN
        RAISE EXCEPTION 'Service not found' USING ERRCODE = 'P0002';
    END IF;

    -- 3. Get Variant Info (Optional)
    IF p_variant_id IS NOT NULL THEN
        SELECT name INTO v_variant_name
        FROM public.service_variants
        WHERE id = p_variant_id;
    END IF;

    -- 4. Construct Description
    v_description := 'Solicitud de contratación de servicio: ' || v_service_name;
    IF v_variant_name IS NOT NULL THEN
        v_description := v_description || E'\nVariante: ' || v_variant_name;
    END IF;
    v_description := v_description || E'\n\n(Generado automáticamente por RPC. Por favor, procesar manualmente la factura/presupuesto).';

    -- 5. Find Default Stage (lowest position)
    SELECT id INTO v_stage_id
    FROM public.ticket_stages
    WHERE deleted_at IS NULL
    ORDER BY position ASC, created_at ASC
    LIMIT 1;

    -- 6. Create Ticket
    INSERT INTO public.tickets (
        company_id,
        client_id,
        title,
        description,
        priority,
        stage_id,
        is_opened,
        created_at,
        updated_at
        -- device_id not relevant for services usually
    ) VALUES (
        v_company_id,
        v_client_id,
        'Contratación: ' || v_service_name,
        v_description,
        'normal',
        v_stage_id,
        true,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_ticket_id;

    -- 7. Return Success JSON
    RETURN jsonb_build_object(
        'success', true,
        'action', 'ticket_created',
        'ticket_id', v_ticket_id,
        'message', 'Solicitud recibida correctamente. Nos pondremos en contacto contigo.'
    );
END;
$$;
