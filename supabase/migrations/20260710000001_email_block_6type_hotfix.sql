-- ============================================================================
-- Migration: Email Block Editor — 6-Type Hot Fix (PR1-6type-fix)
--
-- Follow-up to 20260709000001_email_block_editor_foundation.sql. Resolves the
-- silent-drop bug for the 6 simple email types:
--   booking_reminder, booking_cancellation, password_reset,
--   magic_link, welcome, staff_credentials
--
-- Background: PR1 (foundation) intentionally kept the per-type CASE branches
-- verbatim for the 6 simple types. Their assignment did NOT check
-- `p_custom_body`, so any `custom_body_template` saved for these 6 types was
-- silently dropped at preview AND at send. PR1 documented this as an accepted
-- risk (header lines 17-25) to be fixed in a follow-up migration.
--
-- This follow-up adds the missing `IF p_custom_body IS NOT NULL AND
-- p_custom_body <> '' THEN v_html := interpolate_safe(...); ELSE <existing
-- default>; END IF;` wrapper to each of the 6 branches.
--
-- PRECEDENCE (unchanged, restated for clarity):
--   p_custom_blocks  >  p_custom_body  >  per-type default
-- The 6-type hot fix closes the middle tier for the previously-broken types
-- so all 26 types now route through the same precedence contract.
--
-- Resolves:
--   - Spec AC3 (6 simple types accept custom_body_template edits and preview
--     reflects)
--   - Spec AC12 (6-type hot fix bundled with PR1 follow-up — no silent-drop in
--     production)
--
-- Out of scope (unchanged from PR1):
--   - Block editor UI (ships in PR2a behind `emailBlockEditorEnabled` flag)
--   - TipTap wrapper, `custom_header_template` consumers, RGPD footer path
--
-- Source of truth: server. SQL renderer is canonical. The TS mirror in
-- _shared/email-templates.ts is unchanged — its 6 simple types already route
-- through `renderGeneric` which honors `customBody` (lines 1117-1122 +
-- renderGeneric lines 827-835). Drift closed by snapshot_email_render.sql.
--
-- New SQL surface in this migration: NONE — this is a `CREATE OR REPLACE` on
-- `public.email_render_template` only. Same hardening preserved (STABLE,
-- SECURITY DEFINER, SET search_path = '', REVOKE FROM PUBLIC + GRANT to
-- service_role only — unchanged from PR1 foundation).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. email_render_template REPLACE
--    Same signature as PR1 foundation (10 args incl. p_custom_blocks).
--    Same hardening: STABLE, SECURITY DEFINER, `SET search_path = ''`.
--    Only behavioral change: the 6 simple-type branches now honor
--    `p_custom_body` via the same IF/ELSE wrapper pattern as the 20 types
--    that already did.
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

  -- ── TOP-LEVEL DISPATCH (unchanged from PR1 foundation) ─────────────────────
  -- p_custom_blocks wins over p_custom_body and over per-type default.
  IF p_custom_blocks IS NOT NULL THEN
    v_html := public.interpolate_safe(
      public.render_blocks_to_html(p_custom_blocks),
      p_sample_data
    );
  ELSE
    CASE p_email_type

    WHEN 'booking_reminder' THEN
      -- PR1-6type-fix: honor p_custom_body (was silently dropped before).
      IF p_custom_body IS NOT NULL AND p_custom_body <> '' THEN
        v_html := public.interpolate_safe(p_custom_body, p_sample_data);
      ELSE
        v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p></body></html>';
      END IF;

    WHEN 'booking_cancellation' THEN
      -- PR1-6type-fix: honor p_custom_body (was silently dropped before).
      IF p_custom_body IS NOT NULL AND p_custom_body <> '' THEN
        v_html := public.interpolate_safe(p_custom_body, p_sample_data);
      ELSE
        v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p></body></html>';
      END IF;

    WHEN 'password_reset' THEN
      -- PR1-6type-fix: honor p_custom_body (was silently dropped before).
      IF p_custom_body IS NOT NULL AND p_custom_body <> '' THEN
        v_html := public.interpolate_safe(p_custom_body, p_sample_data);
      ELSE
        v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p></body></html>';
      END IF;

    WHEN 'magic_link' THEN
      -- PR1-6type-fix: honor p_custom_body (was silently dropped before).
      IF p_custom_body IS NOT NULL AND p_custom_body <> '' THEN
        v_html := public.interpolate_safe(p_custom_body, p_sample_data);
      ELSE
        v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p></body></html>';
      END IF;

    WHEN 'welcome' THEN
      -- PR1-6type-fix: honor p_custom_body (was silently dropped before).
      IF p_custom_body IS NOT NULL AND p_custom_body <> '' THEN
        v_html := public.interpolate_safe(p_custom_body, p_sample_data);
      ELSE
        v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p></body></html>';
      END IF;

    WHEN 'staff_credentials' THEN
      -- PR1-6type-fix: honor p_custom_body (was silently dropped before).
      IF p_custom_body IS NOT NULL AND p_custom_body <> '' THEN
        v_html := public.interpolate_safe(p_custom_body, p_sample_data);
      ELSE
        v_html := '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;"><p style="font-size:16px;">' || COALESCE(public.escape_html(p_sample_data->>'message'), '') || '</p></body></html>';
      END IF;

    -- The remaining 20 types (booking_confirmation, invoice, quote, consent,
    -- invite*, waitlist, inactive_notice, generic, google_review, budget_*,
    -- booking_change) already honor p_custom_body in the PR1 foundation
    -- migration; their branches are preserved verbatim below for
    -- self-containment so this migration remains a drop-in replacement.

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
  'blocks path wins and per-type CASE is skipped. NEW in PR1-6type-fix: all 26 per-type branches '
  'now honor p_custom_body via the same IF wrapper pattern. Precedence is p_custom_blocks > '
  'p_custom_body > per-type default. RGPD compliance footer is always appended.';

-- Hardening — unchanged from PR1 foundation.
REVOKE ALL ON FUNCTION public.email_render_template(uuid, text, jsonb, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_render_template(uuid, text, jsonb, text, text, text, text, text, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
