## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.
## 2025-05-27 - Safe HTML Highlighting in Angular
**Vulnerability:** Text highlighting using regex replacement and `[innerHTML]`, can break HTML structure or allow injection if the source text is not escaped.
**Learning:** Angular's default sanitization protects against XSS (script execution) in `[innerHTML]`, but it does not prevent HTML injection that breaks layout or confuses the parser (e.g. `<` becoming start of tag). Even if XSS is blocked, broken HTML is a quality issue and potentially a phishing vector.
**Prevention:** Always escape the source text (HTML entities) *before* wrapping matches in `<mark>` tags when using manual highlighting logic bound to `[innerHTML]`. Use a split-escape-wrap approach to handle regex matches correctly.
## 2028-06-01 - Recurring IDOR via Debug Endpoints in Edge Functions
**Vulnerability:** Critical IDOR and information disclosure via `debug-*` endpoints in `verifactu-dispatcher`. These endpoints (`debug-test-update`, `debug-env`, etc.) were left in the production code, allowing unauthenticated or loosely authenticated access to sensitive event data and configuration.
**Learning:** Debugging tools often get merged into production if not strictly separated or flagged. Code reverts/sync issues can resurrect previously fixed vulnerabilities.
**Prevention:**
1. Never commit debug endpoints to the main branch. Use local mocking or feature flags that default to OFF in production.
2. If debug code is needed in dev, use `if (Deno.env.get('ENVIRONMENT') === 'local')` guards, but preferably remove them entirely before commit.
3. Regularly audit Edge Functions for "debug", "test", or "mock" logic that might have slipped in.
