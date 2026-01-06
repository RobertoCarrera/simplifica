-- Fix for upsert_client function (COALESCE text/jsonb mismatch)
-- Re-defining the function safely handling JSONB columns
-- PARAMETER NAME MUST BE 'payload' to match frontend RPC call { payload: ... }
-- REMOVED 'direccion' column as it does not exist on clients table.
-- ADDED 'direccion_id' handling.
-- RENAMED 'usuario_id' -> 'company_id' as that is the correct column name.

CREATE OR REPLACE FUNCTION public.upsert_client(
    payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_id uuid;
    result_record jsonb;
    current_user_id uuid;
BEGIN
    -- Get current user ID (if calling from authenticated context)
    current_user_id := auth.uid();
    
    -- Extract ID if present (for update)
    IF payload->>'id' IS NOT NULL THEN
        new_id := (payload->>'id')::uuid;
    ELSE
        new_id := gen_random_uuid();
    END IF;

    -- Perform Upsert
    INSERT INTO public.clients (
        id,
        name,
        apellidos,
        dni,
        phone,
        client_type,
        business_name,
        cif_nif,
        trade_name,
        legal_representative_name,
        legal_representative_dni,
        email,
        -- REMOVED: direccion (does not exist)
        direccion_id, -- Keep this if it exists, commonly it does for linking address
        
        mercantile_registry_data, 
        metadata,
        
        -- Other fields
        company_id, -- Was usuario_id, actual column is company_id
        created_at,
        updated_at
    )
    VALUES (
        new_id,
        COALESCE(payload->>'name', ''),
        COALESCE(payload->>'apellidos', ''),
        COALESCE(payload->>'dni', ''),
        COALESCE(payload->>'phone', ''),
        COALESCE(payload->>'client_type', 'individual'), 
        payload->>'business_name',
        payload->>'cif_nif',
        payload->>'trade_name',
        payload->>'legal_representative_name',
        payload->>'legal_representative_dni',
        payload->>'email',
        -- REMOVED: direccion value
        (payload->>'direccion_id')::uuid, -- Cast to UUID safely? or handle null
        
        -- Mercantile Data
        CASE 
            WHEN payload->'mercantile_registry_data' IS NULL OR jsonb_typeof(payload->'mercantile_registry_data') = 'null' THEN null
            ELSE payload->'mercantile_registry_data'
        END,

        -- Metadata
        CASE 
            WHEN payload->'metadata' IS NULL OR jsonb_typeof(payload->'metadata') = 'null' THEN '{}'::jsonb
            ELSE payload->'metadata'
        END,

        -- Company ID (was usuario_id)
        -- Logic: If payload has company_id (or usuario_id mapped), use it. Else fallback to current_user_id
        COALESCE((payload->>'company_id')::uuid, (payload->>'usuario_id')::uuid, current_user_id),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        apellidos = EXCLUDED.apellidos,
        dni = EXCLUDED.dni,
        phone = EXCLUDED.phone,
        client_type = EXCLUDED.client_type,
        business_name = EXCLUDED.business_name,
        cif_nif = EXCLUDED.cif_nif,
        trade_name = EXCLUDED.trade_name,
        legal_representative_name = EXCLUDED.legal_representative_name,
        legal_representative_dni = EXCLUDED.legal_representative_dni,
        email = EXCLUDED.email,
        -- REMOVED: direccion = EXCLUDED.direccion,
        direccion_id = EXCLUDED.direccion_id,
        mercantile_registry_data = EXCLUDED.mercantile_registry_data,
        metadata = EXCLUDED.metadata,
        
        -- Do not necessarily update company_id on conflict unless we want to transfer ownership?
        -- Usually ownership stays. But let's assume we update it if provided.
        -- company_id = EXCLUDED.company_id, -- Commented out to prevent accidental ownership transfer on update, usually safer.
        -- Or if we want to ensure it's set:
        company_id = COALESCE(clients.company_id, EXCLUDED.company_id),

        updated_at = NOW()
    RETURNING to_jsonb(clients.*) INTO result_record;

    RETURN result_record;
END;
$$;
