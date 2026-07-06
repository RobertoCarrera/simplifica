-- ============================================================================
-- XSS regression: arbitrary HTML in sample-data values MUST be escaped by the
-- default-branch renderers (Google review branch, generic branch, and one
-- URL-attribute branch). Tenant-controlled sample-data values are never
-- trusted to be safe; the renderer is responsible for OWASP HTML encoding.
--
-- Setup: requires a company row in public.companies. We grab the first one
-- available (snapshot harness uses similar bootstrap); the test does NOT
-- insert any rows. Run after the migrations are applied:
--   20260706_email_samples_seed.sql
--   20260706000001_preview_email_template_rpc.sql
--
-- Run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q -f xss_email_render.sql
--
-- Exit code 0 = all assertions pass. Exit non-zero (with diagnostic) on
-- the first violation. Same pattern as snapshot_email_render.sql.
-- ============================================================================

BEGIN;

\echo '── XSS regression: dangerous HTML in default-branch interpolations'

DO $harness$
DECLARE
  v_company_id uuid := (SELECT id FROM public.companies ORDER BY created_at LIMIT 1);
  v_payload    jsonb;
  v_html       text;
BEGIN
  IF v_company_id IS NULL THEN
    RAISE NOTICE 'No public.companies row found — skipping XSS regression. \
                  Bootstrap a company first, then re-run.';
    RETURN;
  END IF;

  v_payload := jsonb_build_object(
    'message',     '<script>steal()</script>',
    'client_name', '<img src=x onerror=alert(1)>',
    'service_name','"><iframe src=//evil>'
  );

  -- ── generic: interpolates {{data.message}} through escape_html() ────────
  v_html := public.email_render_template(
    v_company_id, 'generic', v_payload, NULL, NULL, NULL, NULL
  );
  ASSERT v_html LIKE '%&lt;script&gt;steal()&lt;/script&gt;%',
    'generic: <script> payload should be HTML-escaped';
  ASSERT v_html NOT LIKE '%<script>steal()%',
    'generic: raw <script> payload must not appear';

  -- ── booking_reminder: also uses {{data.message}} ────────────────────────
  v_html := public.email_render_template(
    v_company_id, 'booking_reminder', v_payload, NULL, NULL, NULL, NULL
  );
  ASSERT v_html LIKE '%&lt;script&gt;steal()&lt;/script&gt;%',
    'booking_reminder: <script> payload should be HTML-escaped';
  ASSERT v_html NOT LIKE '%<script>steal()%',
    'booking_reminder: raw <script> payload must not appear';

  -- ── google_review: interpolates {{data.client_name}} in <h1> ────────────
  v_html := public.email_render_template(
    v_company_id, 'google_review', v_payload, NULL, NULL, NULL, NULL
  );
  ASSERT v_html LIKE '%&lt;img src=x onerror=alert(1)&gt;%',
    'google_review: <img onerror> payload should be HTML-escaped';
  ASSERT v_html NOT LIKE '%<img src=x%',
    'google_review: raw <img onerror> payload must not appear';

  -- ── booking_change: interpolates {{data.service_name}} in <p> ────────────
  v_html := public.email_render_template(
    v_company_id, 'booking_change', v_payload, NULL, NULL, NULL, NULL
  );
  ASSERT v_html LIKE '%&quot;&gt;&lt;iframe src=//evil&gt;%',
    'booking_change: iframe payload should be HTML-escaped';
  ASSERT v_html NOT LIKE '%<iframe%',
    'booking_change: raw <iframe> must not appear';
  ASSERT v_html NOT LIKE '%"onerror%',
    'booking_change: attribute-injection pattern must not appear';

  RAISE NOTICE 'XSS regression: OK — all dangerous payloads were escaped';
END $harness$;

\echo '── XSS regression: done'

ROLLBACK;
