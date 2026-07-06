-- Migration: preview_email_template RPC
--
-- Server-authoritative live preview for the split-view template editor
-- (added in PR2 of the email-customization-faithful-preview change).
-- Angular calls `preview_email_template(company_id, email_type,
-- sample_data, custom_subject, custom_body, custom_header,
-- custom_button_text)`; the function invokes the same per-type HTML
-- renderer logic that the `send-branded-email` Edge Function uses
-- (byte-equivalent output enforced by `supabase/tests/snapshot_email_render.sql`
-- against `email_sample_fixtures`).
--
-- Layout:
--   1. escape_html(value text)                                 — OWASP HTML encoding
--   2. append_compliance_footer(html, company_id, app_url?)    — RGPD / unsubscribe footer
--   3. interpolate_safe(template, data)                        — {{var}} → escaped value
--   4. email_render_template(company_id, email_type, sample_data, ..., app_url?)
--   5. preview_email_template(company_id, email_type, sample_data, ..., app_url?) — RPC
--   6. GRANTs + REVOKEs + search_path pinning
--
-- Security model (mirrors `get_email_template_preview` and the rest of the
-- recent SECDEF hardening migrations):
--   - SECURITY DEFINER so the function bypasses RLS on `company_email_settings`
--     (the user calling the RPC may not have a direct SELECT policy).
--   - `SET search_path = ''` to satisfy Supabase's "function search path
--     mutable" advisory (no role takeover via malicious search_path).
--   - `is_company_member(company_id)` OR `is_super_admin()` guard runs
--     BEFORE any branding lookup — non-members see a 42501 insufficient_privilege.
--   - `GRANT EXECUTE TO authenticated` for the Angular SPA. Helper
--     functions (escape_html, interpolate_safe, append_compliance_footer,
--     email_render_template) are GRANTed only to service_role — they are
--     internal to preview_email_template, never called directly by clients.
--   - STABLE: no side effects, same inputs → same outputs within a snapshot.
--
-- URL divergence (preview_email_template vs append_compliance_footer):
--   The TS renderer reads APP_URL from `Deno.env.get('APP_URL')`; the SQL
--   renderer cannot see Edge Function env. To keep drift closed across
--   environments (local / staging / production) the SQL renderer accepts
--   an optional p_app_url parameter (defaulted to the production host).
--   Caller passes whichever URL matches the TS renderer's env.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. escape_html — matches _shared/escape.ts::escapeHtml (OWASP HTML encoding)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.escape_html(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT replace(replace(replace(replace(replace(value, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#x27;')
$$;

COMMENT ON FUNCTION public.escape_html(text) IS
  'OWASP HTML-context encoding: & < > " ''. Mirrors _shared/escape.ts::escapeHtml. '
  'Used by email_render_template to safely substitute {{var}} values into admin-authored HTML.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. append_compliance_footer — RGPD + unsubscribe block (no opt-out flag)
-- ─────────────────────────────────────────────────────────────────────────────

-- Reads `companies` to render the footer line, so it MUST be STABLE (not
-- IMMUTABLE). Same-input, same-output within a single snapshot is enough
-- for the planner; the function is invoked from email_render_template
-- which is itself STABLE.

CREATE OR REPLACE FUNCTION public.append_compliance_footer(
  p_html     text,
  p_company_id uuid,
  p_app_url  text DEFAULT 'https://app.simplificacrm.es'
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_company_name text;
  v_company_nif  text;
  v_company_addr text;
  v_base_footer  text;
  v_block        text;
BEGIN
  SELECT name, COALESCE(nif, ''),
         COALESCE(settings->'address'->>'value', settings->>'address', '')
    INTO v_company_name, v_company_nif, v_company_addr
    FROM public.companies WHERE id = p_company_id;

  v_base_footer := v_company_name
    || CASE WHEN v_company_nif <> '' THEN ' · NIF: ' || v_company_nif ELSE '' END
    || CASE WHEN v_company_addr <> '' THEN ' · ' || v_company_addr ELSE '' END;

  -- NOTE on URL divergence: the TS renderer reads APP_URL from
  -- `Deno.env.get('APP_URL')` for parity, but the SQL renderer cannot
  -- read Edge Function env vars — it accepts the caller-supplied
  -- p_app_url (defaulted to the production host). `preview_email_template`
  -- gains the same optional parameter so SQL/TS stay aligned across
  -- environments. The hard-coded constant below is only used when an
  -- internal caller (e.g. email_render_template) omits p_app_url.
  v_block := E'\n    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">\n'
    || '    <p style="font-size:12px;color:#6b7280;margin:0 0 6px;text-align:center;">'
    || v_base_footer || '</p>\n'
    || '    <p style="font-size:11px;color:#9ca3af;margin:6px 0 0;text-align:center;line-height:1.5;">\n'
    || '      En cumplimiento del RGPD, sus datos serán tratados conforme a nuestra\n'
    || '      <a href="' || p_app_url || '/privacidad" style="color:#6b7280;">política de privacidad</a>.\n'
    || '    </p>\n'
    || '    <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;text-align:center;">\n'
    || '      ¿No deseas recibir más comunicaciones?\n'
    || '      <a href="' || p_app_url || '/unsubscribe?company=' || p_company_id::text
    || '" style="color:#6b7280;text-decoration:underline;">Darse de baja</a>\n'
    || '    </p>\n  ';

  IF p_html LIKE '%</body>%' THEN
    RETURN replace(p_html, '</body>', v_block || '</body>');
  END IF;
  RETURN p_html || v_block;
END;
$$;

COMMENT ON FUNCTION public.append_compliance_footer(text, uuid, text) IS
  'Appends the CAN-SPAM / GDPR compliance footer (legal text, address, '
  'privacy policy link, unsubscribe link) to any HTML body. Used by '
  'email_render_template — no opt-out flag, footer is always appended. '
  'STABLE because it reads `companies`; p_app_url defaults to the '
  'production host for backward compatibility with internal callers.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. interpolate_safe — {{var}} → escape_html(value), missing → ''
--    Mirrors _shared/escape.ts::interpolateSafe.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.interpolate_safe(
  p_template text,
  p_data     jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_key   text;
  v_val   text;
  v_keys  text[];
  v_result text := p_template;
BEGIN
  -- Dedupe tokens once. Templates with the same {{var}} repeated several
  -- times only need one lookup; we then do a single global replace per
  -- distinct key. Avoids the previous O(distinct*occurrences) replace()
  -- fan-out on templates with repetition.
  SELECT COALESCE(array_agg(DISTINCT (regexp_matches(p_template, '\{\{(\w+)\}\}', 'g'))[1]), '{}')
    INTO v_keys;

  FOREACH v_key IN ARRAY v_keys LOOP
    IF p_data ? v_key THEN
      v_val := public.escape_html(
        CASE WHEN jsonb_typeof(p_data -> v_key) IN ('string', 'number', 'boolean')
             THEN (p_data ->> v_key)
             ELSE ''
        END
      );
    ELSE
      v_val := '';
    END IF;
    v_result := replace(v_result, '{{' || v_key || '}}', v_val);
  END LOOP;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.interpolate_safe(text, jsonb) IS
  'Replaces every {{var}} token in p_template with the HTML-escaped '
  'value of p_data.var. Missing/null/non-scalar values become empty. '
  'Distinct tokens are looked up once (single replace per token), so '
  'repetition in the template does not multiply the work. '
  'Mirrors _shared/escape.ts::interpolateSafe.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. email_render_template — per-type CASE branches producing html
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.email_render_template(
  p_company_id       uuid,
  p_email_type       text,
  p_sample_data      jsonb,
  p_custom_subject   text DEFAULT NULL,
  p_custom_body      text DEFAULT NULL,
  p_custom_header    text DEFAULT NULL,
  p_custom_button_text text DEFAULT NULL,
  p_app_url          text DEFAULT 'https://app.simplificacrm.es'
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

  -- Per-type default branch. The 26 CASE arms mirror the TS registry in
  -- _shared/email-templates.ts. Adding a new email type means: add an arm
  -- here, add a row in email_sample_fixtures, update the TS registry.
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
          || '<tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Servicio</td><td style="padding:8px 0;border-bottom:1px solid #eee;">' || COALESCE(escape_html(p_sample_data->>'servicio'), '') || '</td></tr>'
          || '<tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #eee;">' || COALESCE(escape_html(p_sample_data->>'fecha'), '') || '</td></tr>'
          || '<tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Hora</td><td style="padding:8px 0;border-bottom:1px solid #eee;">' || COALESCE(escape_html(p_sample_data->>'hora'), '') || '</td></tr>'
          || '<tr><td style="padding:8px 0;font-weight:bold;">Empresa</td><td style="padding:8px 0;">' || COALESCE(NULLIF(escape_html(p_sample_data->>'empresa'), ''), v_company_name) || '</td></tr>'
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
          || '<h1 style="color:' || v_primary_color || ';text-align:center;">Factura ' || COALESCE(escape_html(p_sample_data->>'numero_factura'), '') || '</h1>'
          || '<div style="text-align:center;">'
          || CASE WHEN p_sample_data ? 'invoice_url' THEN '<a href="' || escape_html(p_sample_data->>'invoice_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">' || COALESCE(NULLIF(p_custom_button_text, ''), 'Ver factura PDF') || '</a>' ELSE '' END
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
          || '<h1 style="color:' || v_primary_color || ';text-align:center;">Presupuesto ' || COALESCE(escape_html(p_sample_data->>'numero_presupuesto'), '') || '</h1>'
          || '<div style="text-align:center;">'
          || CASE WHEN p_sample_data ? 'quote_url' THEN '<a href="' || escape_html(p_sample_data->>'quote_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">' || COALESCE(NULLIF(p_custom_button_text, ''), 'Ver presupuesto') || '</a>' ELSE '' END
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
          || CASE WHEN p_sample_data ? 'consent_url' THEN '<a href="' || escape_html(p_sample_data->>'consent_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">' || COALESCE(NULLIF(p_custom_button_text, ''), 'Revisar y validar datos') || '</a>' ELSE '' END
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
          || CASE WHEN p_sample_data ? 'invite_url' THEN '<a href="' || escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a>' ELSE '' END
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
          || CASE WHEN p_sample_data ? 'invite_url' THEN '<a href="' || escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">' || v_btn_text || '</a>' ELSE '' END
          || '</div>'
          || '</body></html>';
      END IF;

    WHEN 'invite_admin' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div><h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">Tu rol: <strong>Administrador</strong></p>'
        || '<div style="text-align:center;"><a href="' || escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a></div></body></html>';

    WHEN 'invite_member' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div><h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">Tu rol: <strong>Miembro</strong></p>'
        || '<div style="text-align:center;"><a href="' || escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a></div></body></html>';

    WHEN 'invite_professional' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div><h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">Tu rol: <strong>Profesional</strong></p>'
        || '<div style="text-align:center;"><a href="' || escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a></div></body></html>';

    WHEN 'invite_agent' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div><h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">Tu rol: <strong>Agente</strong></p>'
        || '<div style="text-align:center;"><a href="' || escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a></div></body></html>';

    WHEN 'invite_marketer' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div><h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">Tu rol: <strong>Marketing</strong></p>'
        || '<div style="text-align:center;"><a href="' || escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a></div></body></html>';

    WHEN 'invite_client' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><div style="text-align:center;padding:20px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div><h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Te han invitado a ' || v_company_name || '</h1>'
        || '<p style="text-align:center;color:#6b7280;font-size:13px;">Después de aceptar, podrás acceder al portal de clientes de ' || v_company_name || ' para gestionar tus reservas y documentos.</p>'
        || '<div style="text-align:center;"><a href="' || escape_html(p_sample_data->>'invite_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Aceptar invitación</a></div></body></html>';

    WHEN 'waitlist' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
        || '<div style="background:linear-gradient(135deg,' || v_primary_color || ',#1e40af);padding:30px 20px;text-align:center;"><span style="color:#fff;font-size:18px;font-weight:bold;">Simplifica CRM</span></div>'
        || '<h1 style="color:' || v_primary_color || ';text-align:center;">' || COALESCE(NULLIF(escape_html(p_sample_data->>'heading'), ''), '¡Estás en la lista!') || '</h1>'
        || '<p style="text-align:center;font-size:16px;color:#555;">' || COALESCE(NULLIF(escape_html(p_sample_data->>'body_text'), ''), 'Te avisaremos cuando puedas reservar.') || '</p>'
        || '<div style="text-align:center;">'
        || CASE WHEN p_sample_data ? 'waitlist_url' THEN '<a href="' || escape_html(p_sample_data->>'waitlist_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">Reservar ahora</a>' ELSE '' END
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
        || '<p style="font-size:16px;">' || COALESCE(escape_html(p_sample_data->>'message'), '') || '</p>'
        || '</body></html>';

    WHEN 'google_review' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
        || '<div style="text-align:center;padding:24px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div>'
        || '<h1 style="color:' || v_primary_color || ';text-align:center;font-size:24px;">¡Gracias por tu visita, ' || COALESCE(escape_html(p_sample_data->>'client_name'), '') || '!</h1>'
        || '<p style="text-align:center;font-size:16px;color:#555;margin:16px 0;">Tu opinión nos ayuda a seguir mejorando y a dar a conocer nuestro trabajo.</p>'
        || '<div style="text-align:center;margin:28px 0;"><a href="' || COALESCE(NULLIF(escape_html(p_sample_data->>'review_url'), ''), 'https://g.page/review') || '" style="display:inline-block;background:#4285f4;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">★★★★★ Dejar Google Review</a></div>'
        || '</body></html>';

    WHEN 'booking_reminder' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(escape_html(p_sample_data->>'message'), '') || '</p></body></html>';

    WHEN 'booking_cancellation' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(escape_html(p_sample_data->>'message'), '') || '</p></body></html>';

    WHEN 'password_reset' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(escape_html(p_sample_data->>'message'), '') || '</p></body></html>';

    WHEN 'magic_link' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(escape_html(p_sample_data->>'message'), '') || '</p></body></html>';

    WHEN 'welcome' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(escape_html(p_sample_data->>'message'), '') || '</p></body></html>';

    WHEN 'staff_credentials' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(escape_html(p_sample_data->>'message'), '') || '</p></body></html>';

    WHEN 'budget_created' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:0;color:#333;background-color:' || v_background_color || ';"><div style="background:' || v_primary_color || ';height:6px;"></div><div style="padding:24px 20px;">'
        || '<div style="text-align:center;padding:16px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div>'
        || '<h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Nuevo presupuesto disponible</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">' || COALESCE(NULLIF(escape_html(p_sample_data->>'intro'), ''), 'Ya está disponible tu presupuesto.') || '</p>'
        || CASE WHEN p_sample_data ? 'period_label' THEN '<p style="text-align:center;color:#6b7280;font-size:14px;">Periodo: <strong>' || escape_html(p_sample_data->>'period_label') || '</strong></p>' ELSE '' END
        || CASE WHEN p_sample_data ? 'total_formatted' THEN '<p style="text-align:center;color:#111;font-size:28px;font-weight:bold;margin:12px 0;">' || escape_html(p_sample_data->>'total_formatted') || '</p>' ELSE '' END
        || '<div style="text-align:center;">'
        || CASE WHEN p_sample_data ? 'payment_url' THEN '<a href="' || escape_html(p_sample_data->>'payment_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin:24px 0;">' || COALESCE(NULLIF(p_custom_button_text, ''), NULLIF(escape_html(p_sample_data->>'cta_text'), ''), 'Ver presupuesto') || '</a>' ELSE '' END
        || '</div></div></body></html>';

    WHEN 'budget_reminder' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:0;color:#333;background-color:' || v_background_color || ';"><div style="background:#f59e0b;height:6px;"></div><div style="padding:24px 20px;">'
        || '<div style="text-align:center;padding:16px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div>'
        || '<h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Tu presupuesto vence pronto</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">' || COALESCE(NULLIF(escape_html(p_sample_data->>'intro'), ''), 'Tu presupuesto vence pronto.') || '</p>'
        || CASE WHEN p_sample_data ? 'period_label' THEN '<p style="text-align:center;color:#6b7280;font-size:14px;">Periodo: <strong>' || escape_html(p_sample_data->>'period_label') || '</strong></p>' ELSE '' END
        || CASE WHEN p_sample_data ? 'due_date_formatted' THEN '<p style="text-align:center;color:#6b7280;font-size:14px;">Fecha de vencimiento: <strong>' || escape_html(p_sample_data->>'due_date_formatted') || '</strong></p>' ELSE '' END
        || CASE WHEN p_sample_data ? 'total_formatted' THEN '<p style="text-align:center;color:#111;font-size:28px;font-weight:bold;margin:12px 0;">' || escape_html(p_sample_data->>'total_formatted') || '</p>' ELSE '' END
        || '<div style="text-align:center;">'
        || CASE WHEN p_sample_data ? 'payment_url' THEN '<a href="' || escape_html(p_sample_data->>'payment_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin:24px 0;">' || COALESCE(NULLIF(p_custom_button_text, ''), NULLIF(escape_html(p_sample_data->>'cta_text'), ''), 'Ver presupuesto') || '</a>' ELSE '' END
        || '</div></div></body></html>';

    WHEN 'budget_overdue' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:0;color:#333;background-color:' || v_background_color || ';"><div style="background:#dc2626;height:6px;"></div><div style="padding:24px 20px;">'
        || '<div style="text-align:center;padding:16px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div>'
        || '<h1 style="color:#dc2626;text-align:center;font-size:22px;">Presupuesto vencido</h1>'
        || '<p style="text-align:center;font-size:16px;color:#374151;">' || COALESCE(NULLIF(escape_html(p_sample_data->>'intro'), ''), 'Tu presupuesto ha vencido y aún no hemos recibido el pago.') || '</p>'
        || CASE WHEN p_sample_data ? 'period_label' THEN '<p style="text-align:center;color:#6b7280;font-size:14px;">Periodo: <strong>' || escape_html(p_sample_data->>'period_label') || '</strong></p>' ELSE '' END
        || CASE WHEN p_sample_data ? 'due_date_formatted' THEN '<p style="text-align:center;color:#6b7280;font-size:14px;">Fecha de vencimiento: <strong>' || escape_html(p_sample_data->>'due_date_formatted') || '</strong></p>' ELSE '' END
        || CASE WHEN p_sample_data ? 'total_formatted' THEN '<p style="text-align:center;color:#111;font-size:28px;font-weight:bold;margin:12px 0;">' || escape_html(p_sample_data->>'total_formatted') || '</p>' ELSE '' END
        || '<div style="text-align:center;">'
        || CASE WHEN p_sample_data ? 'payment_url' THEN '<a href="' || escape_html(p_sample_data->>'payment_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin:24px 0;">' || COALESCE(NULLIF(p_custom_button_text, ''), NULLIF(escape_html(p_sample_data->>'cta_text'), ''), 'Ver presupuesto') || '</a>' ELSE '' END
        || '</div></div></body></html>';

    WHEN 'booking_change' THEN
      v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:' || v_font_family || ',sans-serif;max-width:600px;margin:0 auto;padding:0;color:#333;background-color:' || v_background_color || ';"><div style="background:' || v_primary_color || ';height:6px;"></div><div style="padding:24px 20px;">'
        || '<div style="text-align:center;padding:16px 0;">'
        || CASE WHEN v_logo_url <> '' THEN '<img src="' || v_logo_url || '" alt="' || v_company_name || '" style="max-height:60px;max-width:200px;">' ELSE '' END
        || '</div>'
        || '<h1 style="color:' || v_primary_color || ';text-align:center;font-size:22px;">Tu reserva se ha modificado</h1>'
        || CASE WHEN p_sample_data ? 'service_name' THEN '<p style="text-align:center;color:#111;font-size:18px;font-weight:600;">' || escape_html(p_sample_data->>'service_name') || '</p>' ELSE '' END
        || CASE WHEN p_sample_data ? 'starts_at' THEN '<p style="text-align:center;color:#374151;font-size:15px;"><strong>Fecha y hora:</strong> ' || escape_html(p_sample_data->>'starts_at') || '</p>' ELSE '' END
        || '<div style="text-align:center;">'
        || CASE WHEN p_sample_data ? 'booking_url' THEN '<a href="' || escape_html(p_sample_data->>'booking_url') || '" style="display:inline-block;background:' || v_primary_color || ';color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin:24px 0;">Ver detalles</a>' ELSE '' END
        || '</div></div></body></html>';

    ELSE
      RAISE EXCEPTION 'Unsupported email_type: %', p_email_type USING ERRCODE = '22023';

  END CASE;

  -- Append compliance footer (always — no opt-out flag).
  RETURN public.append_compliance_footer(v_html, p_company_id, p_app_url);
END;
$$;

COMMENT ON FUNCTION public.email_render_template(uuid, text, jsonb, text, text, text, text, text) IS
  'Internal renderer for transactional emails. Mirrors _shared/email-templates.ts::renderTemplate. '
  'Returns the full HTML body (subject is rendered separately by the RPC if needed). '
  'Always appends the RGPD compliance footer via append_compliance_footer.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. preview_email_template — public RPC with membership guard
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.preview_email_template(
  p_company_id        uuid,
  p_email_type        text,
  p_sample_data       jsonb,
  p_custom_subject    text DEFAULT NULL,
  p_custom_body       text DEFAULT NULL,
  p_custom_header     text DEFAULT NULL,
  p_custom_button_text text DEFAULT NULL,
  p_app_url           text DEFAULT 'https://app.simplificacrm.es'
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
    p_app_url
  );

  RETURN QUERY SELECT v_html, p_sample_data;
END;
$$;

COMMENT ON FUNCTION public.preview_email_template(uuid, text, jsonb, text, text, text, text, text) IS
  'Live preview RPC for the split-view template editor. Returns {html, sample_data}. '
  'SECURITY DEFINER with search_path pinned to empty. Membership guard: is_company_member '
  'OR is_super_admin. Non-members see SQLSTATE 42501 insufficient_privilege. '
  'Backed by email_render_template(...) which mirrors the TS renderer in '
  '_shared/email-templates.ts (drift closed by snapshot_email_render.sql). '
  'p_app_url defaults to the production host; callers should pass the value '
  'of APP_URL from their env so SQL/TS renderers match per-environment.';

-- Explicit access model: revoke the implicit PUBLIC grant, then grant only
-- to the roles that need each function. `escape_html` is also gated because
-- it is unsafe to expose — it is only meant to be called via the renderer.
REVOKE ALL ON FUNCTION public.preview_email_template(uuid, text, jsonb, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_render_template(uuid, text, jsonb, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.escape_html(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.interpolate_safe(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_compliance_footer(text, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.preview_email_template(uuid, text, jsonb, text, text, text, text, text) TO authenticated;

-- Internal helpers do not need to be callable directly — only the public
-- RPC. We still GRANT EXECUTE TO service_role so psql-based tests can run
-- them directly (snapshot harness). `escape_html` is also service_role-only
-- — callers go through `email_render_template`.
GRANT EXECUTE ON FUNCTION public.email_render_template(uuid, text, jsonb, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.escape_html(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.interpolate_safe(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.append_compliance_footer(text, uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';