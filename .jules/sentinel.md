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
## 2026-05-24 - Stateless OAuth CSRF Protection in Edge Functions
**Vulnerability:** Google OAuth flow implementation lacked a `state` parameter, making it vulnerable to CSRF attacks where an attacker could link their own Google Calendar to a victim's account.
**Learning:** In a stateless Edge Function environment where the frontend initiates the redirect, we cannot rely on server-side session storage for the `state` token.
**Prevention:** Use a "Signed State" pattern:
1. Generate a state payload containing `userId` and `timestamp`.
2. Sign it using HMAC-SHA256 and a server-side secret (`SUPABASE_SERVICE_ROLE_KEY`).
3. Pass this signed state to the OAuth provider.
4. On callback, verify the signature, `userId` match, and timestamp expiration before exchanging the code.
