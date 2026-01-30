## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2026-02-18 - Unsecured Edge Function with AWS Access
**Vulnerability:** `aws-manager` edge function exposed public endpoints for domain registration without any authentication or authorization, and leaked stack traces.
**Learning:** Adding new edge functions with powerful capabilities (AWS SDK) requires strict adherence to auth patterns. Code reviewers must check for `auth.getUser()` calls.
**Prevention:** Enforce a template for Edge Functions that includes `createClient` and auth checks by default.
