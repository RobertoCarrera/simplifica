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

## 2025-06-01 - Edge Function Auth & Info Leakage
**Vulnerability:** The `aws-manager` Edge Function was completely unauthenticated, allowing any caller to invoke AWS operations (e.g., domain registration) and leaked stack traces in error responses.
**Learning:** Edge Functions are publicly accessible by default unless `verifyJWT` or manual auth checks are implemented. Relying on "obscurity" or assuming they are only called internally is dangerous.
**Prevention:** Always instantiate a Supabase client with the request's `Authorization` header and call `auth.getUser()` at the beginning of sensitive Edge Functions. Never return `error.stack` to the client.
