-- ============================================================================
-- Snapshot harness: email_render_template (...) produces HTML matching every
-- expected_substring from email_sample_fixtures.
--
-- Run AFTER applying migrations:
--   20260706_email_samples_seed.sql               (creates + seeds email_sample_fixtures)
--   20260706000001_preview_email_template_rpc.sql (creates email_render_template)
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q -f snapshot_email_render.sql
--
-- Exit 0 = all 26 types × all expected_substrings present.
-- Exit non-zero (with diagnostic message) on first failure.
--
-- Wrapped in BEGIN; ... ROLLBACK so no test data persists.
-- ============================================================================

BEGIN;

\echo '── snapshot harness: 26 types × expected_substrings'

DO $harness$
DECLARE
  v_company_id  uuid := gen_random_uuid();
  v_user_id     uuid := gen_random_uuid();
  v_role_id     uuid;
  v_html        text;
  v_needle      text;
  v_total       int := 0;
  v_passed      int := 0;
  v_failed      int := 0;
  v_type_failed int := 0;
  v_fail_buf    text := '';
  v_fixture     record;
BEGIN
  -- Bootstrap: minimal company with branding + email_branding so the
  -- renderer has realistic inputs.
  INSERT INTO public.companies (id, name, logo_url, nif, settings)
    VALUES (
      v_company_id,
      'Snapshot Test Co',
      'https://app.simplificacrm.test/logo.png',
      'B12345678',
      jsonb_build_object(
        'branding',       jsonb_build_object('primary_color', '#FF6B35'),
        'email_branding', jsonb_build_object(
          'background_color', '#F7F7F7',
          'font_family',     'Inter, sans-serif'
        ),
        'address',        'Calle Mayor 1, Madrid'
      )
    );

  -- Wire up RLS-shape membership so the renderer can run even if the
  -- harness is later extended to call preview_email_template (which has
  -- a membership guard).
  INSERT INTO public.users (id, auth_user_id, email, active, company_id)
    VALUES (v_user_id, gen_random_uuid(), 'snapshot@test.invalid', true, v_company_id);
  SELECT id INTO v_role_id FROM public.app_roles WHERE name = 'owner';
  INSERT INTO public.company_members (user_id, company_id, role_id, status)
    VALUES (v_user_id, v_company_id, v_role_id, 'active');

  -- Walk every fixture, render, assert each expected substring present.
  FOR v_fixture IN
    SELECT email_type, sample_data, expected_substrings
      FROM public.email_sample_fixtures
      ORDER BY email_type
  LOOP
    v_total := v_total + 1;
    v_html := public.email_render_template(
      v_company_id,
      v_fixture.email_type,
      v_fixture.sample_data,
      NULL, NULL, NULL, NULL
    );

    IF v_html IS NULL OR v_html = '' THEN
      v_failed := v_failed + 1;
      v_fail_buf := v_fail_buf || format('%s:[empty html] ', v_fixture.email_type);
      CONTINUE;
    END IF;

    -- Walk expected substrings; collect per-type failures before raising.
    v_type_failed := 0;
    FOREACH v_needle IN ARRAY v_fixture.expected_substrings LOOP
      IF position(v_needle IN v_html) = 0 THEN
        v_type_failed := v_type_failed + 1;
        v_fail_buf := v_fail_buf || format('%s:[missing:%s] ', v_fixture.email_type, v_needle);
      END IF;
    END LOOP;

    IF v_type_failed > 0 THEN
      v_failed := v_failed + 1;
    ELSE
      v_passed := v_passed + 1;
      RAISE NOTICE 'OK   %: % substring(s) present',
        v_fixture.email_type, array_length(v_fixture.expected_substrings, 1);
    END IF;
  END LOOP;

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'snapshot_email_render FAILED: %/% types had missing substrings. %',
      v_failed, v_total, v_fail_buf;
  END IF;

  RAISE NOTICE 'snapshot_email_render: %/% types passed, 0 failures',
    v_passed, v_total;
END $harness$;

\echo '── snapshot harness: done'

ROLLBACK;