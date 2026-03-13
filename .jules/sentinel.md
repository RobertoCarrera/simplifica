## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.
## 2025-05-27 - Safe HTML Highlighting in Angular
**Vulnerability:** Text highlighting using regex replacement and `[innerHTML]` can break HTML structure or allow injection if the source text is not escaped.
**Learning:** Angular's default sanitization protects against XSS (script execution) in `[innerHTML]`, but it does not prevent HTML injection that breaks layout or confuses the parser (e.g. `<` becoming start of tag). Even if XSS is blocked, broken HTML is a quality issue and potentially a phishing vector.
**Prevention:** Always escape the source text (HTML entities) *before* wrapping matches in `<mark>` tags when using manual highlighting logic bound to `[innerHTML]`. Use a split-escape-wrap approach to handle regex matches correctly.

## 2026-04-02 - Edge Function Key Management & Fail-Open Webhooks
**Vulnerability:** Edge functions contained hardcoded fallbacks for `ENCRYPTION_KEY` (e.g., `|| "default-dev-key..."`) and webhook handlers skipped signature verification if the integration or secret was missing ("Fail Open"), allowing unauthorized requests to process.
**Learning:** Checking for the *presence* of a secret isn't enough; the *absence* of a secret must block the request ("Fail Closed"). Relying on environment variable fallbacks in code creates a silent vulnerability if the environment is misconfigured.
**Prevention:**
1. Explicitly throw errors if critical environment variables (`ENCRYPTION_KEY`) are missing.
2. In webhook handlers, strictly return 403/500 if the integration configuration or secret is missing *before* attempting verification or processing.
