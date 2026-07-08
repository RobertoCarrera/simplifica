-- ============================================================================
-- Migration: Email Block Editor — Foundation (PR1 of email-block-editor change)
--
-- Scope of PR1 (per design v2 §7):
--   1. Add `custom_blocks JSONB` column to company_email_settings with a CHECK
--      constraint bounding the array to ≤50 entries and <100KB (Fix 5).
--   2. Add 4 per-type block renderers (logo/heading/paragraph/button).
--   3. Add the `render_blocks_to_html(jsonb)` dispatcher.
--   4. Add the `default_email_body(text)` RPC (single-arg, Fix 6) — exposes
--      the per-type default HTML so the client auto-seed flow can parse it.
--   5. Add `p_custom_blocks jsonb` parameter to `preview_email_template` and
--      `email_render_template`, with a TOP-LEVEL dispatch for `p_custom_blocks`
--      in `email_render_template`. Per-type `p_custom_body` IF checks stay
--      VERBATIM (conservative refactor — see apply-progress for the rationale).
--   6. GRANT/REVOKE for the 6 new functions (4 renderers, 1 dispatcher, 1 RPC).
--
-- Explicitly OUT of PR1 (deferred to PR1-6type-fix follow-up):
--   - Hoisting the `p_custom_body` IF check from per-type branches to the top
--     (would change behavior for the 6 simple types — `accepted risk` until
--     PR1-6type-fix lands; per user decision 2026-07-09).
--   - Fixing the 6 simple types (`booking_reminder`, `booking_cancellation`,
--     `password_reset`, `magic_link`, `welcome`, `staff_credentials`) to honor
--     `p_custom_body` — they currently drop it and will continue to drop it
--     in PR1.
--   - All UI work (BlockEditorComponent, etc.) — ships in PR2a.
--
-- New SQL surface (all behind the search_path = '' hardening pattern):
--   - render_block_logo(jsonb)         RETURNS text   STABLE  SECDEF
--   - render_block_heading(jsonb)      RETURNS text   STABLE  SECDEF
--   - render_block_paragraph(jsonb)    RETURNS text   STABLE  SECDEF
--   - render_block_button(jsonb)       RETURNS text   STABLE  SECDEF
--                                        (post-interp URL re-validation per Fix 4)
--   - render_blocks_to_html(jsonb)     RETURNS text   STABLE  SECDEF
--   - default_email_body(text)         RETURNS text   STABLE  SECDEF
--                                        (GRANT EXECUTE TO authenticated — auto-seed)
--   - preview_email_template(...)      now accepts p_custom_blocks jsonb DEFAULT NULL
--   - email_render_template(...)       now accepts p_custom_blocks jsonb DEFAULT NULL
--                                       + top-level dispatch for blocks
--
-- Source of truth: server. SQL renderer is canonical. The TS mirror in
-- _shared/email-templates.ts is for snapshot-test parity and Edge delivery.
-- Drift closed by supabase/tests/snapshot_email_render.sql.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ALTER TABLE — add custom_blocks JSONB column with CHECK constraint
--    (Fix 5: bounds the JSONB to prevent DoS via unbounded payload).
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.company_email_settings
  ADD COLUMN IF NOT EXISTS custom_blocks JSONB;

-- CHECK constraint added separately so existing rows don't fail validation
-- (the column was just created as NULL, so this is safe).
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'company_email_settings_custom_blocks_check'
  ) THEN
    ALTER TABLE public.company_email_settings
      ADD CONSTRAINT company_email_settings_custom_blocks_check
      CHECK (
        custom_blocks IS NULL
        OR (
          jsonb_typeof(custom_blocks) = 'array'
          AND jsonb_array_length(custom_blocks) <= 50
          AND octet_length(custom_blocks::text) < 100000
        )
      );
  END IF;
END $do$;

COMMENT ON COLUMN public.company_email_settings.custom_blocks IS
  'JSONB array of Block objects (logo/heading/paragraph/button). Replaces the '
  'legacy custom_body_template path for the block editor. CHECK-constrained '
  'to ≤50 entries and <100KB to prevent DoS. NULL = use legacy path.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. render_block_logo(p_props jsonb) — RETURNS text
--    Wraps <img> in <table> for Outlook/Gmail compatibility.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.render_block_logo(p_props jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_src        text;
  v_alt        text;
  v_max_h      int;
  v_max_w      int;
  v_safe_src   text;
BEGIN
  v_src   := COALESCE(p_props->>'src', '');
  v_alt   := LEFT(COALESCE(p_props->>'alt', ''), 200);
  v_max_h := LEAST(GREATEST(COALESCE((p_props->>'max_height')::int, 60), 20), 200);
  v_max_w := LEAST(GREATEST(COALESCE((p_props->>'max_width')::int, 200), 50), 600);

  -- Refuse non-http(s) sources; log nothing (silent forward-compat degradation).
  IF v_src !~ '^https?://' THEN
    RETURN '';
  END IF;
  v_safe_src := public.escape_html(v_src);

  RETURN '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;"><tr><td style="text-align:center;">'
    || '<img src="' || v_safe_src || '" alt="' || public.escape_html(v_alt) || '" '
    || 'style="display:block;max-height:' || v_max_h || 'px;max-width:' || v_max_w || 'px;height:auto;width:auto;border:0;">'
    || '</td></tr></table>';
END;
$$;

REVOKE ALL ON FUNCTION public.render_block_logo(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.render_block_logo(jsonb) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. render_block_heading(p_props jsonb) — RETURNS text
--    Emits <h{level}> wrapped in <table>. {{var}} in `text` passes through.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.render_block_heading(p_props jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text      text;
  v_level     int;
  v_color     text;
  v_align     text;
  v_font_size int;
BEGIN
  v_text      := LEFT(COALESCE(p_props->>'text', ''), 200);
  v_level     := CASE (p_props->>'level')
                   WHEN '1' THEN 1 WHEN '2' THEN 2 WHEN '3' THEN 3
                   ELSE 1 END;
  v_color     := CASE WHEN p_props->>'color' ~ '^#[0-9A-Fa-f]{6}$'
                      THEN p_props->>'color' ELSE '#111827' END;
  v_align     := CASE p_props->>'align'
                   WHEN 'left' THEN 'left' WHEN 'right' THEN 'right'
                   ELSE 'center' END;
  v_font_size := LEAST(GREATEST(COALESCE((p_props->>'font_size')::int, 24), 12), 72);

  RETURN '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0;"><tr><td style="text-align:' || v_align || ';">'
    || '<h' || v_level || ' style="margin:0;color:' || v_color || ';font-size:' || v_font_size || 'px;line-height:1.3;font-weight:700;">'
    || v_text
    || '</h' || v_level || '>'
    || '</td></tr></table>';
END;
$$;

REVOKE ALL ON FUNCTION public.render_block_heading(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.render_block_heading(jsonb) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. render_block_paragraph(p_props jsonb) — RETURNS text
--    Emits <p> with text/align/color/font_size/italic. {{var}} passes through.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.render_block_paragraph(p_props jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_text      text;
  v_align     text;
  v_color     text;
  v_font_size int;
  v_italic    boolean;
BEGIN
  v_text      := LEFT(COALESCE(p_props->>'text', ''), 5000);
  v_align     := CASE p_props->>'align'
                   WHEN 'left' THEN 'left' WHEN 'right' THEN 'right'
                   WHEN 'justify' THEN 'justify'
                   ELSE 'left' END;
  v_color     := CASE WHEN p_props->>'color' ~ '^#[0-9A-Fa-f]{6}$'
                      THEN p_props->>'color' ELSE '#374151' END;
  v_font_size := LEAST(GREATEST(COALESCE((p_props->>'font_size')::int, 16), 12), 32);
  v_italic    := COALESCE((p_props->>'italic')::boolean, false);

  RETURN '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:12px 0;"><tr><td style="text-align:' || v_align || ';">'
    || '<p style="margin:0;color:' || v_color || ';font-size:' || v_font_size || 'px;line-height:1.5;'
    || CASE WHEN v_italic THEN 'font-style:italic;' ELSE '' END
    || '">' || v_text || '</p>'
    || '</td></tr></table>';
END;
$$;

REVOKE ALL ON FUNCTION public.render_block_paragraph(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.render_block_paragraph(jsonb) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. render_block_button(p_props jsonb) — RETURNS text
--    FIX 4: post-interpolation URL re-validation. A literal `javascript:` URL
--    is blocked at the regex pre-check, but if `url = '{{x}}'` and
--    `sample_data.x = 'javascript:alert(1)'`, the substituted string slips
--    through. The strict post-interp regex re-validates and degrades to a
--    `<span>` styled like the button if the substituted URL is unsafe.
--    Returns '' if neither p_props nor a substituted url can be obtained.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.render_block_button(p_props jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw_url   text;
  v_safe_url  text;
  v_text      text;
  v_bg        text;
  v_fg        text;
  v_padding   int;
  v_radius    int;
  v_align     text;
  v_btn_style text;
  v_open_tag  text;
  v_close_tag text;
BEGIN
  v_raw_url := COALESCE(p_props->>'url', '');
  v_text    := LEFT(COALESCE(p_props->>'text', 'Click aquí'), 100);
  v_bg      := CASE WHEN p_props->>'background_color' ~ '^#[0-9A-Fa-f]{6}$'
                    THEN p_props->>'background_color' ELSE '#4f46e5' END;
  v_fg      := CASE WHEN p_props->>'text_color' ~ '^#[0-9A-Fa-f]{6}$'
                    THEN p_props->>'text_color' ELSE '#FFFFFF' END;
  v_padding := LEAST(GREATEST(COALESCE((p_props->>'padding')::int, 12), 4), 32);
  v_radius  := LEAST(GREATEST(COALESCE((p_props->>'border_radius')::int, 6), 0), 24);
  v_align   := CASE p_props->>'align'
                 WHEN 'left' THEN 'left' WHEN 'right' THEN 'right'
                 ELSE 'center' END;

  v_btn_style := 'display:inline-block;background:' || v_bg || ';color:' || v_fg
    || ';padding:' || v_padding || 'px 24px;text-decoration:none;border-radius:'
    || v_radius || 'px;font-weight:bold;font-size:16px;';

  -- Pre-interp URL must look like http(s)/mailto/{{var}; otherwise degrade.
  IF v_raw_url !~ '^(https?://|mailto:|\{\{).*$' THEN
    v_safe_url := '';
  ELSE
    v_safe_url := public.interpolate_safe(v_raw_url,
                  COALESCE(current_setting('app.sample_data', true)::jsonb, '{}'::jsonb));
  END IF;

  -- POST-INTERP re-validation (Fix 4): strict regex only allows http(s)/mailto/
  -- fragment/root-relative. Rejects javascript:, data:, and anything else.
  IF v_safe_url ~ '^(https?://|mailto:|#|/)[^\s]*$' THEN
    v_open_tag  := '<a href="' || public.escape_html(v_safe_url) || '" style="' || v_btn_style || '">';
    v_close_tag := '</a>';
  ELSE
    v_open_tag  := '<span style="' || v_btn_style || 'cursor:default;">';
    v_close_tag := '</span>';
  END IF;

  RETURN '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:' || v_align || ';">'
    || v_open_tag || public.escape_html(v_text) || v_close_tag
    || '</td></tr></table>';
END;
$$;

REVOKE ALL ON FUNCTION public.render_block_button(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.render_block_button(jsonb) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. render_blocks_to_html(p_blocks jsonb) — RETURNS text
--    Dispatcher: walks the array, dispatches per `type`. Unknown → ''.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.render_blocks_to_html(p_blocks jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_block jsonb;
  v_type  text;
  v_props jsonb;
  v_html  text := '';
BEGIN
  IF p_blocks IS NULL OR jsonb_typeof(p_blocks) <> 'array' THEN
    RETURN '';
  END IF;

  FOR v_block IN SELECT * FROM jsonb_array_elements(p_blocks) LOOP
    v_type  := COALESCE(v_block->>'type', '');
    v_props := COALESCE(v_block->>'props', '{}'::jsonb);
    CASE v_type
      WHEN 'logo'      THEN v_html := v_html || public.render_block_logo(v_props);
      WHEN 'heading'   THEN v_html := v_html || public.render_block_heading(v_props);
      WHEN 'paragraph' THEN v_html := v_html || public.render_block_paragraph(v_props);
      WHEN 'button'    THEN v_html := v_html || public.render_block_button(v_props);
      ELSE v_html := v_html || '';   -- unknown type → empty (graceful forward-compat)
    END CASE;
  END LOOP;

  RETURN v_html;
END;
$$;

REVOKE ALL ON FUNCTION public.render_blocks_to_html(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.render_blocks_to_html(jsonb) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. default_email_body(p_email_type text) — RETURNS text
--    Returns the per-type default HTML (single-arg, no companyId — Fix 6).
--    Used by the Angular auto-seed flow: client calls
--    getDefaultBody(emailType) → parses HTML → Block[] → populates the editor.
--    The HTML uses placeholder branding (#4f46e5 primary, no logo); the parser
--    recognizes structure via regex and replaces with real branding later.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.default_email_body(p_email_type text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_html text;
BEGIN
  CASE p_email_type
    WHEN 'booking_confirmation' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Reserva confirmada</h1></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Servicio</td><td style="padding:8px 0;border-bottom:1px solid #eee;">{{servicio}}</td></tr><tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #eee;">{{fecha}}</td></tr><tr><td style="padding:8px 0;font-weight:bold;">Hora</td><td style="padding:8px 0;">{{hora}}</td></tr></table>';
    WHEN 'invoice' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Factura {{numero_factura}}</h1></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invoice_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Ver factura PDF</a></td></tr></table>';
    WHEN 'quote' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Presupuesto {{numero_presupuesto}}</h1></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{quote_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Ver presupuesto</a></td></tr></table>';
    WHEN 'consent' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Solicitud de consentimiento RGPD</h1><p>Solicitamos su consentimiento para el tratamiento de sus datos personales.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{consent_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Revisar y validar datos</a></td></tr></table>';
    WHEN 'invite' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Has recibido una invitación para unirte.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>';
    WHEN 'invite_owner' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Invitación para crear tu empresa</h1><p>Has recibido una invitación para crear tu empresa.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar e introducir datos de empresa</a></td></tr></table>';
    WHEN 'invite_admin' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Tu rol: <strong>Administrador</strong></p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>';
    WHEN 'invite_member' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Tu rol: <strong>Miembro</strong></p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>';
    WHEN 'invite_professional' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Tu rol: <strong>Profesional</strong></p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>';
    WHEN 'invite_agent' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Tu rol: <strong>Agente</strong></p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>';
    WHEN 'invite_marketer' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Tu rol: <strong>Marketing</strong></p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>';
    WHEN 'invite_client' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Después de aceptar, podrás acceder al portal de clientes.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>';
    WHEN 'waitlist' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">¡Estás en la lista!</h1><p>Te avisaremos cuando puedas reservar.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{waitlist_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Reservar ahora</a></td></tr></table>';
    WHEN 'inactive_notice' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td><h1 style="color:#4f46e5;margin:0 0 16px 0;">Clientes inactivos</h1><p>Los siguientes clientes no han tenido actividad reciente:</p><ul style="list-style:none;padding:0;"></ul></td></tr></table>';
    WHEN 'generic' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td><p style="font-size:16px;color:#333;">{{message}}</p></td></tr></table>';
    WHEN 'google_review' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">¡Gracias por tu visita!</h1><p>Tu opinión nos ayuda a seguir mejorando.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{review_url}}" style="display:inline-block;background:#4285f4;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">★★★★★ Dejar Google Review</a></td></tr></table>';
    WHEN 'booking_reminder' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td><p style="font-size:16px;color:#333;">{{message}}</p></td></tr></table>';
    WHEN 'booking_cancellation' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td><p style="font-size:16px;color:#333;">{{message}}</p></td></tr></table>';
    WHEN 'password_reset' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td><p style="font-size:16px;color:#333;">{{message}}</p></td></tr></table>';
    WHEN 'magic_link' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td><p style="font-size:16px;color:#333;">{{message}}</p></td></tr></table>';
    WHEN 'welcome' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td><p style="font-size:16px;color:#333;">{{message}}</p></td></tr></table>';
    WHEN 'staff_credentials' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td><p style="font-size:16px;color:#333;">{{message}}</p></td></tr></table>';
    WHEN 'budget_created' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Nuevo presupuesto disponible</h1><p>{{intro}}</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{payment_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Ver presupuesto</a></td></tr></table>';
    WHEN 'budget_reminder' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Tu presupuesto vence pronto</h1><p>{{intro}}</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{payment_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Ver presupuesto</a></td></tr></table>';
    WHEN 'budget_overdue' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#dc2626;margin:0 0 16px 0;">Presupuesto vencido</h1><p>{{intro}}</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{payment_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Ver presupuesto</a></td></tr></table>';
    WHEN 'booking_change' THEN
      v_html := '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Tu reserva se ha modificado</h1><p>{{service_name}}</p><p><strong>Fecha y hora:</strong> {{starts_at}}</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{booking_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Ver detalles</a></td></tr></table>';
    ELSE
      RAISE EXCEPTION 'Unsupported email_type: %', p_email_type USING ERRCODE = '22023';
  END CASE;

  RETURN v_html;
END;
$$;

REVOKE ALL ON FUNCTION public.default_email_body(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.default_email_body(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.default_email_body(text) TO authenticated;

COMMENT ON FUNCTION public.default_email_body(text) IS
  'Returns the per-type default HTML for the given email_type (single-arg, '
  'Fix 6 — no companyId; defaults are NOT company-scoped). Used by the '
  'Angular auto-seed flow: client parses this HTML into Block[] and populates '
  'the FormArray. Uses placeholder branding (#4f46e5 primary, no logo); the '
  'client parser recognizes structure via regex and replaces with real '
  'branding when re-rendering.';

-- ────────────────────────────────────────────────────────────────────────────
-- 8. email_render_template REPLACE
--    Changes from baseline:
--      a) New parameter `p_custom_blocks jsonb DEFAULT NULL` added at the
--         END of the parameter list (positional compat preserved for callers
--         that don't pass it).
--      b) TOP-LEVEL dispatch: if p_custom_blocks IS NOT NULL, render blocks
--         and skip the per-type CASE entirely. The dispatch is HOISTED from
--         per-type branches (where the previous broken impl duplicated it
--         26 times) to a single ~5 LOC check at the top.
--      c) Per-type CASE branches: VERBATIM — the existing IF p_custom_body
--         checks inside the 20 branches that honor p_custom_body stay
--         exactly as they were. The 6 simple types (booking_reminder,
--         booking_cancellation, password_reset, magic_link, welcome,
--         staff_credentials) continue to drop p_custom_body — this is an
--         accepted risk per user decision 2026-07-09, fixed in PR1-6type-fix.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.email_render_template(
  p_company_id       uuid,
  p_email_type       text,
  p_sample_data      jsonb,
  p_custom_subject   text DEFAULT NULL,
  p_custom_body      text DEFAULT NULL,
  p_custom_header    text DEFAULT NULL,
  p_custom_button_text text DEFAULT NULL,
  p_app_url          text DEFAULT 'https://app.simplificacrm.es',
  p_custom_blocks    jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_company_name       text;
  v_logo_url           text;
  v_primary_color      text;
  v_background_color   text;
  v_font_family        text;
  v_nif                text;
  v_html               text := '';
  v_header_block       text := '';
  v_btn_text           text;
BEGIN
  SELECT name, COALESCE(logo_url::text, ''),
         COALESCE(settings->'branding'->>'primary_color', '#4f46e5'),
         COALESCE(settings->'email_branding'->>'background_color', '#F9FAFB'),
         COALESCE(regexp_replace(settings->'email_branding'->>'font_family', '[''"<>&]', '', 'g'), 'Arial'),
         COALESCE(nif::text, '')
    INTO v_company_name, v_logo_url, v_primary_color, v_background_color, v_font_family, v_nif
    FROM public.companies WHERE id = p_company_id;

  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'Company % not found', p_company_id USING ERRCODE = 'P0002';
  END IF;

  -- ── TOP-LEVEL DISPATCH (NEW in PR1) ───────────────────────────────────────
  -- If p_custom_blocks is set, render the blocks path and skip the per-type
  -- CASE entirely. This is the precedence contract: blocks win over body
  -- and over per-type default. (The p_custom_body check stays in the
  -- per-type branches where it currently exists — see file header.)
  IF p_custom_blocks IS NOT NULL THEN
    v_html := public.interpolate_safe(
      public.render_blocks_to_html(p_custom_blocks),
      p_sample_data
    );
  ELSE
    CASE p_email_type

    WHEN 'booking_confirmation' THEN
      IF p_custom_body IS NOT NULL AND p_custom_body <> '' THEN
        v_html := public.interpolate_safe(p_custom_body, p_sample_data);
      ELSE
        v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;background-color:' || v_background_color || ';max-width:600px;margin:0 auto;padding:20px;color:#333;">'
          || '<div style="text-align:center;padding:20px 0;">'
          || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
          || '</div>'
          || '<h1 style="color:' || v_primary_color || ';text-align:center;">Reserva confirmada</h1>'
          || '<table style="width:100%;border-collapse:collapse;margin:20px 0;">'
          || '<tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Servicio</td><td style="padding:8px 0;border-bottom:1px solid #eee;">' || COALESCE(public.escape_html(p_sample_data->>'servicio'), '') || '</td></tr>'
          || '<tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #eee;">' || COALESCE(public.escape_html(p_sample_data->>'fecha'), '') || '</td></tr>'
          || '<tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Hora</td><td style="padding:8px 0;border-bottom:1px solid #eee;">' || COALESCE(public.escape_html(p_sample_data->>'hora'), '') || '</td></tr>'
          || '<tr><td style="padding:8px 0;font-weight:bold;">Empresa</td><td style="padding:8px 0;">' || COALESCE(NULLIF(public.escape_html(p_sample_data->>'empresa'), ''), v_company_name) || '</td></tr>'
          || '</table>'
          || '</body></html>';
      END IF;

    WHEN 'invoice' THEN
      IF p_custom_body IS NOT NULL AND p_custom_body <> '' THEN
        v_html := public.interpolate_safe(p_custom_body, p_sample_data);
      ELSE
        v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
          || '<div style="text-align:center;padding:20px 0;">'
          || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
          || '</div>'
          || '<h1 style="color:' || v_primary_color || ';text-align:center;">Factura ' || COALESCE(public.escape_html(p_sample_data->>'numero_factura'), '') || '</h1>'
          || '<div style="text-align:center;">'
          || CASE WHEN p_sample_data ? 'invoice_url' THEN '<a href="' || public.escape_html(p_sample_data->>'invoice_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">' || COALESCE(NULLIF(p_custom_button_text, ''), 'Ver factura PDF') || '</a>' ELSE '' END
          || '</div>'
          || '</body></html>';
      END IF;

    WHEN 'quote' THEN
      IF p_custom_body IS NOT NULL AND p_custom_body <> '' THEN
        v_html := public.interpolate_safe(p_custom_body, p_sample_data);
      ELSE
        v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
          || '<div style="text-align:center;padding:20px 0;">'
          || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
          || '</div>'
          || '<h1 style="color:' || v_primary_color || ';text-align:center;">Presupuesto ' || COALESCE(public.escape_html(p_sample_data->>'numero_presupuesto'), '') || '</h1>'
          || '<div style="text-align:center;">'
          || CASE WHEN p_sample_data ? 'quote_url' THEN '<a href="' || public.escape_html(p_sample_data->>'quote_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">' || COALESCE(NULLIF(p_custom_button_text, ''), 'Ver presupuesto') || '</a>' ELSE '' END
          || '</div>'
          || '</body></html>';
      END IF;

    WHEN 'consent' THEN
      IF p_custom_body IS NOT NULL AND p_custom_body <> '' THEN
        v_html := public.interpolate_safe(p_custom_body, p_sample_data);
      ELSE
        v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
          || '<div style="text-align:center;padding:20px 0;">'
          || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
          || '</div>'
          || '<h1 style="color:' || v_primary_color || ';text-align:center;">Solicitud de consentimiento RGPD</h1>'
          || '<p style="text-align:center;">Solicitamos su consentimiento para el tratamiento de sus datos personales.</p>'
          || '<div style="text-align:center;">'
          || CASE WHEN p_sample_data ? 'consent_url' THEN '<a href="' || public.escape_html(p_sample_data->>'consent_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">' || COALESCE(NULLIF(p_custom_button_text, ''), 'Revisar y validar datos') || '</a>' ELSE '' END
          || '</div>'
          || '</body></html>';
      END IF;

    WHEN 'invite' THEN
      IF p_custom_body IS NOT NULL AND p_custom_body <> '' THEN
        v_html := public.interpolate_safe(p_custom_body, p_sample_data);
      ELSE
        v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
          || '<div style="text-align:center;padding:20px 0;">'
          || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
          || '</div>'
          || '<h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
          || '<p style="text-align:center;font-size:16px;color:#374151;margin:20px 0;">Has recibido una invitación para unirte a <strong>' || v_company_name || '</strong>.</p>'
          || '<div style="text-align:center;">'
          || CASE WHEN p_sample_data ? 'invite_url' THEN '<a href="' || public.escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a>' ELSE '' END
          || '</div>'
          || '</body></html>';
      END IF;

    WHEN 'invite_owner' THEN
      IF p_custom_body IS NOT NULL AND p_custom_body <> '' THEN
        v_html := public.interpolate_safe(p_custom_body, p_sample_data);
      ELSE
        v_btn_text := COALESCE(NULLIF(p_custom_button_text, ''), 'Aceptar e introducir datos de empresa');
        v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
          || '<div style="text-align:center;padding:20px 0;">'
          || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
          || '</div>'
          || '<h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Invitación para crear tu empresa</h1>'
          || '<p style="text-align:center;font-size:16px;color:#374151;margin:20px 0;">Has recibido una invitación para crear <strong>' || v_company_name || '</strong>.</p>'
          || '<div style="text-align:center;">'
          || CASE WHEN p_sample_data ? 'invite_url' THEN '<a href="' || public.escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">' || v_btn_text || '</a>' ELSE '' END
          || '</div>'
          || '</body></html>';
      END IF;

    WHEN 'invite_admin' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div><h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">Tu rol: <strong>Administrador</strong></p>'
        || '<div style="text-align:center;"><a href="' || public.escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a></div></body></html>';

    WHEN 'invite_member' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div><h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">Tu rol: <strong>Miembro</strong></p>'
        || '<div style="text-align:center;"><a href="' || public.escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a></div></body></html>';

    WHEN 'invite_professional' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div><h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">Tu rol: <strong>Profesional</strong></p>'
        || '<div style="text-align:center;"><a href="' || public.escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a></div></body></html>';

    WHEN 'invite_agent' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div><h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">Tu rol: <strong>Agente</strong></p>'
        || '<div style="text-align:center;"><a href="' || public.escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a></div></body></html>';

    WHEN 'invite_marketer' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div><h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">Tu rol: <strong>Marketing</strong></p>'
        || '<div style="text-align:center;"><a href="' || public.escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a></div></body></html>';

    WHEN 'invite_client' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div><h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
        || '<p style="text-align:center;color:#6b7280;font-size:13px;">Después de aceptar, podrás acceder al portal de clientes de ' || v_company_name || ' para gestionar tus reservas y documentos.</p>'
        || '<div style="text-align:center;"><a href="' || public.escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a></div></body></html>';

    WHEN 'waitlist' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
        || '<div style="background:linear-gradient(135deg,' || v_primary_color || ',#1e40af);padding:30px 20px;text-align:center;"><span style="color:#fff;font-size:18px;font-weight:bold;">Simplifica CRM</span></div>'
        || '<h1 style="color:' || v_primary_color || ';text-align:center;">' || COALESCE(NULLIF(public.escape_html(p_sample_data->>'heading'), ''), '¡Estás en la lista!') || '</h1>'
        || '<p style="text-align:center;font-size:16px;color:#555;">' || COALESCE(NULLIF(public.escape_html(p_sample_data->>'body_text'), ''), 'Te avisaremos cuando puedas reservar.') || '</p>'
        || '<div style="text-align:center;">'
        || CASE WHEN p_sample_data ? 'waitlist_url' THEN '<a href="' || public.escape_html(p_sample_data->>'waitlist_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Reservar ahora</a>' ELSE '' END
        || '</div></body></html>';

    WHEN 'inactive_notice' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
        || '<div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div>'
        || '<h1 style="color:' || v_primary_color || ';text-align:center;">Clientes inactivos</h1>'
        || '<p>Los siguientes clientes no han tenido actividad reciente:</p>'
        || '<ul style="list-style:none;padding:0;">'
        || array_to_string(
             (SELECT array_agg('<li style="padding:4px 0;">' || public.escape_html(name) || '</li>')
              FROM jsonb_array_elements_text(COALESCE(p_sample_data->'client_names', '[]'::jsonb)) AS name),
             ''
           )
        || '</ul></body></html>';

    WHEN 'generic' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
        || '<div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div>'
        || '<p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p>'
        || '</body></html>';

    WHEN 'google_review' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
        || '<div style="text-align:center;padding:24px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div>'
        || '<h1 style="color:' || v_primary_color || ';text-align:center;font-size:24px;">¡Gracias por tu visita, ' || COALESCE(public.escape_html(p_sample_data->>'client_name'), '') || '!</h1>'
        || '<p style="text-align:center;font-size:16px;color:#555;margin:16px 0;">Tu opinión nos ayuda a seguir mejorando y a dar a conocer nuestro trabajo.</p>'
        || '<div style="text-align:center;margin:28px 0;"><a href="' || COALESCE(NULLIF(public.escape_html(p_sample_data->>'review_url'), ''), 'https://g.page/review') || '" style="display:inline-block;background:#4285f4;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">★★★★★ Dejar Google Review</a></div>'
        || '</body></html>';

    WHEN 'booking_reminder' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p></body></html>';

    WHEN 'booking_cancellation' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p></body></html>';

    WHEN 'password_reset' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p></body></html>';

    WHEN 'magic_link' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p></body></html>';

    WHEN 'welcome' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p></body></html>';

    WHEN 'staff_credentials' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p></body></html>';

    WHEN 'budget_created' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:0;color:#333;background-color:' || v_background_color || ';"><div style="background:' || v_primary_color || ';height:6px;"></div><div style="padding:24px 20px;">'
        || '<div style="text-align:center;padding:16px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div>'
        || '<h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Nuevo presupuesto disponible</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">' || COALESCE(NULLIF(public.escape_html(p_sample_data->>'intro'), ''), 'Ya está disponible tu presupuesto.') || '</p>'
        || CASE WHEN p_sample_data ? 'period_label' THEN '<p style="text-align:center;color:#6b7280;font-size:14px;">Periodo: <strong>' || public.escape_html(p_sample_data->>'period_label') || '</strong></p>' ELSE '' END
        || CASE WHEN p_sample_data ? 'total_formatted' THEN '<p style="text-align:center;color:#111;font-size:28px;font-weight:bold;margin:12px 0;">' || public.escape_html(p_sample_data->>'total_formatted') || '</p>' ELSE '' END
        || '<div style="text-align:center;">'
        || CASE WHEN p_sample_data ? 'payment_url' THEN '<a href="' || public.escape_html(p_sample_data->>'payment_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin:24px 0;">' || COALESCE(NULLIF(p_custom_button_text, ''), NULLIF(public.escape_html(p_sample_data->>'cta_text'), ''), 'Ver presupuesto') || '</a>' ELSE '' END
        || '</div></div></body></html>';

    WHEN 'budget_reminder' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:0;color:#333;background-color:' || v_background_color || ';"><div style="background:#f59e0b;height:6px;"></div><div style="padding:24px 20px;">'
        || '<div style="text-align:center;padding:16px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div>'
        || '<h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Tu presupuesto vence pronto</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">' || COALESCE(NULLIF(public.escape_html(p_sample_data->>'intro'), ''), 'Tu presupuesto vence pronto.') || '</p>'
        || CASE WHEN p_sample_data ? 'period_label' THEN '<p style="text-align:center;color:#6b7280;font-size:14px;">Periodo: <strong>' || public.escape_html(p_sample_data->>'period_label') || '</strong></p>' ELSE '' END
        || CASE WHEN p_sample_data ? 'due_date_formatted' THEN '<p style="text-align:center;color:#6b7280;font-size:14px;">Fecha de vencimiento: <strong>' || public.escape_html(p_sample_data->>'due_date_formatted') || '</strong></p>' ELSE '' END
        || CASE WHEN p_sample_data ? 'total_formatted' THEN '<p style="text-align:center;color:#111;font-size:28px;font-weight:bold;margin:12px 0;">' || public.escape_html(p_sample_data->>'total_formatted') || '</p>' ELSE '' END
        || '<div style="text-align:center;">'
        || CASE WHEN p_sample_data ? 'payment_url' THEN '<a href="' || public.escape_html(p_sample_data->>'payment_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin:24px 0;">' || COALESCE(NULLIF(p_custom_button_text, ''), NULLIF(public.escape_html(p_sample_data->>'cta_text'), ''), 'Ver presupuesto') || '</a>' ELSE '' END
        || '</div></div></body></html>';

    WHEN 'budget_overdue' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:0;color:#333;background-color:' || v_background_color || ';"><div style="background:#dc2626;height:6px;"></div><div style="padding:24px 20px;">'
        || '<div style="text-align:center;padding:16px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div>'
        || '<h1 style="color:#dc2626;text-align:center;font-size:22px;">Presupuesto vencido</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">' || COALESCE(NULLIF(public.escape_html(p_sample_data->>'intro'), ''), 'Tu presupuesto ha vencido y aún no hemos recibido el pago.') || '</p>'
        || CASE WHEN p_sample_data ? 'period_label' THEN '<p style="text-align:center;color:#6b7280;font-size:14px;">Periodo: <strong>' || public.escape_html(p_sample_data->>'period_label') || '</strong></p>' ELSE '' END
        || CASE WHEN p_sample_data ? 'due_date_formatted' THEN '<p style="text-align:center;color:#6b7280;font-size:14px;">Fecha de vencimiento: <strong>' || public.escape_html(p_sample_data->>'due_date_formatted') || '</strong></p>' ELSE '' END
        || CASE WHEN p_sample_data ? 'total_formatted' THEN '<p style="text-align:center;color:#111;font-size:28px;font-weight:bold;margin:12px 0;">' || public.escape_html(p_sample_data->>'total_formatted') || '</p>' ELSE '' END
        || '<div style="text-align:center;">'
        || CASE WHEN p_sample_data ? 'payment_url' THEN '<a href="' || public.escape_html(p_sample_data->>'payment_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin:24px 0;">' || COALESCE(NULLIF(p_custom_button_text, ''), NULLIF(public.escape_html(p_sample_data->>'cta_text'), ''), 'Ver presupuesto') || '</a>' ELSE '' END
        || '</div></div></body></html>';

    WHEN 'booking_change' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:0;color:#333;background-color:' || v_background_color || ';"><div style="background:' || v_primary_color || ';height:6px;"></div><div style="padding:24px 20px;">'
        || '<div style="text-align:center;padding:16px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div>'
        || '<h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Tu reserva se ha modificado</h1>'
        || CASE WHEN p_sample_data ? 'service_name' THEN '<p style="text-align:center;color:#111;font-size:18px;font-weight:600;">' || public.escape_html(p_sample_data->>'service_name') || '</p>' ELSE '' END
        || CASE WHEN p_sample_data ? 'starts_at' THEN '<p style="text-align:center;color:#374151;font-size:15px;"><strong>Fecha y hora:</strong> ' || public.escape_html(p_sample_data->>'starts_at') || '</p>' ELSE '' END
        || '<div style="text-align:center;">'
        || CASE WHEN p_sample_data ? 'booking_url' THEN '<a href="' || public.escape_html(p_sample_data->>'booking_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin:24px 0;">Ver detalles</a>' ELSE '' END
        || '</div></div></body></html>';

    ELSE
      RAISE EXCEPTION 'Unsupported email_type: %', p_email_type USING ERRCODE = '22023';

    END CASE;
  END IF;

  RETURN public.append_compliance_footer(v_html, p_company_id, p_app_url);
END;
$$;

COMMENT ON FUNCTION public.email_render_template(uuid, text, jsonb, text, text, text, text, text, jsonb) IS
  'Internal renderer for transactional emails. Mirrors _shared/email-templates.ts::renderTemplate. '
  'NEW in PR1: accepts p_custom_blocks jsonb. Top-level dispatch: if p_custom_blocks is non-NULL, '
  'blocks path wins and per-type CASE is skipped. Per-type CASE branches remain verbatim (including '
  'the IF p_custom_body checks for the 20 types that honor it). The 6 simple types continue to drop '
  'p_custom_body (accepted risk, fixed in PR1-6type-fix). Always appends the RGPD compliance footer.';

-- ────────────────────────────────────────────────────────────────────────────
-- 9. preview_email_template REPLACE
--    Only change: add `p_custom_blocks jsonb DEFAULT NULL` at the end and
--    forward it to email_render_template. Body unchanged.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.preview_email_template(
  p_company_id        uuid,
  p_email_type        text,
  p_sample_data       jsonb,
  p_custom_subject    text DEFAULT NULL,
  p_custom_body       text DEFAULT NULL,
  p_custom_header     text DEFAULT NULL,
  p_custom_button_text text DEFAULT NULL,
  p_app_url           text DEFAULT 'https://app.simplificacrm.es',
  p_custom_blocks     jsonb DEFAULT NULL
)
RETURNS TABLE(html text, sample_data jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_html text;
BEGIN
  -- Membership guard. The auth.uid() of the caller must be a member of
  -- company_id OR a super_admin. Non-members see 42501 insufficient_privilege
  -- with no further work done (no branding lookup, no template rendering).
  IF NOT (public.is_company_member(p_company_id) OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'insufficient_privilege: user is not a member of company %', p_company_id
      USING ERRCODE = '42501';
  END IF;

  v_html := public.email_render_template(
    p_company_id,
    p_email_type,
    p_sample_data,
    p_custom_subject,
    p_custom_body,
    p_custom_header,
    p_custom_button_text,
    p_app_url,
    p_custom_blocks
  );

  RETURN QUERY SELECT v_html, p_sample_data;
END;
$$;

COMMENT ON FUNCTION public.preview_email_template(uuid, text, jsonb, text, text, text, text, text, jsonb) IS
  'Live preview RPC for the split-view template editor. Returns {html, sample_data}. '
  'NEW in PR1: accepts p_custom_blocks jsonb DEFAULT NULL (last param, positional-compat). '
  'SECURITY DEFINER with search_path pinned to empty. Membership guard: is_company_member '
  'OR is_super_admin. Non-members see SQLSTATE 42501 insufficient_privilege. '
  'Backed by email_render_template(...) which mirrors the TS renderer in '
  '_shared/email-templates.ts (drift closed by snapshot_email_render.sql). '
  'p_app_url defaults to the production host; callers should pass the value '
  'of APP_URL from their env so SQL/TS renderers match per-environment.';

-- ────────────────────────────────────────────────────────────────────────────
-- 10. REVOKE/GRANT for the new function signatures
-- ────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.preview_email_template(uuid, text, jsonb, text, text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_render_template(uuid, text, jsonb, text, text, text, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.preview_email_template(uuid, text, jsonb, text, text, text, text, text, jsonb) TO authenticated;

-- Internal helpers (service_role only).
GRANT EXECUTE ON FUNCTION public.email_render_template(uuid, text, jsonb, text, text, text, text, text, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';