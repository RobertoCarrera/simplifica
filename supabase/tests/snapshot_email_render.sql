-- ============================================================================
-- Snapshot harness: email_render_template (...) produces HTML matching every
-- expected_substring from email_sample_fixtures.
--
-- Run AFTER applying migrations:
--   20260706_email_samples_seed.sql                       (creates + seeds email_sample_fixtures)
--   20260706000001_preview_email_template_rpc.sql         (creates email_render_template)
--   20260709000001_email_block_editor_foundation.sql      (adds render_blocks_to_html + dispatch)
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q -f snapshot_email_render.sql
--
-- Exit 0 = all 26 types × all expected_substrings present + all 11 PR1 block tests passed.
-- Exit non-zero (with diagnostic message) on first failure.
--
-- Wrapped in BEGIN; ... ROLLBACK so no test data persists.
-- ============================================================================

BEGIN;

\echo '── snapshot harness: 26 types × expected_substrings'

DO $harness$
DECLARE
  v_company_id  uuid := gen_random_uuid();
  v_user_id     uuid;
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

\echo '── snapshot harness: PR1 block renderer fixtures'

-- PR1 (email-block-editor): assert render_blocks_to_html produces expected
-- HTML for the 4 MVP block types, mixed arrays, invalid props, unknown type,
-- and the javascript: post-interp XSS guard (Fix 4).
DO $blocks$
DECLARE
  v_html       text;
  v_blocks     jsonb;
  v_total      int := 0;
  v_passed     int := 0;
  v_fail_buf   text := '';
BEGIN
  -- 1. Logo block (valid http src).
  v_total := v_total + 1;
  v_blocks := jsonb_build_array(jsonb_build_object(
    'id', 'b1', 'type', 'logo', 'version', 1,
    'props', jsonb_build_object(
      'src', 'https://app.simplificacrm.es/logo.png',
      'alt', 'Acme',
      'max_height', 80,
      'max_width', 240
    )
  ));
  v_html := public.render_blocks_to_html(v_blocks);
  IF v_html LIKE '%<img%' AND v_html LIKE '%src="https://app.simplificacrm.es/logo.png"%'
     AND v_html LIKE '%alt="Acme"%' AND v_html LIKE '%max-height:80px%'
     AND v_html LIKE '%max-width:240px%' AND v_html LIKE '%<table%' THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'OK   blocks:logo — <img> wrapped in <table> with all props applied';
  ELSE
    v_fail_buf := v_fail_buf || 'blocks:logo:[missing expected substrings] ';
  END IF;

  -- 2. Heading block (level=2, color).
  v_total := v_total + 1;
  v_blocks := jsonb_build_array(jsonb_build_object(
    'id', 'b2', 'type', 'heading', 'version', 1,
    'props', jsonb_build_object(
      'text', 'Bienvenido a Simplifica',
      'level', 2,
      'color', '#FF6B35',
      'align', 'center',
      'font_size', 28
    )
  ));
  v_html := public.render_blocks_to_html(v_blocks);
  IF v_html LIKE '%<h2%' AND v_html LIKE '%Bienvenido a Simplifica%'
     AND v_html LIKE '%color:#FF6B35%' AND v_html LIKE '%font-size:28px%'
     AND v_html LIKE '%text-align:center%' THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'OK   blocks:heading — <h2> with color + font_size + align';
  ELSE
    v_fail_buf := v_fail_buf || 'blocks:heading:[missing expected substrings] ';
  END IF;

  -- 3. Paragraph block (italic + color + justify).
  v_total := v_total + 1;
  v_blocks := jsonb_build_array(jsonb_build_object(
    'id', 'b3', 'type', 'paragraph', 'version', 1,
    'props', jsonb_build_object(
      'text', 'Texto del párrafo',
      'align', 'justify',
      'color', '#374151',
      'font_size', 18,
      'italic', true
    )
  ));
  v_html := public.render_blocks_to_html(v_blocks);
  IF v_html LIKE '%<p%' AND v_html LIKE '%Texto del párrafo%'
     AND v_html LIKE '%font-style:italic%' AND v_html LIKE '%font-size:18px%'
     AND v_html LIKE '%text-align:justify%' THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'OK   blocks:paragraph — <p> italic + color + justify';
  ELSE
    v_fail_buf := v_fail_buf || 'blocks:paragraph:[missing expected substrings] ';
  END IF;

  -- 4. Button block (valid http url → <a>).
  v_total := v_total + 1;
  v_blocks := jsonb_build_array(jsonb_build_object(
    'id', 'b4', 'type', 'button', 'version', 1,
    'props', jsonb_build_object(
      'text', 'Ver factura',
      'url', 'https://app.simplificacrm.es/invoices/123',
      'background_color', '#FF6B35',
      'text_color', '#FFFFFF',
      'padding', 14,
      'border_radius', 8
    )
  ));
  v_html := public.render_blocks_to_html(v_blocks);
  IF v_html LIKE '%<a %' AND v_html LIKE '%href="https://app.simplificacrm.es/invoices/123"%'
     AND v_html LIKE '%Ver factura%' AND v_html LIKE '%background:#FF6B35%'
     AND v_html LIKE '%border-radius:8px%' THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'OK   blocks:button — <a> styled with all button props';
  ELSE
    v_fail_buf := v_fail_buf || 'blocks:button:[missing expected substrings] ';
  END IF;

  -- 5. Mixed array (all 4 types in one array).
  v_total := v_total + 1;
  v_blocks := jsonb_build_array(
    jsonb_build_object('id','m1','type','logo','version',1,
      'props', jsonb_build_object('src','https://x.test/logo.png')),
    jsonb_build_object('id','m2','type','heading','version',1,
      'props', jsonb_build_object('text','Hola','level',1)),
    jsonb_build_object('id','m3','type','paragraph','version',1,
      'props', jsonb_build_object('text','Mundo')),
    jsonb_build_object('id','m4','type','button','version',1,
      'props', jsonb_build_object('text','Click','url','https://x.test/cta'))
  );
  v_html := public.render_blocks_to_html(v_blocks);
  IF v_html LIKE '%<img%' AND v_html LIKE '%<h1%'
     AND v_html LIKE '%<p%' AND v_html LIKE '%<a %' THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'OK   blocks:mixed — all 4 types dispatch correctly';
  ELSE
    v_fail_buf := v_fail_buf || 'blocks:mixed:[missing one or more types] ';
  END IF;

  -- 6. Invalid prop (heading color = 'not-a-hex' → graceful degrade).
  v_total := v_total + 1;
  v_blocks := jsonb_build_array(jsonb_build_object(
    'id', 'i1', 'type', 'heading', 'version', 1,
    'props', jsonb_build_object(
      'text', 'Invalid color heading',
      'color', 'not-a-hex',
      'font_size', 9999  -- out of range, should clamp
    )
  ));
  v_html := public.render_blocks_to_html(v_blocks);
  IF v_html LIKE '%<h1%' AND v_html LIKE '%color:#111827%'  -- fallback default
     AND v_html LIKE '%font-size:72px%' THEN  -- clamped to max
    v_passed := v_passed + 1;
    RAISE NOTICE 'OK   blocks:invalid — invalid color + out-of-range font_size degrade gracefully';
  ELSE
    v_fail_buf := v_fail_buf || 'blocks:invalid:[invalid prop did not degrade] ';
  END IF;

  -- 7. Unknown type (forward-compat → empty).
  v_total := v_total + 1;
  v_blocks := jsonb_build_array(jsonb_build_object(
    'id', 'u1', 'type', 'spacer', 'version', 1, 'props', jsonb_build_object('height', 20)
  ));
  v_html := public.render_blocks_to_html(v_blocks);
  IF v_html = '' THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'OK   blocks:unknown — unknown type produces empty (forward-compat)';
  ELSE
    v_fail_buf := v_fail_buf || format('blocks:unknown:[expected empty, got %s chars] ', length(v_html));
  END IF;

  -- 8. FIX 4 — javascript: post-interp → <span> (not <a href="javascript:...">).
  -- The url contains a {{var}} placeholder; current_setting('app.sample_data')
  -- is set so that interpolate_safe substitutes 'javascript:alert(1)'.
  v_total := v_total + 1;
  PERFORM set_config('app.sample_data', '{"invoice_url":"javascript:alert(1)"}', true);
  v_blocks := jsonb_build_array(jsonb_build_object(
    'id', 'x1', 'type', 'button', 'version', 1,
    'props', jsonb_build_object(
      'text', 'Pagar',
      'url', '{{invoice_url}}',
      'background_color', '#4f46e5',
      'text_color', '#FFFFFF'
    )
  ));
  v_html := public.render_blocks_to_html(v_blocks);
  -- After interpolation the renderer must degrade to <span> (graceful).
  -- The literal "javascript:" must NOT appear anywhere in the output.
  IF v_html LIKE '%<span%' AND v_html NOT LIKE '%<a %' AND v_html NOT LIKE '%javascript:%' THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'OK   blocks:javascript-post-interp — Fix 4: <span> not <a href="javascript:...">';
  ELSE
    v_fail_buf := v_fail_buf || 'blocks:javascript-post-interp:[XSS guard FAILED] ';
  END IF;

  -- 9. CHECK constraint — array length > 50 → INSERT fails.
  v_total := v_total + 1;
  BEGIN
    DECLARE
      v_big_array jsonb := jsonb_build_array();
      v_i         int;
    BEGIN
      FOR v_i IN 1..51 LOOP
        v_big_array := v_big_array || jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid()::text,
          'type', 'paragraph',
          'version', 1,
          'props', jsonb_build_object('text', 'x')
        ));
      END LOOP;
      INSERT INTO public.company_email_settings (company_id, email_type, custom_blocks)
        VALUES (gen_random_uuid(), 'generic', v_big_array);
      v_fail_buf := v_fail_buf || 'blocks:check51:[INSERT with 51 blocks DID NOT fail] ';
    END;
  EXCEPTION WHEN check_violation THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'OK   blocks:check51 — CHECK constraint blocks INSERT with 51 blocks';
  END;

  -- 10-15. PR1-6type-fix: 6 simple types honor p_custom_body (AC3 + AC12).
  -- Before this follow-up migration, the SQL branches for booking_reminder,
  -- booking_cancellation, password_reset, magic_link, welcome, and
  -- staff_credentials silently dropped p_custom_body and rendered the bare
  -- default `<p style="font-size:16px;">{{message}}</p>`. Migration
  -- 20260710000001_email_block_6type_hotfix.sql adds the matching IF wrapper
  -- to each branch. These fixtures assert the fix landed: when p_custom_body
  -- is provided, the SQL output contains the custom body (interpolated), not
  -- the bare default. Mirrors the 6 parallel Deno tests in
  -- _shared/email-templates.test.ts (file lines 422-463).
  DECLARE
    v_simple_types text[] := ARRAY[
      'booking_reminder',
      'booking_cancellation',
      'password_reset',
      'magic_link',
      'welcome',
      'staff_credentials'
    ];
    v_simple_type text;
    v_custom_body text;
    v_expected    text;
  BEGIN
    FOREACH v_simple_type IN ARRAY v_simple_types LOOP
      v_total := v_total + 1;
      v_custom_body := format('<p>Custom Hello %s</p>', v_simple_type);
      v_expected := format('Custom Hello %s', v_simple_type);
      v_html := public.email_render_template(
        v_company_id,
        v_simple_type,
        jsonb_build_object('message', 'ignored-default-token'),
        NULL,
        v_custom_body,   -- p_custom_body: should be honored
        NULL,
        NULL
      );
      IF v_html LIKE format('%%%s%%', v_expected)
         AND v_html NOT LIKE '%{{message}}%' THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'OK   6type:% — honors p_custom_body (PR1-6type-fix)', v_simple_type;
      ELSE
        v_fail_buf := v_fail_buf || format('6type:%s:[p_custom_body NOT honored] ', v_simple_type);
      END IF;
    END LOOP;
  END;

  IF v_fail_buf <> '' THEN
    RAISE EXCEPTION 'snapshot_email_render BLOCKS FAILED: %. %/% passed',
      v_fail_buf, v_passed, v_total;
  END IF;

  RAISE NOTICE 'snapshot_email_render BLOCKS: %/% passed', v_passed, v_total;
END $blocks$;

\echo '── snapshot harness: done'

ROLLBACK;