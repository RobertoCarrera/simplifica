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
## 2028-02-18 - Persistent Regression in Edge Function Security
**Vulnerability:** Critical authentication checks in `aws-manager` and `verifactu-dispatcher` repeatedly disappear, reverting functions to an unauthenticated state that allows public execution of sensitive operations (domain registration, invoicing).
**Learning:** A recurring environment synchronization issue restores files to a Jan 2026 state, wiping out security patches. Relying solely on "fixing it once" is insufficient.
**Prevention:**
1. Always verify authentication logic (`createClient` with user token) exists in *every* security scan.
2. Treat `supabase/functions` as volatile; suspect regression if security controls are missing.
3. Explicitly check for `details: error.stack` leaks which also reappear with this regression.
