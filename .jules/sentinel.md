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
## 2026-03-10 - Secure Edge Function Debug Endpoints
**Vulnerability:** Broken Access Control in Edge Function debug endpoints (`verifactu-dispatcher`). The function validated the JWT but not the user's authorization for the specific `company_id` passed in the body, allowing IDOR and potential data leakage via the service-role client.
**Learning:** Validating a token only proves *who* the user is, not *what* they can do. When an Edge Function uses a service-role client (bypassing RLS), it MUST manually enforce authorization checks (e.g., "Is this user an admin of this company?").
**Prevention:** Implement strict helper functions (e.g., `requireCompanyAdmin(company_id)`) that query the user's role and company association before performing any privileged action on behalf of a company. Remove debug endpoints that expose system-wide data.
