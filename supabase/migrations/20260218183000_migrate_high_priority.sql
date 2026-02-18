-- Migration: High Priority Functions
-- 1. list_company_devices_rpc (replaces list-company-devices)
-- 2. remove_or_deactivate_client_rpc (replaces remove-or-deactivate-client)
-- 3. delete_stage_safe_rpc (wrapper for safe_delete_ticket_stage, replaces delete-stage-safe)

-- Function 1: list_company_devices_rpc
CREATE OR REPLACE FUNCTION list_company_devices_rpc(p_company_id uuid)
RETURNS SETOF devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_staff boolean;
    v_client_id uuid;
BEGIN
    -- Check if user is staff (using EXISTS for performance)
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_user_id = v_user_id
          AND company_id = p_company_id
          AND active = true
    ) INTO v_is_staff;

    IF v_is_staff THEN
        RETURN QUERY
        SELECT * FROM devices
        WHERE company_id = p_company_id
        ORDER BY received_at DESC;
        RETURN;
    END IF;

    -- If not staff, check if user is a client
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE auth_user_id = v_user_id
      AND company_id = p_company_id
      AND is_active = true; -- assuming active check is desired based on original EF logic

    IF v_client_id IS NOT NULL THEN
        RETURN QUERY
        SELECT * FROM devices
        WHERE company_id = p_company_id
          AND client_id = v_client_id
        ORDER BY received_at DESC;
        RETURN;
    END IF;

    -- If neither, return empty set (or could raise exception, but empty set is safer for list endpoints)
    -- Original EF returned 403, here we just return nothing which is a common RLS pattern but calling code might expect error. 
    -- However, since this is a specific RPC for listing, returning empty is fine if unauthorized.
    -- To match EF strictness:
    RAISE EXCEPTION 'User not allowed for this company' USING ERRCODE = 'P0001'; 
END;
$$;

-- Function 2: remove_or_deactivate_client_rpc
CREATE OR REPLACE FUNCTION remove_or_deactivate_client_rpc(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_company_id uuid;
    v_client_company_id uuid;
    v_client_meta jsonb;
    v_invoice_count int;
    v_quote_count int;
    v_ticket_count int;
    v_action text;
BEGIN
    -- 1. Resolve Admin/Staff Company ID
    SELECT company_id INTO v_company_id
    FROM public.users
    WHERE auth_user_id = v_user_id
      AND active = true
    LIMIT 1;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'User not authorized or no company found';
    END IF;

    -- 2. Fetch Client to verify ownership and get metadata
    SELECT company_id, metadata INTO v_client_company_id, v_client_meta
    FROM public.clients
    WHERE id = p_client_id;

    IF v_client_company_id IS NULL THEN
        RAISE EXCEPTION 'Client not found';
    END IF;

    IF v_client_company_id != v_company_id THEN
        RAISE EXCEPTION 'Not allowed to remove client from another company';
    END IF;

    -- 3. Count Active Invoices (not cancelled, not deleted)
    SELECT count(*) INTO v_invoice_count
    FROM public.invoices
    WHERE client_id = p_client_id
      AND company_id = v_company_id
      AND deleted_at IS NULL
      AND status != 'cancelled';

    -- 4. Logic: Deactivate OR Delete
    IF v_invoice_count > 0 THEN
        -- Deactivate
        v_action := 'deactivated';
        
        -- Update metadata with retention info
        v_client_meta := v_client_meta || jsonb_build_object(
            'retention_invoice_count', v_invoice_count,
            'retention_last_action', 'deactivated',
            'retention_action_at', now(),
            'retention_reason', 'invoices_present'
        );

        UPDATE public.clients
        SET is_active = false,
            metadata = v_client_meta,
            updated_at = now()
        WHERE id = p_client_id;

    ELSE
        -- Hard Delete
        v_action := 'deleted';

        -- Delete Quotes
        DELETE FROM public.quotes
        WHERE client_id = p_client_id
          AND company_id = v_company_id;
        
        -- Delete Tickets (soft delete usually, but EF does hard delete)
        -- The EF code attempts a DELETE on tickets.
        DELETE FROM public.tickets
        WHERE client_id = p_client_id
          AND company_id = v_company_id;

        -- Delete Client
        DELETE FROM public.clients
        WHERE id = p_client_id;
    END IF;

    -- Return JSON result similar to EF
    RETURN jsonb_build_object(
        'ok', true,
        'action', v_action,
        'invoiceCount', v_invoice_count,
        'clientId', p_client_id
    );
END;
$$;

-- Function 3: delete_stage_safe_rpc
-- Wrapper around existing safe_delete_ticket_stage if exists, or reimplement logic.
-- The EF checks if tickets reference the stage before calling the procedure.

CREATE OR REPLACE FUNCTION delete_stage_safe_rpc(
    p_stage_id uuid,
    p_reassign_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_company_id uuid;
    v_ticket_count int;
BEGIN
    -- 1. Resolve Company
    SELECT company_id INTO v_company_id
    FROM public.users
    WHERE auth_user_id = v_user_id
      AND active = true
    LIMIT 1;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'User not authorized';
    END IF;

    -- 2. Pre-check: references
    IF p_reassign_to IS NULL THEN
        SELECT count(*) INTO v_ticket_count
        FROM public.tickets
        WHERE stage_id = p_stage_id
          AND company_id = v_company_id;

        IF v_ticket_count > 0 THEN
            -- Throw specific error code so frontend can catch it
            RAISE EXCEPTION 'Tickets reference this stage; reassignment required'
            USING ERRCODE = 'P0002'; -- Using custom error code or P0002 for logic error
        END IF;
    END IF;

    -- 3. Call underlying RPC if exists, or do the delete manually here if reliable.
    -- Since safe_delete_ticket_stage exists, we call it.
    -- Assuming signature: safe_delete_ticket_stage(p_stage_id uuid, p_company_id uuid, p_reassign_to uuid)
    
    PERFORM safe_delete_ticket_stage(p_stage_id, v_company_id, p_reassign_to);

    RETURN jsonb_build_object(
        'deleted', true,
        'stageId', p_stage_id,
        'companyId', v_company_id
    );
EXCEPTION
    WHEN SQLSTATE 'P0002' THEN
        RETURN jsonb_build_object(
            'error', 'Tickets reference this stage; reassignment required',
            'code', 'REASSIGN_REQUIRED',
            'tickets_count', v_ticket_count
        );
    WHEN OTHERS THEN
        -- Catch re-raised errors from the inner procedure if needed or let them bubble up
        RAISE;
END;
$$;
