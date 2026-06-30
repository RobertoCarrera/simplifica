-- ============================================
-- Migration: Seat enforcement on company invitations
-- Phase 2 / PR 2 of plans-pricing-freemium (Seat Enforcement).
--
-- Adds `companies.max_users` as the denormalized seat cap synced by the
-- plan-assignment RPCs. Introduces `check_seat_available` to count current
-- non-client memberships against the cap, and gates non-client invitations
-- in `accept_company_invitation` so that exceeding the cap returns a
-- structured JSON envelope (`code: SEAT_LIMIT_EXCEEDED`) BEFORE any insert.
--
-- SEAT_LIMIT_EXCEEDED follows ADR-02 (JSON envelope, NOT RAISE EXCEPTION)
-- so the existing `accept_company_invitation` contract (`RETURNS json`)
-- stays intact and the client can discriminate error codes by `code`.
-- ============================================

BEGIN;

-- ── (A) Add max_users column on companies ──────────────────────────
-- NULL = unlimited (used for legacy companies and emergency bypass).
-- >= 1 when set, kept in sync by sync_company_max_users().
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS max_users integer NULL
  CHECK (max_users IS NULL OR max_users > 0);

-- ── (B) Shared sync helper used by both plan-assignment RPCs ───────
-- Reads the company's currently active plan and writes its included_users
-- into companies.max_users. Idempotent — safe to call from any migration.
CREATE OR REPLACE FUNCTION public.sync_company_max_users(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_included int;
BEGIN
  SELECT p.included_users INTO v_included
    FROM public.company_plan_subscriptions cps
    JOIN public.plans p ON p.id = cps.plan_id
   WHERE cps.company_id = p_company_id AND cps.status = 'active'
   ORDER BY cps.started_at DESC LIMIT 1;

  UPDATE public.companies
     SET max_users = v_included, updated_at = now()
   WHERE id = p_company_id;
END;
$$;

-- ── (C) Extend change_company_plan to sync max_users ───────────────
-- Body copied verbatim from migration 20260610110000_company_plan_subscriptions.sql
-- plus PERFORM public.sync_company_max_users(p_company_id) right before RETURN.
CREATE OR REPLACE FUNCTION public.change_company_plan(
  p_company_id uuid,
  p_plan_id    text
) RETURNS public.company_plan_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid;
  v_role_name   text;
  v_sub         public.company_plan_subscriptions;
BEGIN
  SELECT u.id, r.name
    INTO v_user_id, v_role_name
  FROM public.users u
  LEFT JOIN public.app_roles r ON r.id = u.app_role_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Permission denied: user not found';
  END IF;

  IF v_role_name IS DISTINCT FROM 'super_admin' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.app_roles r ON r.id = cm.role_id
      WHERE cm.user_id = v_user_id
        AND cm.company_id = p_company_id
        AND cm.status = 'active'
        AND r.name = 'owner'
    ) THEN
      RAISE EXCEPTION 'Permission denied: must be owner of the company or super_admin';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id AND is_active = true) THEN
    RAISE EXCEPTION 'Plan % not found or inactive', p_plan_id;
  END IF;

  UPDATE public.company_plan_subscriptions
     SET status = 'cancelled', ended_at = now(), updated_at = now()
   WHERE company_id = p_company_id
     AND status = 'active';

  INSERT INTO public.company_plan_subscriptions
    (company_id, plan_id, status, assigned_by)
  VALUES
    (p_company_id, p_plan_id, 'active', v_user_id)
  RETURNING * INTO v_sub;

  UPDATE public.companies
     SET subscription_tier = p_plan_id, updated_at = now()
   WHERE id = p_company_id;

  -- NEW: keep max_users in sync with the new plan's included_users.
  PERFORM public.sync_company_max_users(p_company_id);

  RETURN v_sub;
END;
$$;

-- ── (D) Extend admin_assign_company_plan to sync max_users ─────────
-- Body copied verbatim from migration 20260610110000_company_plan_subscriptions.sql
-- plus PERFORM public.sync_company_max_users(p_company_id) right before RETURN.
CREATE OR REPLACE FUNCTION public.admin_assign_company_plan(
  p_company_id uuid,
  p_plan_id    text,
  p_notes      text DEFAULT NULL
) RETURNS public.company_plan_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_role_name text;
  v_sub       public.company_plan_subscriptions;
BEGIN
  SELECT u.id, r.name
    INTO v_user_id, v_role_name
  FROM public.users u
  LEFT JOIN public.app_roles r ON r.id = u.app_role_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_role_name IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Permission denied: super_admin required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id AND is_active = true) THEN
    RAISE EXCEPTION 'Plan % not found or inactive', p_plan_id;
  END IF;

  UPDATE public.company_plan_subscriptions
     SET status = 'cancelled', ended_at = now(), updated_at = now()
   WHERE company_id = p_company_id
     AND status = 'active';

  INSERT INTO public.company_plan_subscriptions
    (company_id, plan_id, status, assigned_by, notes)
  VALUES
    (p_company_id, p_plan_id, 'active', v_user_id, p_notes)
  RETURNING * INTO v_sub;

  UPDATE public.companies
     SET subscription_tier = p_plan_id, updated_at = now()
   WHERE id = p_company_id;

  -- NEW: keep max_users in sync with the new plan's included_users.
  PERFORM public.sync_company_max_users(p_company_id);

  RETURN v_sub;
END;
$$;

-- ── (E) check_seat_available RPC ───────────────────────────────────
-- ADR-07: TABLE(current int, max int, available int). NULL on max/available
-- means the company has no cap (NULL = unlimited, F-SEAT-002 scenario 2).
-- is_client_excluded is always true today (only non-client members are counted)
-- but kept in the signature so future refactors don't break callers.
CREATE OR REPLACE FUNCTION public.check_seat_available(p_company_id uuid)
RETURNS TABLE(current int, max int, available int, is_client_excluded boolean)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH non_client AS (
    SELECT count(*)::int AS n
      FROM public.company_members cm
      JOIN public.app_roles r ON r.id = cm.role_id
     WHERE cm.company_id = p_company_id
       AND cm.status = 'active'
       AND r.name <> 'client'
  ),
  cap AS (
    SELECT max_users FROM public.companies WHERE id = p_company_id
  )
  SELECT
    (SELECT n FROM non_client)                                                  AS current,
    (SELECT max_users FROM cap)                                                 AS max,
    CASE
      WHEN (SELECT max_users FROM cap) IS NULL THEN NULL
      ELSE (SELECT max_users FROM cap) - (SELECT n FROM non_client)
    END                                                                         AS available,
    true                                                                        AS is_client_excluded;
$$;

GRANT EXECUTE ON FUNCTION public.check_seat_available(uuid) TO authenticated;

-- ── (F) Extend accept_company_invitation with SEAT_LIMIT_EXCEEDED gate ──
-- Body copied verbatim from migration 20260525000007_fix_professional_invitation_flow.sql
-- (the latest definition as of this change) plus a STEP 0 inserted after
-- the auth/email validation block but BEFORE any company_members INSERT.
-- When the role is non-client and seats are at capacity, return the JSON
-- envelope `{success:false, code:'SEAT_LIMIT_EXCEEDED', current, max}`
-- and leave the invitation row in `pending` so the token stays valid.
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
  -- NEW (PR 2): seat-gate locals.
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

  -- NEW (PR 2): seat gate for non-client roles.
  -- Runs BEFORE the auto-create company / INSERT members path so an
  -- over-cap invite never creates an orphan user record. Token stays
  -- `pending` so retrying is idempotent.
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
      SELECT public.create_company_with_owner(v_requested_company_name, v_generated_slug, v_requested_company_nif)
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
    'role', v_invitation.role
  );
END;
$function$;

-- ── (G) Backfill max_users for existing active subscriptions ──────
-- Run AFTER the helper + assignment RPCs are in place so the helper is
-- visible. Uses the public.companies.SET updated_at trigger, so re-running
-- this migration is idempotent.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT company_id FROM public.company_plan_subscriptions WHERE status = 'active' LOOP
    PERFORM public.sync_company_max_users(r.company_id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;