-- ============================================
-- FIX: normalize_name function + enhanced dedup gate in upsert_client
-- Date: 2026-05-25
-- ============================================

BEGIN;

-- ============================================
-- PART 1: Create normalize_name function
-- ============================================
CREATE OR REPLACE FUNCTION public.normalize_name(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_text text;
BEGIN
    IF p_name IS NULL OR p_name = '' THEN
        RETURN NULL;
    END IF;
    v_text := trim(p_name);
    -- Strip accents using translate (avoids deep regexp nesting)
    v_text := translate(v_text, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN');
    -- Collapse multiple spaces to one, trim, lowercase
    v_text := lower(regexp_replace(v_text, '\s+', ' ', 'g'));
    RETURN v_text;
END;
$$;

-- ============================================
-- PART 2: Modify upsert_client to add docplanner dedup
-- and UPDATE merge logic BEFORE INSERT
-- ============================================
CREATE OR REPLACE FUNCTION public.upsert_client(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    new_id          uuid;
    result_record   jsonb;
    current_user_id uuid;
    v_auth_user_id  uuid;
    v_company_id    uuid;
    v_caller_company_id uuid;
    v_user_internal_id uuid;
    v_role_name     text;
    v_existing_id    uuid;
    v_norm_phone     text;
    v_norm_email     text;
    v_norm_name      text;
    v_norm_surname   text;
BEGIN
    v_auth_user_id := auth.uid();

    SELECT u.id, u.company_id, ar.name INTO v_user_internal_id, v_caller_company_id, v_role_name
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = v_auth_user_id;

    v_company_id := v_caller_company_id;

    IF payload->>'company_id' IS NOT NULL THEN
        DECLARE
            payload_company_id uuid := (payload->>'company_id')::uuid;
        BEGIN
            IF payload_company_id != v_caller_company_id THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.company_members cm
                    WHERE cm.user_id = v_user_internal_id
                      AND cm.company_id = payload_company_id
                      AND cm.status = 'active'
                ) THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'Cannot upsert client to a company you are not a member of'
                    );
                END IF;
            END IF;
            v_company_id := payload_company_id;
        END;
    END IF;

    current_user_id := v_user_internal_id;

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
            v_norm_phone   := public.normalize_phone(payload->>'phone');
            v_norm_email   := lower(trim(payload->>'email'));
            v_norm_name    := public.normalize_name(payload->>'name');
            v_norm_surname := public.normalize_name(payload->>'surname');

            -- Priority 1: docplanner_patient_id
            IF payload->>'docplanner_patient_id' IS NOT NULL THEN
                SELECT id INTO v_existing_id FROM public.clients
                WHERE company_id = v_company_id AND deleted_at IS NULL
                  AND docplanner_patient_id = payload->>'docplanner_patient_id'
                LIMIT 1;
            END IF;

            -- Priority 2: normalized phone
            IF v_existing_id IS NULL AND v_norm_phone IS NOT NULL THEN
                SELECT id INTO v_existing_id FROM public.clients
                WHERE company_id = v_company_id AND deleted_at IS NULL
                  AND public.normalize_phone(phone) = v_norm_phone
                LIMIT 1;
            END IF;

            -- Priority 3: normalized name + surname
            IF v_existing_id IS NULL AND v_norm_name IS NOT NULL AND v_norm_surname IS NOT NULL THEN
                SELECT id INTO v_existing_id FROM public.clients
                WHERE company_id = v_company_id AND deleted_at IS NULL
                  AND public.normalize_name(name) = v_norm_name
                  AND public.normalize_name(surname) = v_norm_surname
                LIMIT 1;
            END IF;

            IF v_existing_id IS NOT NULL THEN
                UPDATE public.clients SET
                    name     = CASE WHEN payload->>'name' IS NOT NULL AND payload->>'name' <> '' THEN payload->>'name' ELSE name END,
                    surname  = CASE WHEN payload->>'surname' IS NOT NULL AND payload->>'surname' <> '' THEN payload->>'surname' ELSE surname END,
                    email    = CASE WHEN payload->>'email' IS NOT NULL AND payload->>'email' <> '' AND payload->>'email' <> 'corre@tudominio.es' THEN payload->>'email' ELSE email END,
                    phone    = CASE WHEN payload->>'phone' IS NOT NULL AND payload->>'phone' <> '' THEN public.normalize_phone(payload->>'phone') ELSE phone END,
                    docplanner_patient_id = COALESCE(payload->>'docplanner_patient_id', docplanner_patient_id),
                    updated_at = now()
                WHERE id = v_existing_id;
                RETURN jsonb_build_object('success', true, 'id', v_existing_id, 'action', 'updated_existing');
            ELSE
                new_id := gen_random_uuid();
            END IF;
        END IF;
    END IF;

    INSERT INTO public.clients (
        id, name, surname, dni, phone, client_type, business_name,
        cif_nif, trade_name, legal_representative_name, legal_representative_dni,
        email, direccion_id, mercantile_registry_data, metadata,
        company_id, created_by, created_at, updated_at
    )
    VALUES (
        new_id,
        COALESCE(public.normalize_name(payload->>'name'), ''),
        COALESCE(public.normalize_name(payload->>'surname'), ''),
        COALESCE(payload->>'dni', ''),
        COALESCE(public.normalize_phone(payload->>'phone'), NULL),
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
        company_id                  = COALESCE(clients.company_id, EXCLUDED.company_id),
        updated_at                  = NOW()
    RETURNING to_jsonb(clients.*) INTO result_record;

    RETURN result_record;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.upsert_client(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_client(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.upsert_client(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_client(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;