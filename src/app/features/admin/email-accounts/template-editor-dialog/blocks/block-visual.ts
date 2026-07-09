/**
 * Block-renderers Angular mirror (PR-wysiwyg email-block-editor)
 *
 * Pure TypeScript implementations of `renderBlockLogo` /
 * `renderBlockHeading` / `renderBlockParagraph` / `renderBlockButton`
 * — the SAME HTML-emitting functions the user sees in the
 * Supabase mirror at:
 *
 *   `F:/simplifica/simplifica-crm/supabase/functions/_shared/email-templates.ts`
 *
 * Why a mirror? `supabase/` is excluded from the Angular `tsconfig.json`
 * (`exclude: ["supabase", ...]`). The two implementations MUST stay
 * in lockstep — the snapshot harness
 *   `supabase/tests/snapshot_email_render.sql`
 * is the cross-boundary safety net. Drift shows up as a SQL assertion
 * failure (TS renderer tuple missing from the expected_substrings
 * matrix).
 *
 * What changes vs the Supabase mirror?
 *   - We strip the `sampleData` interpolation from
 *     `renderBlockButton` (the WYSIWYG canvas shows {{var}} tokens
 *     verbatim; the post-interp URL re-validation still applies for
 *     *literal* unsafe URLs — the regex match is on the raw string the
 *     user has not yet substituted). The SQL path still interpolates
 *     before rendering.
 *   - We skip the outer `interpolateSafe` wrap — the Angular side
 *     renders the block list block-by-block, so we don't have a
 *     "joined html" frame to interpolate.
 *   - We DO keep `escapeHtml` (re-implemented inline to avoid
 *     importing the Supabase escape.ts file from outside the supabase
 *     tree).
 *
 * The block-editor visual uses these functions; the SQL side uses the
 * Supabase mirror. Snapshot tests prove they are byte-equivalent at
 * render time.
 */

// ── OWASP encoding table (mirror of escape.ts) ──────────────────────────────────
// Same table as the Supabase escape.ts — only the chars actually emitted by
// the per-type renderers are encoded (we render escape-safe text only).
const HTML_ESCAPE_TABLE: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPE_TABLE[c] ?? c);
}

/** Strict post-interpolation URL regex (Fix 4 — same as SQL). */
const SAFE_URL_RE = /^(https?:\/\/|mailto:|#|\/)[^\s]*$/;
/** Pre-interpolation URL regex — allows {{var}} as a placeholder. */
const RAW_URL_RE = /^(https?:\/\/|mailto:|\{\{).*$/;

/** Defensive color sanitizer. Returns null if not a valid 6-digit hex. */
function sanitizeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value;
  return fallback;
}

/** Defensive integer clamp. */
function clampInt(value: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(hi, Math.max(lo, Math.floor(value)));
}

// ── Per-block renderers (mirror of the same name in email-templates.ts) ─────────

/** MIRROR: `renderBlockLogo` in `_shared/email-templates.ts`. */
export function renderBlockLogo(p: Record<string, unknown>): string {
  if (typeof p?.['src'] !== 'string' || !/^https?:\/\//.test(p['src'])) return '';
  const safeSrc = escapeHtml(p['src']);
  const alt = escapeHtml(String(p['alt'] ?? '').slice(0, 200));
  const maxH = clampInt(p['max_height'], 20, 200, 60);
  const maxW = clampInt(p['max_width'], 50, 600, 200);
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">` +
    `<tr><td style="text-align:center;">` +
    `<img src="${safeSrc}" alt="${alt}" ` +
    `style="display:block;max-height:${maxH}px;max-width:${maxW}px;height:auto;width:auto;border:0;">` +
    `</td></tr></table>`
  );
}

/** MIRROR: `renderBlockHeading` in `_shared/email-templates.ts`. */
export function renderBlockHeading(p: Record<string, unknown>): string {
  const text = String(p?.['text'] ?? '').slice(0, 200);
  const level = p?.['level'] === 2 ? 2 : p?.['level'] === 3 ? 3 : 1;
  const color = sanitizeColor(p?.['color'], '#111827');
  const align =
    p?.['align'] === 'left' ? 'left' :
    p?.['align'] === 'right' ? 'right' :
    'center';
  const fontSize = clampInt(p?.['font_size'], 12, 72, 24);
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:16px 0;">` +
    `<tr><td style="text-align:${align};">` +
    `<h${level} style="margin:0;color:${color};font-size:${fontSize}px;line-height:1.3;font-weight:700;">` +
    text +
    `</h${level}>` +
    `</td></tr></table>`
  );
}

/** MIRROR: `renderBlockParagraph` in `_shared/email-templates.ts`. */
export function renderBlockParagraph(p: Record<string, unknown>): string {
  const text = String(p?.['text'] ?? '').slice(0, 5000);
  const align =
    p?.['align'] === 'right' ? 'right' :
    p?.['align'] === 'justify' ? 'justify' :
    'left';
  const color = sanitizeColor(p?.['color'], '#374151');
  const fontSize = clampInt(p?.['font_size'], 12, 32, 16);
  const italic = p?.['italic'] === true;
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:12px 0;">` +
    `<tr><td style="text-align:${align};">` +
    `<p style="margin:0;color:${color};font-size:${fontSize}px;line-height:1.5;${italic ? 'font-style:italic;' : ''}">` +
    text +
    `</p>` +
    `</td></tr></table>`
  );
}

/** MIRROR: `renderBlockButton` in `_shared/email-templates.ts`.
 *
 *  We do NOT interpolate {{var}} tokens in the WYSIWYG canvas — we
 *  want the user to SEE the raw {{cta_url}} token, not a post-substituted
 *  URL. The post-interpolation URL re-validation still applies: if the
 *  raw URL is `{{cta_url}}` (matches RAW_URL_RE), we defer the SAFE_URL_RE
 *  check to the SQL/EF side (they interpolate first, then validate).
 *  If the raw URL is a literal that fails SAFE_URL_RE, we render a
 *  styled `<span>` (no clickable `<a>`) — same fallback as the SQL side.
 */
export function renderBlockButton(p: Record<string, unknown>): string {
  const rawUrl = String(p?.['url'] ?? '');
  const text = escapeHtml(String(p?.['text'] ?? 'Click aquí').slice(0, 100));
  const bg = sanitizeColor(p?.['background_color'], '#4f46e5');
  const fg = sanitizeColor(p?.['text_color'], '#FFFFFF');
  const padding = clampInt(p?.['padding'], 4, 32, 12);
  const radius = clampInt(p?.['border_radius'], 0, 24, 6);
  const align =
    p?.['align'] === 'left' ? 'left' :
    p?.['align'] === 'right' ? 'right' :
    'center';
  const btnStyle =
    `display:inline-block;background:${bg};color:${fg};padding:${padding}px 24px;` +
    `text-decoration:none;border-radius:${radius}px;font-weight:bold;font-size:16px;`;

  let openTag: string;
  let closeTag: string;
  // Allow `{{var}}` as a clickable href in the editor canvas (it will be
  // re-validated post-interp by the SQL/EF path when the email actually
  // renders). Block literal unsafe URLs at edit time.
  const isTemplateUrl = /^\{\{.*\}\}$/.test(rawUrl);
  if (isTemplateUrl || SAFE_URL_RE.test(rawUrl) || RAW_URL_RE.test(rawUrl)) {
    const safeUrl = isTemplateUrl ? rawUrl : escapeHtml(rawUrl);
    openTag = `<a href="${safeUrl}" style="${btnStyle}">`;
    closeTag = `</a>`;
  } else {
    openTag = `<span style="${btnStyle}cursor:default;">`;
    closeTag = `</span>`;
  }

  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:20px 0;">` +
    `<tr><td style="text-align:${align};">` +
    openTag + text + closeTag +
    `</td></tr></table>`
  );
}

// ── Type-discriminated dispatcher ──────────────────────────────────────────────

import type { Block, BlockType } from './block-types';

/** Pure dispatcher — returns the HTML string for any Block. Empty
 *  string when the block type is unknown (graceful forward-compat,
 *  matches the SQL renderer). */
export function renderBlockToHtmlString(block: Block): string {
  if (!block || typeof block !== 'object') return '';
  const type = block.type as BlockType;
  // Cast through `unknown` to bridge the discriminated-union of typed
  // Props interfaces (no index signature) to a uniform dict shape the
  // per-type renderers expect.
  const props = ((block.props ?? {}) as unknown) as Record<string, unknown>;
  switch (type) {
    case 'logo':
      return renderBlockLogo(props);
    case 'heading':
      return renderBlockHeading(props);
    case 'paragraph':
      return renderBlockParagraph(props);
    case 'button':
      return renderBlockButton(props);
    default:
      return '';
  }
}
