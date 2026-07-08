/**
 * Shared transactional email renderer for Simplifica.
 *
 * Extracted from `supabase/functions/send-branded-email/index.ts` (where
 * `renderTemplate` lived as a module-private function spanning lines
 * 289–830) so that:
 *   - The Edge Function at send time uses this single source of truth.
 *   - The SQL helper `email_render_template(...)` (preview-time) can be
 *     snapshot-tested against the SAME `expected_substrings` matrix
 *     committed in `supabase/email-samples.json`.
 *   - Both call sites render byte-equivalent HTML (modulo `{{var}}`
 *     substitution). Drift is closed by the snapshot harness
 *     `supabase/tests/snapshot_email_render.sql`.
 *
 * Re-exports `escapeHtml` / `interpolateSafe` from `_shared/escape.ts`
 * so any caller that needs the OWASP encoding table imports from a
 * single place. Do NOT duplicate the encoding table — it has been
 * battle-tested by the v0.26 XSS fix in `send-branded-email`.
 */

// ── Re-exports (escape helpers) ───────────────────────────────────────────────

export { escapeHtml, interpolateSafe } from './escape.ts';
import { escapeHtml, interpolateSafe as _interpolateSafe } from './escape.ts';

// `escapeHtml` is the local binding used by the per-type default-branch
// interpolations below; `interpolateSafe` (aliased to `_interpolateSafe`)
// handles the `{{var}}` substitution path for custom bodies and headers.

// ── Public types ─────────────────────────────────────────────────────────────

/**
 * Canonical list of transactional email types rendered by this module.
 * MUST stay in lockstep with the SQL `email_render_template(...)` CASE
 * branches and the DB CHECK constraint on `company_email_settings.email_type`.
 * 25 entries from EF `EMAIL_TYPES` + `invite_marketer` (handled in the
 * switch but missing from the EF's input-validation array — latent bug).
 */
export const EMAIL_TYPES = [
  'booking_confirmation',
  'invoice',
  'quote',
  'consent',
  'invite',
  'invite_owner',
  'invite_admin',
  'invite_member',
  'invite_professional',
  'invite_agent',
  'invite_marketer',
  'invite_client',
  'waitlist',
  'inactive_notice',
  'generic',
  'google_review',
  'booking_reminder',
  'booking_cancellation',
  'password_reset',
  'magic_link',
  'welcome',
  'staff_credentials',
  'budget_created',
  'budget_reminder',
  'budget_overdue',
  'booking_change',
] as const;

export type EmailType = typeof EMAIL_TYPES[number];

/** Branding + identity fields needed by every renderer. */
export interface CompanyInfo {
  id: string;
  name: string;
  logo_url: string | null;
  nif: string | null;
  settings: {
    branding?: { primary_color?: string; secondary_color?: string };
    email_branding?: {
      background_color?: string;
      font_family?: string;
      footer_text?: string | null;
    };
    address?: string;
  } | null;
}

/** Variables interpolated via {{var}} syntax into customBody / customHeader. */
export interface TemplateData {
  servicio?: string;
  fecha?: string;
  hora?: string;
  empresa?: string;
  numero_factura?: string;
  invoice_url?: string;
  numero_presupuesto?: string;
  quote_url?: string;
  company_name?: string;
  client_name?: string;
  period?: string;
  period_label?: string;
  total?: number | string;
  currency?: string;
  total_formatted?: string;
  due_date?: string;
  due_date_formatted?: string;
  days_to_due?: number | null;
  budget_id?: string;
  payment_url?: string;
  cta_text?: string;
  intro?: string;
  footer_text?: string;
  kind?: 'created' | 'reminder' | 'overdue';
  day_offset?: number | null;
  locale?: 'es' | 'ca' | 'en';
  consent_url?: string;
  invite_url?: string;
  role?: string;
  role_label?: string;
  inviter_name?: string;
  invited_name?: string;
  company_cif?: string;
  heading?: string;
  body_text?: string;
  waitlist_url?: string;
  client_names?: string[];
  reset_url?: string;
  user_name?: string;
  temp_password?: string;
  message?: string;
  // booking_change
  change_type?: string;
  audience?: string;
  audience_name?: string;
  service_name?: string;
  starts_at?: string;
  ends_at?: string;
  previous_starts_at?: string;
  reason?: string;
  booking_url?: string;
  professional_name?: string;
  // google_review
  review_url?: string;
}

/** Everything a per-type renderer needs to produce subject + html. */
export interface RenderArgs {
  company: CompanyInfo;
  data: TemplateData;
  customSubject?: string | null;
  customBody?: string | null;
  customHeader?: string | null;
  customButtonText?: string | null;
}

export interface RenderResult {
  subject: string;
  html: string;
}

type Renderer = (args: RenderArgs) => RenderResult;

// ── Block editor (PR1 of email-block-editor) ────────────────────────────────
//
// Mirrors the SQL helpers in supabase/migrations/20260709000001_email_block_editor_foundation.sql:
//   renderBlocksToHtml  ↔  public.render_blocks_to_html(jsonb)
//   renderBlockLogo     ↔  public.render_block_logo(jsonb)
//   renderBlockHeading  ↔  public.render_block_heading(jsonb)
//   renderBlockParagraph ↔ public.render_block_paragraph(jsonb)
//   renderBlockButton   ↔  public.render_block_button(jsonb)
//   defaultEmailBody    ↔  public.default_email_body(text)
//
// Drift closed by supabase/tests/snapshot_email_render.sql — any style-string
// change here MUST be mirrored in the SQL migration and vice-versa.

export type BlockType = 'logo' | 'heading' | 'paragraph' | 'button';

export interface LogoProps {
  src: string;
  alt?: string;
  max_height?: number;
  max_width?: number;
}

export interface HeadingProps {
  text: string;
  level?: 1 | 2 | 3;
  color?: string;
  align?: 'left' | 'center' | 'right';
  font_size?: number;
}

export interface ParagraphProps {
  text: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  font_size?: number;
  italic?: boolean;
}

export interface ButtonProps {
  text?: string;
  url: string;
  background_color?: string;
  text_color?: string;
  padding?: number;
  border_radius?: number;
  align?: 'left' | 'center' | 'right';
}

export interface BaseBlock<TType extends BlockType, TProps> {
  id: string;
  type: TType;
  version: 1;
  props: TProps;
}

export type LogoBlock = BaseBlock<'logo', LogoProps>;
export type HeadingBlock = BaseBlock<'heading', HeadingProps>;
export type ParagraphBlock = BaseBlock<'paragraph', ParagraphProps>;
export type ButtonBlock = BaseBlock<'button', ButtonProps>;
export type Block = LogoBlock | HeadingBlock | ParagraphBlock | ButtonBlock;

/** Strict post-interpolation URL regex (Fix 4 — same as SQL). */
const SAFE_URL_RE = /^(https?:\/\/|mailto:|#|\/)[^\s]*$/;
/** Pre-interpolation URL regex — allows {{var}} as a placeholder. */
const RAW_URL_RE = /^(https?:\/\/|mailto:|\{\{).*$/;

/** Defensive color sanitizer. Returns null if not a valid 6-digit hex. */
function sanitizeColor(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value;
  return fallback;
}

/** Defensive integer clamp. */
function clampInt(value: number | undefined, lo: number, hi: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(hi, Math.max(lo, Math.floor(value)));
}

/** MIRROR: public.render_block_logo(jsonb). */
export function renderBlockLogo(p: LogoProps): string {
  if (typeof p?.src !== 'string' || !/^https?:\/\//.test(p.src)) return '';
  const safeSrc = escapeHtml(p.src);
  const alt = escapeHtml(String(p.alt ?? '').slice(0, 200));
  const maxH = clampInt(p.max_height, 20, 200, 60);
  const maxW = clampInt(p.max_width, 50, 600, 200);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;"><tr><td style="text-align:center;">`
    + `<img src="${safeSrc}" alt="${alt}" style="display:block;max-height:${maxH}px;max-width:${maxW}px;height:auto;width:auto;border:0;">`
    + `</td></tr></table>`;
}

/** MIRROR: public.render_block_heading(jsonb). */
export function renderBlockHeading(p: HeadingProps): string {
  const text = String(p?.text ?? '').slice(0, 200);
  const level = p?.level === 2 ? 2 : p?.level === 3 ? 3 : 1;
  const color = sanitizeColor(p?.color, '#111827');
  const align = p?.align === 'left' ? 'left' : p?.align === 'right' ? 'right' : 'center';
  const fontSize = clampInt(p?.font_size, 12, 72, 24);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0;"><tr><td style="text-align:${align};">`
    + `<h${level} style="margin:0;color:${color};font-size:${fontSize}px;line-height:1.3;font-weight:700;">`
    + text
    + `</h${level}>`
    + `</td></tr></table>`;
}

/** MIRROR: public.render_block_paragraph(jsonb). */
export function renderBlockParagraph(p: ParagraphProps): string {
  const text = String(p?.text ?? '').slice(0, 5000);
  const align = p?.align === 'right' ? 'right' : p?.align === 'justify' ? 'justify' : 'left';
  const color = sanitizeColor(p?.color, '#374151');
  const fontSize = clampInt(p?.font_size, 12, 32, 16);
  const italic = p?.italic === true;
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:12px 0;"><tr><td style="text-align:${align};">`
    + `<p style="margin:0;color:${color};font-size:${fontSize}px;line-height:1.5;${italic ? 'font-style:italic;' : ''}">`
    + text
    + `</p>`
    + `</td></tr></table>`;
}

/**
 * MIRROR: public.render_block_button(jsonb). FIX 4: post-interpolation URL
 * re-validation. If `url` is `{{x}}` and `sampleData.x = 'javascript:alert(1)'`,
 * the substituted string must be re-validated against SAFE_URL_RE; a failure
 * degrades to a `<span>` styled like the button (not a clickable `<a>`).
 */
export function renderBlockButton(p: ButtonProps, sampleData?: Record<string, unknown>): string {
  const rawUrl = String(p?.url ?? '');
  const text = escapeHtml(String(p?.text ?? 'Click aquí').slice(0, 100));
  const bg = sanitizeColor(p?.background_color, '#4f46e5');
  const fg = sanitizeColor(p?.text_color, '#FFFFFF');
  const padding = clampInt(p?.padding, 4, 32, 12);
  const radius = clampInt(p?.border_radius, 0, 24, 6);
  const align = p?.align === 'left' ? 'left' : p?.align === 'right' ? 'right' : 'center';
  const btnStyle = `display:inline-block;background:${bg};color:${fg};padding:${padding}px 24px;text-decoration:none;border-radius:${radius}px;font-weight:bold;font-size:16px;`;

  let safeUrl = '';
  if (RAW_URL_RE.test(rawUrl)) {
    safeUrl = _interpolateSafe(rawUrl, sampleData ?? {});
  }

  let openTag: string;
  let closeTag: string;
  if (SAFE_URL_RE.test(safeUrl)) {
    openTag = `<a href="${escapeHtml(safeUrl)}" style="${btnStyle}">`;
    closeTag = `</a>`;
  } else {
    openTag = `<span style="${btnStyle}cursor:default;">`;
    closeTag = `</span>`;
  }

  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:${align};">`
    + openTag + text + closeTag
    + `</td></tr></table>`;
}

/** MIRROR: public.render_blocks_to_html(jsonb). */
export function renderBlocksToHtml(blocks: Block[] | null | undefined, sampleData?: Record<string, unknown>): string {
  if (!Array.isArray(blocks)) return '';
  let html = '';
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    switch (block.type) {
      case 'logo':
        html += renderBlockLogo((block as LogoBlock).props);
        break;
      case 'heading':
        html += renderBlockHeading((block as HeadingBlock).props);
        break;
      case 'paragraph':
        html += renderBlockParagraph((block as ParagraphBlock).props);
        break;
      case 'button':
        html += renderBlockButton((block as ButtonBlock).props, sampleData);
        break;
      default:
        // Unknown type → empty (graceful forward-compat, matches SQL).
        html += '';
    }
  }
  return html;
}

/**
 * MIRROR: public.default_email_body(text). Returns the per-type default HTML
 * (single-arg, no companyId — Fix 6). Used by the Angular auto-seed flow:
 * client parses this HTML into Block[]. Placeholder branding (#4f46e5 primary,
 * no logo); the client parser recognizes structure via regex and replaces
 * with real branding when re-rendering.
 */
export function defaultEmailBody(emailType: string): string {
  switch (emailType) {
    case 'booking_confirmation':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Reserva confirmada</h1></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Servicio</td><td style="padding:8px 0;border-bottom:1px solid #eee;">{{servicio}}</td></tr><tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #eee;">{{fecha}}</td></tr><tr><td style="padding:8px 0;font-weight:bold;">Hora</td><td style="padding:8px 0;">{{hora}}</td></tr></table>`;
    case 'invoice':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Factura {{numero_factura}}</h1></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invoice_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Ver factura PDF</a></td></tr></table>`;
    case 'quote':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Presupuesto {{numero_presupuesto}}</h1></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{quote_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Ver presupuesto</a></td></tr></table>`;
    case 'consent':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Solicitud de consentimiento RGPD</h1><p>Solicitamos su consentimiento para el tratamiento de sus datos personales.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{consent_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Revisar y validar datos</a></td></tr></table>`;
    case 'invite':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Has recibido una invitación para unirte.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>`;
    case 'invite_owner':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Invitación para crear tu empresa</h1><p>Has recibido una invitación para crear tu empresa.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar e introducir datos de empresa</a></td></tr></table>`;
    case 'invite_admin':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Tu rol: <strong>Administrador</strong></p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>`;
    case 'invite_member':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Tu rol: <strong>Miembro</strong></p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>`;
    case 'invite_professional':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Tu rol: <strong>Profesional</strong></p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>`;
    case 'invite_agent':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Tu rol: <strong>Agente</strong></p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>`;
    case 'invite_marketer':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Tu rol: <strong>Marketing</strong></p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>`;
    case 'invite_client':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Te han invitado</h1><p>Después de aceptar, podrás acceder al portal de clientes.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{invite_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Aceptar invitación</a></td></tr></table>`;
    case 'waitlist':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">¡Estás en la lista!</h1><p>Te avisaremos cuando puedas reservar.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{waitlist_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;">Reservar ahora</a></td></tr></table>`;
    case 'inactive_notice':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td><h1 style="color:#4f46e5;margin:0 0 16px 0;">Clientes inactivos</h1><p>Los siguientes clientes no han tenido actividad reciente:</p><ul style="list-style:none;padding:0;"></ul></td></tr></table>`;
    case 'generic':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td><p style="font-size:16px;color:#333;">{{message}}</p></td></tr></table>`;
    case 'google_review':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">¡Gracias por tu visita!</h1><p>Tu opinión nos ayuda a seguir mejorando.</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{review_url}}" style="display:inline-block;background:#4285f4;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">★★★★★ Dejar Google Review</a></td></tr></table>`;
    case 'booking_reminder':
    case 'booking_cancellation':
    case 'password_reset':
    case 'magic_link':
    case 'welcome':
    case 'staff_credentials':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td><p style="font-size:16px;color:#333;">{{message}}</p></td></tr></table>`;
    case 'budget_created':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Nuevo presupuesto disponible</h1><p>{{intro}}</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{payment_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Ver presupuesto</a></td></tr></table>`;
    case 'budget_reminder':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Tu presupuesto vence pronto</h1><p>{{intro}}</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{payment_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Ver presupuesto</a></td></tr></table>`;
    case 'budget_overdue':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#dc2626;margin:0 0 16px 0;">Presupuesto vencido</h1><p>{{intro}}</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{payment_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Ver presupuesto</a></td></tr></table>`;
    case 'booking_change':
      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;"><tr><td style="text-align:center;"><h1 style="color:#4f46e5;margin:0 0 16px 0;">Tu reserva se ha modificado</h1><p>{{service_name}}</p><p><strong>Fecha y hora:</strong> {{starts_at}}</p></td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td style="text-align:center;"><a href="{{booking_url}}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Ver detalles</a></td></tr></table>`;
    default:
      throw new Error(`Unsupported email_type: ${emailType}`);
  }
}

// ── Branding helpers (extracted verbatim from send-branded-email) ────────────

/** Resolve the company address from `companies.settings.address`. */
export function buildCompanyAddress(company: CompanyInfo): string {
  if (company.settings?.address) return company.settings.address;
  return '';
}

/**
 * Footer line: company name + NIF (if set) + address.
 * Used as `companyFooter` injected into per-type default templates.
 */
export function buildEmailFooter(company: CompanyInfo): string {
  const parts = [company.name];
  if (company.nif) parts.push(`NIF: ${company.nif}`);
  const addr = buildCompanyAddress(company);
  if (addr) parts.push(addr);
  return parts.join(' · ');
}

/**
 * Append a CAN-SPAM / GDPR compliant footer block to any email HTML.
 * Required by major ISPs (Hotmail/Outlook, Gmail) to avoid the spam folder.
 * Includes physical address, privacy policy link, and unsubscribe link.
 *
 * The proper way to satisfy Hotmail's "List-Unsubscribe" requirement is the
 * MIME header (RFC 8058), which requires switching to SES SendRawEmail.
 * The body link is a strong fallback signal used by all major spam filters.
 *
 * Always appended (no opt-out flag) — RGPD compliance cannot depend on
 * per-template correctness.
 */
export function appendComplianceFooter(
  html: string,
  company: CompanyInfo,
  companyId: string,
): string {
  const appUrl = Deno.env.get('APP_URL') || 'https://app.simplificacrm.es';
  const unsubscribeUrl = `${appUrl}/unsubscribe?company=${companyId}`;
  const baseFooter = buildEmailFooter(company);
  const complianceBlock = `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">
    <p style="font-size:12px;color:#6b7280;margin:0 0 6px;text-align:center;">${baseFooter}</p>
    <p style="font-size:11px;color:#9ca3af;margin:6px 0 0;text-align:center;line-height:1.5;">
      En cumplimiento del RGPD, sus datos serán tratados conforme a nuestra
      <a href="${appUrl}/privacidad" style="color:#6b7280;">política de privacidad</a>.
    </p>
    <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;text-align:center;">
      ¿No deseas recibir más comunicaciones?
      <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Darse de baja</a>
    </p>
  `;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${complianceBlock}</body>`);
  }
  return html + complianceBlock;
}

/**
 * Strip characters that could break out of a CSS `font-family: <value>` context.
 * Mirrors the original EF's defensive regex.
 */
function sanitizeFontFamily(value: string): string {
  return value.replace(/['"<>&]/g, '');
}

// ── Renderer registry ────────────────────────────────────────────────────────

/** Build the per-type `<img class="brand-logo">` HTML, or '' if no logo. */
function companyLogoHtml(company: CompanyInfo): string {
  return company.logo_url
    ? `<img src="${company.logo_url}" alt="${company.name}" style="max-height:60px;max-width:200px;">`
    : '';
}

function headerBlock(
  customHeader: string | null | undefined,
  data: TemplateData,
): string {
  if (!customHeader) return '';
  return `<div style="padding:16px 0;">${_interpolateSafe(customHeader, data as Record<string, unknown>)}</div>`;
}

/** Defensive text sanitizer used by inactive_notice client list rendering. */
function sanitizeText(value: unknown, maxLength = 10000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, '').replace(/[\r\n]/g, ' ').slice(0, maxLength).trim();
}

// ── Per-type renderers ───────────────────────────────────────────────────────

const renderBookingConfirmation: Renderer = (args) => {
  const { company, data, customSubject, customBody, customHeader } = args;
  const subject = customSubject || `Reserva confirmada - ${company.name}`;
  if (customBody) {
    return {
      subject,
      html: _interpolateSafe(customBody, data as Record<string, unknown>),
    };
  }
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogoHtml(company)}</div>
  ${headerBlock(customHeader, data)}
  <h1 style="color:${company.settings?.branding?.primary_color || '#4f46e5'};text-align:center;">Reserva confirmada</h1>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;">
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Servicio</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(String(data.servicio ?? ''))}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Fecha</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(String(data.fecha ?? ''))}</td></tr>
    <tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:bold;">Hora</td><td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(String(data.hora ?? ''))}</td></tr>
    <tr><td style="padding:8px 0;font-weight:bold;">Empresa</td><td style="padding:8px 0;">${escapeHtml(String(data.empresa ?? '')) || company.name}</td></tr>
  </table>
  <p style="text-align:center;color:#666;font-size:12px;">${company.settings?.email_branding?.footer_text ?? buildEmailFooter(company)}${buildCompanyAddress(company) ? ' · ' + buildCompanyAddress(company) : ''}</p>
</body>
</html>`,
  };
};

const renderInvoice: Renderer = (args) => {
  const { company, data, customSubject, customBody, customHeader, customButtonText } = args;
  const invoiceNum = escapeHtml(String(data.numero_factura ?? ''));
  const safeInvoiceUrl = escapeHtml(String(data.invoice_url ?? ''));
  const subject = customSubject || `Factura ${invoiceNum} - ${company.name}`;
  const btnText = customButtonText || 'Ver factura PDF';
  if (customBody) {
    return {
      subject,
      html: _interpolateSafe(customBody, data as Record<string, unknown>),
    };
  }
  const buttonHtml = data.invoice_url
    ? `<a href="${safeInvoiceUrl}" style="display:inline-block;background:${company.settings?.branding?.primary_color || '#4f46e5'};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">${btnText}</a>`
    : '';
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogoHtml(company)}</div>
  ${headerBlock(customHeader, data)}
  <h1 style="color:${company.settings?.branding?.primary_color || '#4f46e5'};text-align:center;">Factura ${invoiceNum}</h1>
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;">${company.settings?.email_branding?.footer_text ?? buildEmailFooter(company)}${company.nif ? ' · NIF: ' + company.nif : ''}</p>
  <p style="text-align:center;color:#999;font-size:11px;margin-top:10px;">En cumplimiento con el RGPD, sus datos serán tratados conforme a nuestra política de privacidad.</p>
</body>
</html>`,
  };
};

const renderQuote: Renderer = (args) => {
  const { company, data, customSubject, customBody, customHeader, customButtonText } = args;
  const quoteNum = escapeHtml(String(data.numero_presupuesto ?? ''));
  const safeQuoteUrl = escapeHtml(String(data.quote_url ?? ''));
  const subject = customSubject || `Presupuesto ${quoteNum} - ${company.name}`;
  const btnText = customButtonText || 'Ver presupuesto';
  if (customBody) {
    return {
      subject,
      html: _interpolateSafe(customBody, data as Record<string, unknown>),
    };
  }
  const buttonHtml = data.quote_url
    ? `<a href="${safeQuoteUrl}" style="display:inline-block;background:${company.settings?.branding?.primary_color || '#4f46e5'};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">${btnText}</a>`
    : '';
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogoHtml(company)}</div>
  ${headerBlock(customHeader, data)}
  <h1 style="color:${company.settings?.branding?.primary_color || '#4f46e5'};text-align:center;">Presupuesto ${quoteNum}</h1>
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;">${company.settings?.email_branding?.footer_text ?? buildEmailFooter(company)}${company.nif ? ' · NIF: ' + company.nif : ''}</p>
</body>
</html>`,
  };
};

const renderConsent: Renderer = (args) => {
  const { company, data, customSubject, customBody, customHeader, customButtonText } = args;
  const subject = customSubject || `Solicitud de consentimiento RGPD - ${company.name}`;
  const btnText = customButtonText || 'Revisar y validar datos';
  const safeConsentUrl = escapeHtml(String(data.consent_url ?? ''));
  if (customBody) {
    return {
      subject,
      html: _interpolateSafe(customBody, data as Record<string, unknown>),
    };
  }
  const buttonHtml = data.consent_url
    ? `<a href="${safeConsentUrl}" style="display:inline-block;background:${company.settings?.branding?.primary_color || '#4f46e5'};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">${btnText}</a>`
    : '';
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogoHtml(company)}</div>
  ${headerBlock(customHeader, data)}
  <h1 style="color:${company.settings?.branding?.primary_color || '#4f46e5'};text-align:center;">Solicitud de consentimiento RGPD</h1>
  <p style="text-align:center;">Solicitamos su consentimiento para el tratamiento de sus datos personales.</p>
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;">${company.settings?.email_branding?.footer_text ?? buildEmailFooter(company)}</p>
</body>
</html>`,
  };
};

// ── invite_owner + invite (alias) share one renderer ─────────────────────────

const renderInviteOrOwner: Renderer = (args) => {
  const { company, data, customSubject, customBody, customHeader, customButtonText, emailType } = { ...args, emailType: 'invite' as EmailType };
  // emailType is intentionally typed loosely here — caller passes the real one.
  // We re-derive isOwner from the explicit type passed in via a closure variable.
  return renderInviteInternal({ ...args, _forceType: (emailType as unknown as EmailType) });
};

// We split into a helper that takes the emailType explicitly because TS
// destructuring `emailType` from RenderArgs is not in the public type. The
// RENDERERS map below passes the emailType as a closure variable.
function renderInviteInternal(
  args: RenderArgs & { _forceType: EmailType },
): RenderResult {
  const { company, data, customSubject, customBody, customHeader, customButtonText } = args;
  const isOwner = args._forceType === 'invite_owner';
  const roleLabel = data.role_label || (isOwner ? 'Propietario' : 'Miembro');
  const subject = customSubject || (isOwner
    ? `Te han invitado a crear tu empresa en ${company.name}`
    : `Te han invitado a ${company.name}`);
  if (customBody) {
    return {
      subject,
      html: _interpolateSafe(customBody, data as Record<string, unknown>),
    };
  }
  const btnText = customButtonText || (isOwner ? 'Aceptar e introducir datos de empresa' : 'Aceptar invitación');
  const safeInviteUrl = escapeHtml(String(data.invite_url ?? ''));
  const safeInviterName = escapeHtml(String(data.inviter_name ?? ''));
  const safeMessage = escapeHtml(String(data.message ?? ''));
  const buttonHtml = data.invite_url
    ? `<a href="${safeInviteUrl}" style="display:inline-block;background:${company.settings?.branding?.primary_color || '#4f46e5'};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">${btnText}</a>`
    : '';
  const inviterLine = data.inviter_name
    ? `<p style="text-align:center;color:#6b7280;font-size:14px;">Invitación enviada por <strong>${safeInviterName}</strong></p>`
    : '';
  const messageLine = data.message
    ? `<div style="background:#f9fafb;border-left:4px solid ${company.settings?.branding?.primary_color || '#4f46e5'};padding:12px 16px;margin:16px 0;font-style:italic;color:#374151;">"${safeMessage}"</div>`
    : '';
  const extraInfoOwner = isOwner
    ? `<p style="text-align:center;color:#6b7280;font-size:13px;">Como propietario, podrás configurar los datos de tu empresa, facturación y gestionar a tu equipo.</p>`
    : '';
  const fontFamily = sanitizeFontFamily(company.settings?.email_branding?.font_family || 'Arial');
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:${fontFamily},sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogoHtml(company)}</div>
  <h1 style="color:${company.settings?.branding?.primary_color || '#4f46e5'};text-align:center;font-size:22px;">${isOwner ? 'Invitación para crear tu empresa' : `Te han invitado a ${company.name}`}</h1>
  ${inviterLine}
  <p style="text-align:center;font-size:16px;color:#374151;margin:20px 0;">
    Has recibido una invitación para unirte a <strong>${company.name}</strong>${!isOwner && data.role ? ` como <strong>${roleLabel}</strong>` : ''}.
  </p>
  ${messageLine}
  ${extraInfoOwner}
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;margin-top:24px;">${company.settings?.email_branding?.footer_text ?? buildEmailFooter(company)}</p>
</body>
</html>`,
  };
}

const renderInviteGeneric: Renderer = (args) => renderInviteInternal({ ...args, _forceType: 'invite' });
const renderInviteOwner: Renderer = (args) => renderInviteInternal({ ...args, _forceType: 'invite_owner' });

// ── Role-specific invite variants (admin/member/professional/agent/marketer/client) ──

function renderInviteRoleInternal(
  args: RenderArgs & { _forceType: EmailType },
): RenderResult {
  const { company, data, customSubject, customBody, customHeader, customButtonText } = args;
  const roleLabels: Record<string, string> = {
    invite_admin: 'Administrador',
    invite_member: 'Miembro',
    invite_professional: 'Profesional',
    invite_agent: 'Agente',
    invite_marketer: 'Marketing',
    invite_client: 'Cliente',
  };
  const defaultLabel = roleLabels[args._forceType] || 'Miembro';
  const displayRoleLabel = data.role_label ? escapeHtml(String(data.role_label)) : defaultLabel;
  const isClient = args._forceType === 'invite_client';
  const subject = customSubject || (isClient
    ? `Te han invitado a unirte a ${company.name}`
    : `Te han invitado a ${company.name} como ${displayRoleLabel}`);
  if (customBody) {
    return {
      subject,
      html: _interpolateSafe(customBody, data as Record<string, unknown>),
    };
  }
  const btnText = customButtonText || 'Aceptar invitación';
  const safeInviteUrl = escapeHtml(String(data.invite_url ?? ''));
  const safeInviterName = escapeHtml(String(data.inviter_name ?? ''));
  const safeMessage = escapeHtml(String(data.message ?? ''));
  const buttonHtml = data.invite_url
    ? `<a href="${safeInviteUrl}" style="display:inline-block;background:${company.settings?.branding?.primary_color || '#4f46e5'};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">${btnText}</a>`
    : '';
  const inviterLine = data.inviter_name
    ? `<p style="text-align:center;color:#6b7280;font-size:14px;">Invitación enviada por <strong>${safeInviterName}</strong></p>`
    : '';
  const messageLine = data.message
    ? `<div style="background:#f9fafb;border-left:4px solid ${company.settings?.branding?.primary_color || '#4f46e5'};padding:12px 16px;margin:16px 0;font-style:italic;color:#374151;">"${safeMessage}"</div>`
    : '';
  const clientNote = isClient
    ? `<p style="text-align:center;color:#6b7280;font-size:13px;">Después de aceptar, podrás acceder al portal de clientes de ${company.name} para gestionar tus reservas y documentos.</p>`
    : `<p style="text-align:center;color:#6b7280;font-size:13px;">Después de aceptar la invitación, tendrás acceso al panel de ${company.name}.</p>`;
  const fontFamily = sanitizeFontFamily(company.settings?.email_branding?.font_family || 'Arial');
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:${fontFamily},sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogoHtml(company)}</div>
  ${headerBlock(customHeader, data)}
  <h1 style="color:${company.settings?.branding?.primary_color || '#4f46e5'};text-align:center;font-size:22px;">Te han invitado a ${company.name}</h1>
  ${!isClient ? `<p style="text-align:center;font-size:16px;color:#374151;">Tu rol: <strong>${displayRoleLabel}</strong></p>` : ''}
  ${inviterLine}
  ${messageLine}
  ${clientNote}
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;margin-top:24px;">${company.settings?.email_branding?.footer_text ?? buildEmailFooter(company)}${buildCompanyAddress(company) ? ' · ' + buildCompanyAddress(company) : ''}</p>
</body>
</html>`,
  };
}

const renderInviteAdmin: Renderer = (args) => renderInviteRoleInternal({ ...args, _forceType: 'invite_admin' });
const renderInviteMember: Renderer = (args) => renderInviteRoleInternal({ ...args, _forceType: 'invite_member' });
const renderInviteProfessional: Renderer = (args) => renderInviteRoleInternal({ ...args, _forceType: 'invite_professional' });
const renderInviteAgent: Renderer = (args) => renderInviteRoleInternal({ ...args, _forceType: 'invite_agent' });
const renderInviteMarketer: Renderer = (args) => renderInviteRoleInternal({ ...args, _forceType: 'invite_marketer' });
const renderInviteClient: Renderer = (args) => renderInviteRoleInternal({ ...args, _forceType: 'invite_client' });

// ── waitlist / inactive_notice / generic / google_review ─────────────────────

const renderWaitlist: Renderer = (args) => {
  const { company, data, customSubject, customBody, customHeader, customButtonText } = args;
  const heading = data.heading ? escapeHtml(String(data.heading)) : '¡Estás en la lista!';
  const bodyText = data.body_text ? escapeHtml(String(data.body_text)) : 'Te avisaremos cuando puedas reservar.';
  const subject = customSubject || heading;
  const btnText = customButtonText || 'Reservar ahora';
  const safeWaitlistUrl = escapeHtml(String(data.waitlist_url ?? ''));
  if (customBody) {
    return {
      subject,
      html: _interpolateSafe(customBody, data as Record<string, unknown>),
    };
  }
  const buttonHtml = data.waitlist_url
    ? `<a href="${safeWaitlistUrl}" style="display:inline-block;background:${company.settings?.branding?.primary_color || '#4f46e5'};color:#fff;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin:20px 0;">${btnText}</a>`
    : '';
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="background:linear-gradient(135deg,${company.settings?.branding?.primary_color || '#4f46e5'},#1e40af);padding:30px 20px;text-align:center;">
    <span style="color:#fff;font-size:18px;font-weight:bold;">Simplifica CRM</span>
  </div>
  ${headerBlock(customHeader, data)}
  <h1 style="color:${company.settings?.branding?.primary_color || '#4f46e5'};text-align:center;">${heading}</h1>
  <p style="text-align:center;font-size:16px;color:#555;">${bodyText}</p>
  <div style="text-align:center;">${buttonHtml}</div>
  <p style="text-align:center;color:#666;font-size:12px;">${company.settings?.email_branding?.footer_text ?? buildEmailFooter(company)}</p>
</body>
</html>`,
  };
};

const renderInactiveNotice: Renderer = (args) => {
  const { company, data, customSubject, customBody, customHeader } = args;
  const subject = customSubject || `Clientes inactivos - ${company.name}`;
  // Defense in depth: sanitizeText strips angle brackets and trims; escapeHtml
  // additionally encodes any residual special chars (`&`, `"`, `'`) so a
  // malicious client name cannot break out of the <li>.
  const clientList = (data.client_names || []).map((name: string) =>
    `<li style="padding:4px 0;">${escapeHtml(sanitizeText(name, 200))}</li>`
  ).join('');
  if (customBody) {
    return {
      subject,
      html: _interpolateSafe(customBody, data as Record<string, unknown>),
    };
  }
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogoHtml(company)}</div>
  ${headerBlock(customHeader, data)}
  <h1 style="color:${company.settings?.branding?.primary_color || '#4f46e5'};text-align:center;">Clientes inactivos</h1>
  <p>Los siguientes clientes no han tenido actividad reciente:</p>
  <ul style="list-style:none;padding:0;">${clientList}</ul>
  <p style="text-align:center;color:#666;font-size:12px;margin-top:20px;">${company.settings?.email_branding?.footer_text ?? buildEmailFooter(company)} - Este es un mensaje automático</p>
</body>
</html>`,
  };
};

const renderGeneric: Renderer = (args) => {
  const { company, data, customSubject, customBody, customHeader } = args;
  const subject = customSubject || `Mensaje de ${company.name}`;
  const message = escapeHtml(String(data.message ?? ''));
  if (customBody) {
    return {
      subject,
      html: _interpolateSafe(customBody, data as Record<string, unknown>),
    };
  }
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;">${companyLogoHtml(company)}</div>
  ${headerBlock(customHeader, data)}
  <p style="font-size:16px;">${message}</p>
  <p style="text-align:center;color:#666;font-size:12px;margin-top:20px;">${company.settings?.email_branding?.footer_text ?? buildEmailFooter(company)}</p>
</body>
</html>`,
  };
};

const renderGoogleReview: Renderer = (args) => {
  const { company, data, customSubject, customBody, customHeader } = args;
  const clientName = data.client_name ? escapeHtml(String(data.client_name)) : '';
  const reviewUrl = data.review_url ? escapeHtml(String(data.review_url)) : 'https://g.page/review';
  const subject = customSubject || `¡Gracias por tu visita, ${clientName}! 🌟`;
  if (customBody) {
    return {
      subject,
      html: _interpolateSafe(customBody, data as Record<string, unknown>),
    };
  }
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:24px 0;">${companyLogoHtml(company)}</div>
  ${headerBlock(customHeader, data)}
  <h1 style="color:${company.settings?.branding?.primary_color || '#4f46e5'};text-align:center;font-size:24px;">¡Gracias por tu visita${clientName ? ', ' + clientName : ''}!</h1>
  <p style="text-align:center;font-size:16px;color:#555;margin:16px 0;">Tu opinión nos ayuda a seguir mejorando y a dar a conocer nuestro trabajo.</p>
  <div style="text-align:center;margin:28px 0;">
    <a href="${reviewUrl}" style="display:inline-block;background:#4285f4;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">
      ★★★★★ Dejar Google Review
    </a>
  </div>
  <p style="text-align:center;color:#888;font-size:13px;margin-top:24px;">${company.settings?.email_branding?.footer_text ?? buildEmailFooter(company)}</p>
  <p style="text-align:center;color:#ccc;font-size:11px;margin-top:8px;">Si ya has dejado tu opinión, ¡gracias! Este email solo se envía a clientes que han dado su consentimiento.</p>
</body>
</html>`,
  };
};

// ── budget_created / budget_reminder / budget_overdue ────────────────────────

function renderBudgetInternal(
  args: RenderArgs & { _forceType: EmailType },
): RenderResult {
  const { company, data, customSubject, customBody, customHeader, customButtonText } = args;
  const kind = args._forceType as 'budget_created' | 'budget_reminder' | 'budget_overdue';
  // Subject line interpolates raw values to keep it plain (no HTML); escapeHtml
  // not strictly needed because the subject is not rendered as HTML, but we
  // keep it consistent with the body.
  const safePeriod = escapeHtml(String(data.period_label ?? ''));
  const safeTotal = escapeHtml(String(data.total_formatted ?? ''));
  const dataSubject =
    kind === 'budget_created' ? `Nuevo presupuesto ${safePeriod} — ${safeTotal}`.trim()
      : kind === 'budget_reminder' ? `Tu presupuesto vence pronto — ${safeTotal}`.trim()
        : `Presupuesto vencido — ${safeTotal}`.trim();
  const subject = customSubject || dataSubject || `Presupuesto ${safePeriod} - ${company.name}`.trim();
  const btnText = customButtonText || data.cta_text || 'Ver presupuesto';
  if (customBody) {
    return {
      subject,
      html: _interpolateSafe(customBody, data as Record<string, unknown>),
    };
  }
  const primaryColor = company.settings?.branding?.primary_color || '#4f46e5';
  const backgroundColor = company.settings?.email_branding?.background_color || '#F9FAFB';
  const fontFamily = sanitizeFontFamily(company.settings?.email_branding?.font_family || 'Arial');
  const intro = data.intro ? escapeHtml(String(data.intro)) :
    (kind === 'budget_created'
      ? 'Ya está disponible tu presupuesto.'
      : kind === 'budget_reminder'
        ? 'Tu presupuesto vence pronto.'
        : 'Tu presupuesto ha vencido y aún no hemos recibido el pago.');
  const safeClientName = escapeHtml(String(data.client_name ?? ''));
  const safePaymentUrl = escapeHtml(String(data.payment_url ?? ''));
  const safeDueDate = escapeHtml(String(data.due_date_formatted ?? ''));
  const safePeriodLabel = escapeHtml(String(data.period_label ?? ''));
  const safeTotalFormatted = escapeHtml(String(data.total_formatted ?? ''));
  const safeFooterText = escapeHtml(String(data.footer_text ?? ''));
  const clientLine = data.client_name
    ? `<p style="text-align:center;font-size:16px;color:#374151;margin:20px 0;">Hola <strong>${safeClientName}</strong>,</p>`
    : '';
  const buttonHtml = data.payment_url
    ? `<a href="${safePaymentUrl}" style="display:inline-block;background:${primaryColor};color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin:24px 0;">${btnText}</a>`
    : '';
  const accentColor = kind === 'budget_overdue' ? '#dc2626' : kind === 'budget_reminder' ? '#f59e0b' : primaryColor;
  const headingColor = kind === 'budget_overdue' ? '#dc2626' : primaryColor;
  const headingText =
    kind === 'budget_created' ? 'Nuevo presupuesto disponible'
      : kind === 'budget_reminder' ? 'Tu presupuesto vence pronto'
        : 'Presupuesto vencido';
  const dueLine = data.due_date_formatted
    ? `<p style="text-align:center;color:#6b7280;font-size:14px;margin:4px 0;">Fecha de vencimiento: <strong>${safeDueDate}</strong></p>`
    : '';
  const periodLine = data.period_label
    ? `<p style="text-align:center;color:#6b7280;font-size:14px;margin:4px 0;">Periodo: <strong>${safePeriodLabel}</strong></p>`
    : '';
  const totalLine = data.total_formatted
    ? `<p style="text-align:center;color:#111;font-size:28px;font-weight:bold;margin:12px 0;">${safeTotalFormatted}</p>`
    : '';
  const daysToDueLine = (typeof data.days_to_due === 'number' && kind !== 'budget_created')
    ? `<p style="text-align:center;color:${kind === 'budget_overdue' ? '#dc2626' : '#f59e0b'};font-size:14px;font-weight:bold;margin:4px 0;">${
      data.days_to_due < 0
        ? `Vencido hace ${Math.abs(data.days_to_due)} día${Math.abs(data.days_to_due) === 1 ? '' : 's'}`
        : data.days_to_due === 0
          ? 'Vence hoy'
          : `Vence en ${data.days_to_due} día${data.days_to_due === 1 ? '' : 's'}`
    }</p>`
    : '';
  const footerLine = data.footer_text
    ? `<p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">${safeFooterText}</p>`
    : '';
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:${fontFamily},sans-serif;max-width:600px;margin:0 auto;padding:0;color:#333;background-color:${backgroundColor};">
  <div style="background:${accentColor};height:6px;"></div>
  <div style="padding:24px 20px;">
    <div style="text-align:center;padding:16px 0;">${companyLogoHtml(company)}</div>
    ${headerBlock(customHeader, data)}
    <h1 style="color:${headingColor};text-align:center;font-size:22px;margin:20px 0 4px 0;">${headingText}</h1>
    ${clientLine}
    <p style="text-align:center;font-size:16px;color:#374151;margin:12px 0 4px 0;">${intro}</p>
    ${periodLine}
    ${dueLine}
    ${daysToDueLine}
    ${totalLine}
    <div style="text-align:center;">${buttonHtml}</div>
    ${footerLine}
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:24px;">${company.settings?.email_branding?.footer_text ?? buildEmailFooter(company)}${company.nif ? ' · NIF: ' + company.nif : ''}</p>
    </div>
    </body>
    </html>`,
  };
}

const renderBudgetCreated: Renderer = (args) => renderBudgetInternal({ ...args, _forceType: 'budget_created' });
const renderBudgetReminder: Renderer = (args) => renderBudgetInternal({ ...args, _forceType: 'budget_reminder' });
const renderBudgetOverdue: Renderer = (args) => renderBudgetInternal({ ...args, _forceType: 'budget_overdue' });

// ── booking_change ───────────────────────────────────────────────────────────

const renderBookingChange: Renderer = (args) => {
  const { company, data, customSubject, customBody, customHeader, customButtonText } = args;
  const changeType = (data.change_type as string) || 'updated';
  const audience = (data.audience as string) || 'client';
  const verbByType: Record<string, string> = {
    created: 'Nueva reserva creada',
    updated: 'Tu reserva se ha modificado',
    rescheduled: 'Tu reserva se ha reprogramado',
    cancelled: 'Tu reserva se ha cancelado',
    deleted: 'Tu reserva se ha eliminado',
  };
  const audiencePrefix = audience === 'admin' ? '[Admin] ' : '';
  const safeServiceName = escapeHtml(String(data.service_name ?? ''));
  const dataSubject = `${audiencePrefix}${verbByType[changeType] || verbByType.updated}${data.service_name ? ' — ' + safeServiceName : ''}`;
  const subject = customSubject || dataSubject || `${audiencePrefix}Actualización de reserva — ${company.name}`;
  const btnText = customButtonText || data.cta_text || (audience === 'client' ? 'Ver reserva' : 'Ver detalles');
  const primaryColor = company.settings?.branding?.primary_color || '#4f46e5';
  const backgroundColor = company.settings?.email_branding?.background_color || '#F9FAFB';
  const fontFamily = sanitizeFontFamily(company.settings?.email_branding?.font_family || 'Arial');
  if (customBody) {
    return {
      subject,
      html: _interpolateSafe(customBody, data as Record<string, unknown>),
    };
  }
  const accentColor =
    changeType === 'cancelled' || changeType === 'deleted' ? '#dc2626' :
      changeType === 'rescheduled' ? '#f59e0b' :
        primaryColor;
  const headingColor =
    changeType === 'cancelled' || changeType === 'deleted' ? '#dc2626' : primaryColor;
  const headingText = verbByType[changeType] || verbByType.updated;
  const intro = data.intro ? escapeHtml(String(data.intro)) :
    (audience === 'client'
      ? (changeType === 'created' ? 'Te confirmamos la siguiente reserva:' : 'Los detalles de tu reserva han cambiado:')
      : audience === 'professional'
        ? (changeType === 'created' ? 'Tienes una nueva reserva asignada:' : 'Una de tus reservas ha cambiado:')
        : 'Una reserva en tu empresa ha cambiado:');
  const safeAudienceName = escapeHtml(String(data.audience_name ?? ''));
  const safeStartsAt = escapeHtml(String(data.starts_at ?? ''));
  const safeEndsAt = escapeHtml(String(data.ends_at ?? ''));
  const safePreviousStartsAt = escapeHtml(String(data.previous_starts_at ?? ''));
  const safeClientName = escapeHtml(String(data.client_name ?? ''));
  const safeProfessionalName = escapeHtml(String(data.professional_name ?? ''));
  const safeReason = escapeHtml(String(data.reason ?? ''));
  const safeBookingUrl = escapeHtml(String(data.booking_url ?? ''));
  const safeFooterText = escapeHtml(String(data.footer_text ?? ''));
  const greet = (data.audience_name as string)
    ? `<p style="text-align:center;font-size:16px;color:#374151;margin:20px 0;">Hola <strong>${safeAudienceName}</strong>,</p>`
    : '';
  const serviceLine = data.service_name
    ? `<p style="text-align:center;color:#111;font-size:18px;font-weight:600;margin:12px 0;">${safeServiceName}</p>`
    : '';
  const dateLine = data.starts_at
    ? `<p style="text-align:center;color:#374151;font-size:15px;margin:8px 0;"><strong>Fecha y hora:</strong> ${safeStartsAt}${data.ends_at ? ' — ' + safeEndsAt : ''}</p>`
    : '';
  const previousDateLine = data.previous_starts_at && changeType === 'rescheduled'
    ? `<p style="text-align:center;color:#6b7280;font-size:13px;margin:4px 0;text-decoration:line-through;">Anterior: ${safePreviousStartsAt}</p>`
    : '';
  const clientLine = data.client_name && audience !== 'client'
    ? `<p style="text-align:center;color:#374151;font-size:14px;margin:4px 0;">Cliente: <strong>${safeClientName}</strong></p>`
    : '';
  const professionalLine = data.professional_name && audience !== 'professional'
    ? `<p style="text-align:center;color:#374151;font-size:14px;margin:4px 0;">Profesional: <strong>${safeProfessionalName}</strong></p>`
    : '';
  const reasonLine = data.reason
    ? `<p style="text-align:center;color:#6b7280;font-size:13px;font-style:italic;margin:8px 0;">Motivo: ${safeReason}</p>`
    : '';
  const buttonHtml = data.booking_url
    ? `<a href="${safeBookingUrl}" style="display:inline-block;background:${primaryColor};color:#fff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;margin:24px 0;">${btnText}</a>`
    : '';
  const footerLine = data.footer_text
    ? `<p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">${safeFooterText}</p>`
    : '';
  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:${fontFamily},sans-serif;max-width:600px;margin:0 auto;padding:0;color:#333;background-color:${backgroundColor};">
<div style="background:${accentColor};height:6px;"></div>
<div style="padding:24px 20px;">
<div style="text-align:center;padding:16px 0;">${companyLogoHtml(company)}</div>
${headerBlock(customHeader, data)}
<h1 style="color:${headingColor};text-align:center;font-size:22px;margin:20px 0 4px 0;">${headingText}</h1>
${greet}
<p style="text-align:center;font-size:16px;color:#374151;margin:12px 0 4px 0;">${intro}</p>
${serviceLine}
${dateLine}
${previousDateLine}
${clientLine}
${professionalLine}
${reasonLine}
<div style="text-align:center;">${buttonHtml}</div>
${footerLine}
<p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:24px;">${company.settings?.email_branding?.footer_text ?? buildEmailFooter(company)}${company.nif ? ' · NIF: ' + company.nif : ''}</p>
</div>
</body>
</html>`,
  };
};

// ── Renderer registry ────────────────────────────────────────────────────────

/**
 * Per-type renderer map. The shared body of `renderTemplate` looks up
 * the renderer here; an unknown type falls through to `defaultRenderer`.
 * Adding a new email type means: add it to `EMAIL_TYPES` above, add a
 * renderer here, add a row to `email_sample_fixtures`, and update
 * `email_render_template(...)` in the SQL helper migration.
 */
const RENDERERS: Record<EmailType, Renderer> = {
  booking_confirmation: renderBookingConfirmation,
  invoice: renderInvoice,
  quote: renderQuote,
  consent: renderConsent,
  invite: renderInviteGeneric,
  invite_owner: renderInviteOwner,
  invite_admin: renderInviteAdmin,
  invite_member: renderInviteMember,
  invite_professional: renderInviteProfessional,
  invite_agent: renderInviteAgent,
  invite_marketer: renderInviteMarketer,
  invite_client: renderInviteClient,
  waitlist: renderWaitlist,
  inactive_notice: renderInactiveNotice,
  generic: renderGeneric,
  google_review: renderGoogleReview,
  // 6 simple types — TS mirror parity with SQL `email_render_template` after
  // PR1-6type-fix. These all funnel through `renderGeneric`, which honors
  // `customBody` (line 831: `if (customBody) { return { subject, html:
  // _interpolateSafe(customBody, ...) } }`). Before PR1-6type-fix the SQL
  // branches ignored `p_custom_body` while TS honored it — the silent-drop
  // bug was SQL-only. Migration `20260710000001_email_block_6type_hotfix.sql`
  // adds the matching IF wrapper to the SQL side, so SQL ≡ TS now and both
  // paths interpolate `{{var}}` tokens from `customBody`.
  booking_reminder: renderGeneric,
  booking_cancellation: renderGeneric,
  password_reset: renderGeneric,
  magic_link: renderGeneric,
  welcome: renderGeneric,
  staff_credentials: renderGeneric,
  budget_created: renderBudgetCreated,
  budget_reminder: renderBudgetReminder,
  budget_overdue: renderBudgetOverdue,
  booking_change: renderBookingChange,
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Render a transactional email for the given (company, type, data, overrides)
 * tuple. Returns the subject line and the HTML body. The HTML body is the
 * canonical preview that the live editor shows — byte-identical (modulo
 * `{{var}}` substitution) to what `send-branded-email` actually sends.
 *
 * NEW in PR1 (email-block-editor): accepts `customBlocks?: Block[] | null`
 * which takes precedence over `customBody` and the per-type default. Mirrors
 * the SQL `email_render_template` top-level dispatch (blocks → body → default).
 *
 * Flow:
 *   1. Top-level dispatch: if customBlocks is non-empty, render via
 *      renderBlocksToHtml. Else if customBody is set, use it. Else look up
 *      the per-type renderer in `RENDERERS` for the default branch.
 *   2. The per-type renderer computes `subject` (honoring customSubject) and
 *      `html` (honoring customBody / customHeader / customButtonText inside
 *      the per-type branch — verbatim TS mirror of the SQL behavior).
 *   3. Inject email_branding font-family + background-color into the `<body>`
 *      style (only for templates that use Arial as the baseline — leaves
 *      other templates untouched).
 *   4. Append the CAN-SPAM / GDPR compliance footer (no opt-out).
 */
export function renderTemplate(
  emailType: EmailType,
  company: CompanyInfo,
  data: TemplateData,
  customSubject?: string | null,
  customBody?: string | null,
  customHeader?: string | null,
  customButtonText?: string | null,
  customBlocks?: Block[] | null,
): RenderResult {
  const primaryColor = company.settings?.branding?.primary_color || '#4f46e5';
  const backgroundColor = company.settings?.email_branding?.background_color || '#F9FAFB';
  const fontFamily = sanitizeFontFamily(company.settings?.email_branding?.font_family || 'Arial');

  // Top-level dispatch (NEW in PR1). Mirrors SQL email_render_template.
  let subject: string;
  let html: string;
  if (Array.isArray(customBlocks) && customBlocks.length > 0) {
    // Blocks path wins over body and per-type default.
    // subject is taken from customSubject (no per-type renderer called).
    subject = customSubject || `Mensaje de ${company.name}`;
    html = renderBlocksToHtml(customBlocks, data as Record<string, unknown>);
  } else {
    const renderer = RENDERERS[emailType];
    const rendered = renderer
      ? renderer({ company, data, customSubject, customBody, customHeader, customButtonText })
      : renderGeneric({ company, data, customSubject, customBody, customHeader, customButtonText });
    subject = rendered.subject;
    html = rendered.html;
  }

  // Apply email_branding: inject font-family and background-color into <body> style
  if (html) {
    html = html.replace(
      'font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;',
      `font-family:${fontFamily},sans-serif;background-color:${backgroundColor};max-width:600px;margin:0 auto;padding:20px;color:#333;`,
    );
  }

  // Append compliance footer to every template, including blocks / customBody — no opt-out.
  if (html) {
    html = appendComplianceFooter(html, company, company.id);
  }

  return { subject, html };
}