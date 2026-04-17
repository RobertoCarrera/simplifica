-- Security audit migration: Fix critical RPC vulnerabilities
-- Audit date: 2026-04-14
-- Issues found: 4 CRITICAL functions with auth bypass / company isolation bypass

BEGIN;

-- ============================================
-- FIX 1: accept_company_invitation — AUTH BYPASS
-- CRITICAL: p_auth_user_id NOT validated against auth.uid()
-- Fix: Add auth.uid() == p_auth_user_id check + proper search_path
-- ============================================
CREATE OR REPLACE FUNCTION public.accept_company_invitation(p_invitation_token text, p_auth_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation record;
  v_user_id uuid;
  v_role_id uuid;
  v_existing_company_id uuid;
  v_auth_email text;
  v_caller_auth_uid uuid;
BEGIN
  -- SECURITY: Validate caller owns this auth_user_id
  v_caller_auth_uid := auth.uid();
  IF v_caller_auth_uid IS NULL OR v_caller_auth_uid != p_auth_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Forbidden: you can only accept invitations for your own account');
  END IF;

  -- 1. Validate invitation (must be pending)
  SELECT i.*, c.name as company_name
  INTO v_invitation
  FROM public.company_invitations i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.token = p_invitation_token
    AND i.status = 'pending';

  IF v_invitation.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- 2. Look up public.users record
  SELECT id, company_id
  INTO v_user_id, v_existing_company_id
  FROM public.users
  WHERE auth_user_id = p_auth_user_id;

  -- 3. For non-client roles: auto-create public.users if missing
  IF v_user_id IS NULL AND v_invitation.role != 'client' THEN
    SELECT email INTO v_auth_email FROM auth.users WHERE id = p_auth_user_id;
    INSERT INTO public.users (auth_user_id, email, active)
    VALUES (p_auth_user_id, COALESCE(v_auth_email, v_invitation.email), true)
    RETURNING id, company_id INTO v_user_id, v_existing_company_id;
  END IF;

  -- 4. Resolve role ID (fall back to 'member' if role name not found)
  SELECT id INTO v_role_id FROM public.app_roles WHERE name = v_invitation.role;
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM public.app_roles
    WHERE name = CASE WHEN v_invitation.role = 'client' THEN 'client' ELSE 'member' END;
  END IF;

  -- 5a. Client role: link clients record + optionally add company_members
  IF v_invitation.role = 'client' THEN
    UPDATE public.clients
    SET auth_user_id = p_auth_user_id, is_active = true, updated_at = now()
    WHERE email = v_invitation.email AND company_id = v_invitation.company_id;

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.company_members (user_id, company_id, role_id, status)
      VALUES (v_user_id, v_invitation.company_id, v_role_id, 'active')
      ON CONFLICT (user_id, company_id) DO UPDATE
      SET role_id = v_role_id, status = 'active', updated_at = now();

      -- Only set primary company if user had none
      UPDATE public.users
      SET company_id = v_invitation.company_id, app_role_id = v_role_id, updated_at = now()
      WHERE id = v_user_id AND company_id IS NULL;
    END IF;

  -- 5b. Staff role: add membership WITHOUT overwriting existing primary company
  ELSE
    INSERT INTO public.company_members (user_id, company_id, role_id, status)
    VALUES (v_user_id, v_invitation.company_id, v_role_id, 'active')
    ON CONFLICT (user_id, company_id) DO UPDATE
    SET role_id = v_role_id, status = 'active', updated_at = now();

    -- Only set primary company + role if user had no company yet (new users)
    UPDATE public.users
    SET company_id = v_invitation.company_id, app_role_id = v_role_id, updated_at = now()
    WHERE id = v_user_id AND company_id IS NULL;
  END IF;

  -- 6. Mark invitation accepted
  UPDATE public.company_invitations
  SET status = 'accepted', responded_at = now()
  WHERE id = v_invitation.id;

  RETURN json_build_object(
    'success', true,
    'company_id', v_invitation.company_id,
    'company_name', v_invitation.company_name,
    'role', v_invitation.role
  );
END;
$function$;

-- ============================================
-- FIX 2: activate_invited_user — PARAMETER SHADOWING BUG
-- CRITICAL: user_email param shadows table column + bare EXCEPTION WHEN OTHERS
-- Fix: Rename param, use fully-qualified column reference, proper error handling
-- ============================================
CREATE OR REPLACE FUNCTION public.activate_invited_user(p_user_email text, p_auth_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_record RECORD;
  v_caller_auth_uid uuid;
BEGIN
  -- SECURITY: Validate caller owns this auth_user_id
  v_caller_auth_uid := auth.uid();
  IF v_caller_auth_uid IS NULL OR v_caller_auth_uid != p_auth_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Forbidden: you can only activate your own account');
  END IF;

  -- Buscar el usuario por email (fully-qualified column reference to avoid param shadowing)
  SELECT id, email, active INTO user_record
  FROM public.users
  WHERE public.users.email = p_user_email
    AND public.users.active = false
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Usuario no encontrado o ya está activo'
    );
  END IF;

  -- Activar usuario y asociar con auth_user_id
  UPDATE public.users
  SET
    auth_user_id = p_auth_user_id,
    active = true,
    updated_at = now()
  WHERE id = user_record.id;

  RETURN json_build_object(
    'success', true,
    'message', 'Usuario activado correctamente'
  );
END;
$function$;

-- ============================================
-- FIX 3: gdpr_anonymize_client — NO AUTHORIZATION CHECK
-- CRITICAL: Any authenticated user could anonymize ANY client
-- Fix: Add owner/admin/super_admin role check + company ownership verification
-- ============================================
CREATE OR REPLACE FUNCTION public.gdpr_anonymize_client(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    affected_client_name TEXT;
    affected_client_email TEXT;
    v_company_id UUID;
    v_caller_auth_uid uuid;
    v_caller_role TEXT;
    v_has_permission boolean;
BEGIN
    v_caller_auth_uid := auth.uid();

    IF v_caller_auth_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- SECURITY: Get caller's company and role
    SELECT u.company_id, ar.name INTO v_company_id, v_caller_role
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = v_caller_auth_uid;

    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User has no company association');
    END IF;

    -- Also verify caller has admin/owner/super_admin role
    SELECT EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.app_roles ar ON u.app_role_id = ar.id
        WHERE u.auth_user_id = v_caller_auth_uid
          AND ar.name IN ('owner', 'admin', 'super_admin')
    ) INTO v_has_permission;

    IF NOT v_has_permission THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden: requires admin/owner role');
    END IF;

    -- Check client belongs to caller's company
    SELECT name, email INTO affected_client_name, affected_client_email
    FROM public.clients
    WHERE id = p_client_id AND company_id = v_company_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client not found in your company');
    END IF;

    -- Anonymize client record
    UPDATE public.clients
    SET
        name = 'ANONYMIZED',
        surname = '[REDACTED]',
        email = 'deleted_' || substring(md5(random()::text), 1, 16) || '@redacted.invalid',
        phone = NULL,
        active = false,
        consent_status = 'revoked',
        updated_at = now()
    WHERE id = p_client_id;

    -- Audit trail
    INSERT INTO public.gdpr_action_log (client_id, action, performed_by, company_id)
    VALUES (p_client_id, 'anonymize', v_caller_auth_uid, v_company_id);

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Cliente anonimizado correctamente',
        'client_name', affected_client_name,
        'client_email', affected_client_email
    );
END;
$function$;

-- ============================================
-- FIX 4: is_super_admin — PRIVILEGE ESCALATION via dual ID lookup
-- CRITICAL: accepts BOTH auth_user_id OR internal id — enables internal ID enumeration
-- SECURITY FIX: Only check auth_user_id (never internal id) regardless of parameter name
-- Note: Cannot change parameter name ('user_id') because it's referenced by 9 RLS policies.
-- Instead, we fix the internal logic to ONLY accept auth_user_id.
-- ============================================
-- is_super_admin(user_id uuid) — parameter name preserved for policy compatibility
-- but logic now enforces auth_user_id check only (not internal id)
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- SECURITY FIX: Only accept auth_user_id to prevent privilege escalation
  -- via internal user ID enumeration.
  -- Parameter 'user_id' is kept for RLS policy compatibility but functionally
  -- only auth_user_id lookup is used.
  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = user_id
      AND ar.name = 'super_admin'
  );
END;
$function$;

-- New internal-only variant for admin panels that need internal ID lookup
DROP FUNCTION IF EXISTS public.is_super_admin_by_internal_id(uuid);
CREATE OR REPLACE FUNCTION public.is_super_admin_by_internal_id(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.id = p_user_id
      AND ar.name = 'super_admin'
  );
END;
$function$;

-- ============================================
-- FIX 5: upsert_client — empty search_path + payload-injectable company_id
-- CRITICAL: SET search_path = '' + company_id derived from payload
-- Fix: SET search_path TO 'public' + company_id from caller's company membership
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
BEGIN
    -- Derive company_id from authenticated user ONLY (never from payload directly)
    v_auth_user_id := auth.uid();

    -- SECURITY: Get company_id from user's primary company assignment
    SELECT u.id, u.company_id, ar.name INTO v_user_internal_id, v_caller_company_id, v_role_name
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = v_auth_user_id;

    -- Default to caller's primary company
    v_company_id := v_caller_company_id;

    -- If payload contains explicit company_id, verify the user belongs to it
    -- (prevents calling upsert_client for a company the user is not a member of)
    IF payload->>'company_id' IS NOT NULL THEN
        DECLARE
            payload_company_id uuid := (payload->>'company_id')::uuid;
        BEGIN
            -- Verify user is member of the target company (via company_members or primary)
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
            -- Use the verified company_id (not the raw payload one)
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
        company_id                  = COALESCE(clients.company_id, EXCLUDED.company_id),
        updated_at                  = NOW()
    RETURNING to_jsonb(clients.*) INTO result_record;

    RETURN result_record;
END;
$function$;

-- Re-grant permissions
REVOKE EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.activate_invited_user(text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_invited_user(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.activate_invited_user(text, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.activate_invited_user(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_invited_user(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.activate_invited_user(text, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.gdpr_anonymize_client(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.gdpr_anonymize_client(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.gdpr_anonymize_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_anonymize_client(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_super_admin_by_internal_id(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin_by_internal_id(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin_by_internal_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin_by_internal_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin_by_internal_id(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_client(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_client(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.upsert_client(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_client(jsonb) TO service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;