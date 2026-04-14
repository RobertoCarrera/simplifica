-- Migration: Add upsert_client to source control
-- This function existed in the DB without a migration. It is recorded here as-is
-- so that the codebase reflects the real DB state (no functional change).
-- The payload resolution uses COALESCE priority:
--   1. payload->>'company_id'  ← set by callUpsertClientRpc; CAIBS when in professional mode
--   2. payload->>'usuario_id'  ← legacy alias (fallback)
--   3. auth.uid()              ← last resort (would be an invalid company uuid in practice)

CREATE OR REPLACE FUNCTION public.upsert_client(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    new_id          uuid;
    result_record   jsonb;
    current_user_id uuid;
    v_auth_user_id  uuid;
    v_company_id    uuid;
BEGIN
    SET search_path = '';
    current_user_id := auth.uid();
    v_company_id    := COALESCE(
        (payload->>'company_id')::uuid,
        (payload->>'usuario_id')::uuid,
        current_user_id
    );

    IF payload->>'id' IS NOT NULL THEN
        new_id := (payload->>'id')::uuid;
    ELSE
        IF payload->>'email' IS NOT NULL THEN
            SELECT au.id INTO v_auth_user_id
            FROM auth.users au
            WHERE au.email = payload->>'email'
            LIMIT 1;
        END IF;

        IF v_auth_user_id IS NOT NULL AND v_company_id IS NOT NULL THEN
            SELECT c.id INTO new_id
            FROM public.clients c
            WHERE c.auth_user_id = v_auth_user_id
              AND c.company_id   = v_company_id
            LIMIT 1;
        END IF;

        IF new_id IS NULL THEN
            new_id := gen_random_uuid();
        END IF;
    END IF;

    INSERT INTO public.clients (
        id,
        name,
        surname,
        dni,
        phone,
        client_type,
        business_name,
        cif_nif,
        trade_name,
        legal_representative_name,
        legal_representative_dni,
        email,
        direccion_id,
        mercantile_registry_data,
        metadata,
        company_id,
        created_by,
        created_at,
        updated_at
    )
    VALUES (
        new_id,
        COALESCE(payload->>'name', ''),
        COALESCE(payload->>'surname', ''),
        COALESCE(payload->>'dni', ''),
        COALESCE(payload->>'phone', ''),
        COALESCE(payload->>'client_type', 'individual'),
        payload->>'business_name',
        payload->>'cif_nif',
        payload->>'trade_name',
        payload->>'legal_representative_name',
        payload->>'legal_representative_dni',
        payload->>'email',
        (payload->>'direccion_id')::uuid,
        CASE
            WHEN payload->'mercantile_registry_data' IS NULL
              OR jsonb_typeof(payload->'mercantile_registry_data') = 'null' THEN NULL
            ELSE payload->'mercantile_registry_data'
        END,
        CASE
            WHEN payload->'metadata' IS NULL
              OR jsonb_typeof(payload->'metadata') = 'null' THEN '{}'::jsonb
            ELSE payload->'metadata'
        END,
        v_company_id,
        current_user_id,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        name                        = EXCLUDED.name,
        surname                     = EXCLUDED.surname,
        dni                         = EXCLUDED.dni,
        phone                       = EXCLUDED.phone,
        client_type                 = EXCLUDED.client_type,
        business_name               = EXCLUDED.business_name,
        cif_nif                     = EXCLUDED.cif_nif,
        trade_name                  = EXCLUDED.trade_name,
        legal_representative_name   = EXCLUDED.legal_representative_name,
        legal_representative_dni    = EXCLUDED.legal_representative_dni,
        email                       = EXCLUDED.email,
        direccion_id                = EXCLUDED.direccion_id,
        mercantile_registry_data    = EXCLUDED.mercantile_registry_data,
        metadata                    = EXCLUDED.metadata,
        -- INTENTIONAL: never overwrite an existing company assignment on update
        company_id                  = COALESCE(clients.company_id, EXCLUDED.company_id),
        updated_at                  = NOW()
    RETURNING to_jsonb(clients.*) INTO result_record;

    RETURN result_record;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_client(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_client(jsonb) TO service_role;
