## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2027-05-25 - Unauthenticated Edge Function Access
**Vulnerability:** `ai-request` function checked for `Authorization` header presence but didn't validate the token with Supabase Auth, allowing unauthenticated usage.
**Learning:** Simply checking `req.headers.get('Authorization')` is insufficient. A valid JWT must be verified against the Auth service.
**Prevention:** Always use `supabase.auth.getUser()` in Edge Functions to validate the user session before processing sensitive requests.
