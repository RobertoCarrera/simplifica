/**
 * Shared HTML escaping helpers for Supabase Edge Functions.
 *
 * Rafter v0.27 — extracted from send-branded-email/index.ts (where the
 * `escapeHtml()` and `interpolate()` helpers were module-private) so that
 * the sibling Edge Functions (invoices-email, quotes-email,
 * notify-inactive-clients, send-waitlist-email, ...) can use the SAME
 * safe-by-default escaping when they build fallback HTML bodies.
 *
 * Background (Rafter v0.26, commit 274da52e):
 *   The original XSS was in `send-branded-email`'s `interpolate()`,
 *   which substituted `{{key}}` tokens into admin-authored templates
 *   without HTML-escaping the values. A client whose `name` contained
 *   `<img src=x onerror=...>` could weaponise every transactional email.
 *   v0.26 fixed `interpolate()` itself; v0.27 closes the four sibling
 *   EFs that build fallback HTML with raw `${...}` template literals
 *   (i.e. NOT going through `interpolate()`).
 *
 * IMPORTANT (security contract):
 *   - EVERY variable value interpolated into HTML MUST be passed through
 *     `escapeHtml()` (or via `interpolateSafe()` for `{{key}}` syntax).
 *   - Admin-authored template *strings* (customBody / customHeader from
 *     `company_email_settings`) are deliberately NOT escaped — they are
 *     trusted HTML authored by the company admin via the email-branding
 *     UI. Only the variable VALUES are escaped.
 *   - The TemplateData shape in send-branded-email intentionally does
 *     NOT include any pre-rendered HTML fields (no `*_html` suffix).
 *     If a future template ever needs a raw-HTML variable, add a
 *     separate escape hatch (e.g. `{{{unescaped}}}` on a NEW function) —
 *     do NOT weaken this default.
 */

/**
 * HTML-escape a string for safe interpolation into an HTML email body.
 * Escapes &, <, >, ", ' so a value like `<img src=x onerror=alert(1)>`
 * or `https://x?a=b" onclick="..."` cannot break out of either element
 * content or an attribute context.
 *
 * Matches the OWASP "HTML Context" encoding table for the five
 * characters that have meaning in HTML:
 *   & → &amp;   (must be first so we don't double-escape &)
 *   < → &lt;
 *   > → &gt;
 *   " → &quot;  (attribute values)
 *   ' → &#x27;  (single-quoted attribute values; &#x27; over &apos; for IE compatibility)
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Safe-by-default template interpolation for `{{key}}` syntax.
 *
 * Replaces every `{{key}}` token in `template` with the stringified
 * and HTML-escaped value of `vars[key]`. `null` and `undefined`
 * values become the empty string. Missing keys also become empty
 * (do NOT throw — admin templates should not 500 because a single
 * variable is missing).
 *
 * This is the safe replacement for the v0.26 `interpolate()` function
 * that lived in send-branded-email/index.ts. Same semantics, but
 * shared across all Edge Functions.
 *
 * NOTE: this function escapes EVERY value by default. If you need
 * a raw-HTML escape hatch, use a different token syntax (e.g.
 * `{{{unescapedHtml}}}`) and add it to a NEW function — do NOT
 * weaken this default.
 */
export function interpolateSafe(
  template: string,
  vars: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const val = vars[key];
    if (val == null) return '';
    return escapeHtml(String(val));
  });
}