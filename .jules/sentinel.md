## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2026-06-20 - Insecure Fallback in Edge Functions
**Vulnerability:** Insecure Fallback logic that attempts to fetch data with admin privileges when user-scoped query returns insufficient data masks RLS misconfigurations and can lead to unauthorized data access.
**Learning:** Never use admin/service-role clients to "fix" missing data in user-facing endpoints. Rely on correct Database RLS policies.
**Prevention:** Ensure RLS policies are explicit for all tables (including child tables like `invoice_items`) and audit Edge Functions for admin client usage in read paths.
