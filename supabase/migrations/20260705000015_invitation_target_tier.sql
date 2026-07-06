-- Migration: invitation target_tier
--
-- Allows a super_admin to specify the plan a new company will start on
-- when inviting a new owner. Without this, the new company always starts
-- on 'free' (hardcoded default in create_company_with_owner) and the
-- super_admin has to upgrade it manually after.
--
-- Layer changes:
--   1. company_invitations.target_tier — nullable text column. NULL for
--      staff/client invites; set only on owner invites sent by a
--      super_admin. Validated against the public.plans.id list with a
--      CHECK constraint + FK (ON DELETE SET NULL so deleting a plan
--      doesn't break outstanding invites — they just default to 'free'
--      at accept time).
--   2. create_company_with_owner(p_initial_tier text DEFAULT NULL) — new
--      optional parameter. COALESCE to 'free' inside, so every existing
--      caller (including the legacy 2-arg accept_company_invitation
--      overload) keeps working unchanged.
--   3. accept_company_invitation(...) — pass
--      COALESCE(v_invitation.target_tier, 'free') into the new param.
--      Owner-only path (v_invitation.role = 'owner' AND
--      v_invitation.company_id IS NULL).
--
-- Auth/role gate stays in the Edge Function (send-company-invite): only
-- super_admin invites pass target_tier; non-owner invites ignore it.

-- ── 1. Schema ────────────────────────────────────────────────────────
ALTER TABLE public.company_invitations
  ADD COLUMN IF NOT EXISTS target_tier text;

-- CHECK enforces the 4 valid tier ids at write time. NULL is allowed
-- (staff/client invites).
ALTER TABLE public.company_invitations
  DROP CONSTRAINT IF EXISTS company_invitations_target_tier_check;
ALTER TABLE public.company_invitations
  ADD CONSTRAINT company_invitations_target_tier_check
  CHECK (target_tier IS NULL OR target_tier IN ('free','starter','pro','business'));

-- FK to plans. SET NULL so a plan deletion (rare, only super_admin via
-- admin_upsert_plan with a new id) doesn't break outstanding invites —
-- they fall back to 'free' at accept time via COALESCE in the RPC.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_invitations_target_tier_fkey'
      AND conrelid = 'public.company_invitations'::regclass
  ) THEN
    ALTER TABLE public.company_invitations
      ADD CONSTRAINT company_invitations_target_tier_fkey
      FOREIGN KEY (target_tier) REFERENCES public.plans(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.company_invitations.target_tier IS
  'Plan the new company will start on when this owner-invite is accepted. NULL for non-owner invites; super_admin only.';

-- ── 2. create_company_with_owner — add p_initial_tier param ──────────
DROP FUNCTION IF EXISTS public.create_company_with_owner(text, text, text);

CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_name text,
  p_slug text,
  p_nif text DEFAULT NULL::text,
  p_initial_tier text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_auth_user_id uuid;
  v_app_user_id uuid;
  v_owner_role_id uuid;
  v_auth_email text;
  v_given_name text;
  v_surname text;
  v_tier text;
BEGIN
  -- Get current auth user
  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get auth user metadata
  SELECT
    au.email,
    COALESCE(au.raw_user_meta_data->>'given_name', split_part(au.raw_user_meta_data->>'full_name', ' ', 1), split_part(au.email, '@', 1)),
    COALESCE(au.raw_user_meta_data->>'surname', NULLIF(regexp_replace(au.raw_user_meta_data->>'full_name', '^[^\s]+\s*', ''), ''))
  INTO v_auth_email, v_given_name, v_surname
  FROM auth.users au
  WHERE au.id = v_auth_user_id;

  -- Ensure user exists in public.users
  SELECT id INTO v_app_user_id FROM public.users WHERE auth_user_id = v_auth_user_id;
  IF v_app_user_id IS NULL THEN
    INSERT INTO public.users (email, name, surname, active, auth_user_id, permissions)
    VALUES (v_auth_email, COALESCE(v_given_name, 'Usuario'), v_surname, true, v_auth_user_id, '{}'::jsonb)
    RETURNING id INTO v_app_user_id;
  END IF;

  -- Get owner role id
  SELECT id INTO v_owner_role_id FROM app_roles WHERE name = 'owner';
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Owner role not found in app_roles';
  END IF;

  -- Resolve tier. COALESCE keeps the legacy contract: NULL → 'free'.
  -- The CHECK constraint on company_invitations.target_tier + the FK to
  -- public.plans already validates the value before it ever reaches here.
  v_tier := COALESCE(NULLIF(BTRIM(p_initial_tier), ''), 'free');
  IF v_tier NOT IN ('free','starter','pro','business') THEN
    v_tier := 'free';
  END IF;

  -- Insert Company (subscription_tier is NOT NULL)
  INSERT INTO companies (name, slug, nif, is_active, subscription_tier)
  VALUES (p_name, p_slug, p_nif, true, v_tier)
  RETURNING id INTO v_company_id;

  -- Insert Member
  INSERT INTO company_members (user_id, company_id, role_id, status)
  VALUES (v_app_user_id, v_company_id, v_owner_role_id, 'active');

  -- Update User's primary company (only if not already set)
  UPDATE users SET company_id = v_company_id WHERE id = v_app_user_id AND company_id IS NULL;

  RETURN json_build_object(
    'success', true,
    'id', v_company_id,
    'name', p_name,
    'slug', p_slug,
    'user_id', v_app_user_id,
    'subscription_tier', v_tier
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_company_with_owner(text, text, text, text) TO authenticated;

-- ── 3. accept_company_invitation — read target_tier and forward it ───
-- Only the 4-arg overload is used by the Edge Function's accept flow
-- (the 2-arg overload never creates a company). Both are rewritten to
-- keep the signature stable and forward target_tier consistently.
DROP FUNCTION IF EXISTS public.accept_company_invitation(text, uuid, text, text);

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
  v_user_name text;
  v_user_surname text;
  v_display_name text;
  v_seat_max int;
  v_seat_current int;
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

  IF v_invitation.role <> 'client' AND v_invitation.company_id IS NOT NULL THEN
    SELECT max, current
      INTO v_seat_max, v_seat_current
      FROM public.check_seat_available(v_invitation.company_id)
        AS t(current int, max int, available int, is_client_excluded boolean);
    IF v_seat_max IS NOT NULL AND v_seat_max <= v_seat_current THEN
      RETURN json_build_object(
        'success', false,
        'code',    'SEAT_LIMIT_EXCEEDED',
        'error',   format('Seat limit reached (%s/%s)', v_seat_current, v_seat_max),
        'current', v_seat_current,
        'max',     v_seat_max
      );
    END IF;
  END IF;

  SELECT id, company_id, name, surname
  INTO v_user_id, v_existing_company_id, v_user_name, v_user_surname
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

    IF EXISTS (SELECT 1 FROM public.companies WHERE slug = v_generated_slug) THEN
      RETURN json_build_object('success', false, 'error', 'Ya existe una organización registrada con este nombre o uno muy similar. Por favor, elige otro nombre o contacta con soporte si te pertenece.');
    END IF;

    BEGIN
      -- Forward the invitation's target_tier. create_company_with_owner
      -- COALESCES NULL → 'free', so a NULL target_tier keeps legacy behavior.
      SELECT public.create_company_with_owner(
        v_requested_company_name,
        v_generated_slug,
        v_requested_company_nif,
        v_invitation.target_tier
      )
      INTO v_created_company;
    EXCEPTION WHEN unique_violation THEN
      RETURN json_build_object('success', false, 'error', 'Ya existe una organización registrada con este nombre o slug. Por favor, elige otro.');
    WHEN OTHERS THEN
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

    IF v_invitation.role = 'professional' THEN
      v_display_name := COALESCE(
        NULLIF(TRIM(BTRIM(v_user_name || ' ' || v_user_surname)), ''),
        v_invitation.email,
        'Professional'
      );

      INSERT INTO public.professionals (user_id, company_id, display_name, is_active)
      VALUES (v_user_id, v_invitation.company_id, v_display_name, true)
      ON CONFLICT DO NOTHING;

      INSERT INTO public.user_modules (user_id, module_key, status)
      VALUES (v_user_id, 'moduloReservas', 'active')
      ON CONFLICT (user_id, module_key) DO NOTHING;
    END IF;
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
    'role', v_invitation.role,
    'subscription_tier', v_created_company->>'subscription_tier'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';