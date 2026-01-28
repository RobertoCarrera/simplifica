## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2028-02-18 - Unauthenticated Edge Function Regression
**Vulnerability:** `aws-manager` Edge Function was completely unauthenticated, allowing RCE/AWS operations by anyone.
**Learning:** File synchronization issues can silently revert security patches on Edge Functions, leaving them exposed. The lack of CI/CD tests for Edge Functions makes this regression hard to detect automatically.
**Prevention:** Always verify `auth.getUser()` is called at the very beginning of Supabase Edge Functions. Consider adding an integration test suite that pings Edge Functions to assert 401 on unauthenticated requests.
