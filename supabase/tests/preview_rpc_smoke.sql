-- ============================================================================
-- Smoke test: preview_email_template RPC membership guard
--
-- Verifies:
--   1. Happy path — a member calls preview_email_template(company_id,
--      'invite_owner', ...) and gets back a row with html containing the
--      expected substring ("Invitación para crear tu empresa").
--   2. Auth path — a non-member calls the same RPC and gets a
--      SQLSTATE 42501 insufficient_privilege exception.
--
-- Run AFTER applying migrations:
--   20260706_email_samples_seed.sql
--   20260706000001_preview_email_template_rpc.sql
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q -f preview_rpc_smoke.sql
--
-- Wrapped in BEGIN; ... ROLLBACK so no smoke data persists. The role
-- switch (`SET LOCAL ROLE authenticated`) is required because the public
-- RPC has GRANT EXECUTE TO authenticated — testing as superuser would
-- bypass the membership guard check (is_super_admin() would return true).
-- ============================================================================

BEGIN;

\echo '── 1. happy path: member JWT, invite_owner returns html'

DO $happy$
DECLARE
  v_company_id uuid := gen_random_uuid();
  v_user_id    uuid := gen_random_uuid();
  v_role_id    uuid;
  v_auth_uid   uuid := gen_random_uuid();
  v_html       text;
  v_sample     jsonb;
  v_got        int  := 0;
BEGIN
  INSERT INTO public.companies (id, name, settings)
    VALUES (v_company_id, 'Smoke Co', '{"branding":{"primary_color":"#FF6B35"}}'::jsonb);
  INSERT INTO public.users (id, auth_user_id, email, active, company_id)
    VALUES (v_user_id, v_auth_uid, 'member@test.invalid', true, v_company_id);
  SELECT id INTO v_role_id FROM public.app_roles WHERE name = 'owner';
  INSERT INTO public.company_members (user_id, company_id, role_id, status)
    VALUES (v_user_id, v_company_id, v_role_id, 'active');

  v_sample := jsonb_build_object(
    'invite_url', 'https://app.simplificacrm.es/invite/smoke-1',
    'inviter_name', 'Roberto',
    'invited_name', 'Ada'
  );

  -- Switch to authenticated + set auth.uid() so the RPC's
  -- is_company_member(...) resolves correctly.
  PERFORM set_config('request.jwt.claim.sub', v_auth_uid::text, true);
  SET LOCAL ROLE authenticated;

  SELECT html INTO v_html FROM public.preview_email_template(
    v_company_id,
    'invite_owner',
    v_sample,
    NULL, NULL, NULL, NULL
  );

  RESET ROLE;

  IF v_html IS NULL OR v_html = '' THEN
    RAISE EXCEPTION 'happy path: preview_email_template returned empty html';
  END IF;

  IF position('Invitación para crear tu empresa' IN v_html) = 0 THEN
    RAISE EXCEPTION 'happy path: expected substring "Invitación para crear tu empresa" not found in html: %', v_html;
  END IF;

  IF position('Roberto' IN v_html) = 0 THEN
    RAISE EXCEPTION 'happy path: expected substring "Roberto" not found in html';
  END IF;

  -- Always-present footer checks
  IF position('política de privacidad' IN v_html) = 0 THEN
    RAISE EXCEPTION 'happy path: missing privacy policy link in html';
  END IF;
  IF position('Darse de baja' IN v_html) = 0 THEN
    RAISE EXCEPTION 'happy path: missing unsubscribe link in html';
  END IF;

  v_got := 1;
  RAISE NOTICE 'OK   happy path: preview_email_template returned % bytes of html with all expected substrings',
    length(v_html);
END $happy$;

\echo '── 2. auth path: non-member JWT → 42501 insufficient_privilege'

DO $auth$
DECLARE
  v_company_id uuid := gen_random_uuid();
  v_other_uid  uuid := gen_random_uuid();
  v_auth_uid   uuid := gen_random_uuid();
  v_raised     bool := false;
  v_sqlstate   text;
  v_msg        text;
BEGIN
  INSERT INTO public.companies (id, name)
    VALUES (v_company_id, 'Smoke Auth Co');

  -- auth.uid() is v_auth_uid, who is NOT a member of v_company_id.
  PERFORM set_config('request.jwt.claim.sub', v_auth_uid::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    PERFORM public.preview_email_template(
      v_company_id,
      'invite_owner',
      '{}'::jsonb,
      NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE,
                            v_msg      = MESSAGE_TEXT;
  END;

  RESET ROLE;

  IF NOT v_raised THEN
    RAISE EXCEPTION 'auth path: expected 42501 insufficient_privilege, got no exception';
  END IF;

  IF v_sqlstate <> '42501' THEN
    RAISE EXCEPTION 'auth path: expected SQLSTATE 42501, got %', v_sqlstate;
  END IF;

  RAISE NOTICE 'OK   auth path: 42501 raised with msg: %', v_msg;
END $auth$;

\echo '── preview_rpc_smoke: done'

ROLLBACK;