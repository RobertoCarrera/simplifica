-- Fix owner invitation acceptance when the invitation does not yet belong to a company.
-- Super admins send owner invites with company_id = NULL. The previous RPC treated those
-- invites like any other staff invite and tried to insert company_members with NULL
-- company_id, which fails with a 400 from PostgREST.

DROP FUNCTION IF EXISTS public.accept_company_invitation(text, uuid);

CREATE OR REPLACE FUNCTION public.accept_company_invitation(
  p_invitation_token text,
  p_auth_user_id uuid,
  p_company_name text DEFAULT NULL,
  p_company_nif text DEFAULT NULL
)
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
  v_created_company json;
  v_requested_company_name text;
  v_requested_company_nif text;
  v_generated_slug text;
BEGIN
  v_caller_auth_uid := auth.uid();
  IF v_caller_auth_uid IS NULL OR v_caller_auth_uid != p_auth_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Forbidden: you can only accept invitations for your own account');
  END IF;

  SELECT i.*, c.name AS company_name
  INTO v_invitation
  FROM public.company_invitations i
  LEFT JOIN public.companies c ON c.id = i.company_id
  WHERE i.token = p_invitation_token
    AND i.status = 'pending';

  IF v_invitation.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  SELECT id, company_id
  INTO v_user_id, v_existing_company_id
  FROM public.users
  WHERE auth_user_id = p_auth_user_id;

  IF v_user_id IS NULL AND v_invitation.role != 'client' THEN
    SELECT email INTO v_auth_email FROM auth.users WHERE id = p_auth_user_id;
    INSERT INTO public.users (auth_user_id, email, active)
    VALUES (p_auth_user_id, COALESCE(v_auth_email, v_invitation.email), true)
    RETURNING id, company_id INTO v_user_id, v_existing_company_id;
  END IF;

  SELECT id INTO v_role_id FROM public.app_roles WHERE name = v_invitation.role;
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM public.app_roles
    WHERE name = CASE WHEN v_invitation.role = 'client' THEN 'client' ELSE 'member' END;
  END IF;

  IF v_invitation.role = 'owner' AND v_invitation.company_id IS NULL THEN
    v_requested_company_name := NULLIF(LEFT(BTRIM(COALESCE(p_company_name, '')), 200), '');
    v_requested_company_nif := NULLIF(LEFT(UPPER(BTRIM(COALESCE(p_company_nif, ''))), 32), '');

    IF v_requested_company_name IS NULL THEN
      v_requested_company_name := INITCAP(REPLACE(NULLIF(split_part(split_part(v_invitation.email, '@', 2), '.', 1), ''), '-', ' '));
    END IF;

    IF v_requested_company_name IS NULL THEN
      v_requested_company_name := 'Nueva empresa';
    END IF;

    v_generated_slug := TRIM(BOTH '-' FROM regexp_replace(lower(v_requested_company_name), '[^a-z0-9]+', '-', 'g'));
    IF v_generated_slug = '' THEN
      v_generated_slug := 'empresa';
    END IF;
    v_generated_slug := v_generated_slug || '-' || FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;

    BEGIN
      SELECT public.create_company_with_owner(v_requested_company_name, v_generated_slug, v_requested_company_nif)
      INTO v_created_company;
    EXCEPTION WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'error', SQLERRM);
    END;

    v_invitation.company_id := NULLIF(v_created_company->>'id', '')::uuid;
    v_invitation.company_name := COALESCE(v_created_company->>'name', v_requested_company_name);

    IF v_invitation.company_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'No se pudo crear la empresa para esta invitación.');
    END IF;

    UPDATE public.users
    SET company_id = v_invitation.company_id,
        app_role_id = v_role_id,
        active = true,
        updated_at = now()
    WHERE id = v_user_id;
  ELSIF v_invitation.role = 'client' THEN
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.company_members (user_id, company_id, role_id, status)
      VALUES (v_user_id, v_invitation.company_id, v_role_id, 'active')
      ON CONFLICT (user_id, company_id) DO UPDATE
      SET role_id = v_role_id, status = 'active', updated_at = now();

      UPDATE public.users
      SET company_id = v_invitation.company_id, app_role_id = v_role_id, updated_at = now()
      WHERE id = v_user_id AND company_id IS NULL;
    END IF;
  ELSE
    INSERT INTO public.company_members (user_id, company_id, role_id, status)
    VALUES (v_user_id, v_invitation.company_id, v_role_id, 'active')
    ON CONFLICT (user_id, company_id) DO UPDATE
    SET role_id = v_role_id, status = 'active', updated_at = now();

    UPDATE public.users
    SET company_id = v_invitation.company_id, app_role_id = v_role_id, updated_at = now()
    WHERE id = v_user_id AND company_id IS NULL;
  END IF;

  UPDATE public.company_invitations
  SET company_id = COALESCE(company_id, v_invitation.company_id),
      status = 'accepted',
      responded_at = now()
  WHERE id = v_invitation.id;

  RETURN json_build_object(
    'success', true,
    'company_id', v_invitation.company_id,
    'company_name', v_invitation.company_name,
    'role', v_invitation.role
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid, text, text) TO service_role;