## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2026-03-10 - Secured Edge Function Debug Endpoints
**Vulnerability:** Unprotected debug endpoints in `verifactu-dispatcher` allowed unauthenticated access to global event data (potential cross-tenant leak) and environment variables.
**Learning:** Debug endpoints often bypass standard auth flows. Using `admin` client in Edge Functions without explicit authorization checks (like `requireCompanyAccess`) is dangerous.
**Prevention:**
1. Implement helper functions like `requireCompanyAccess(company_id)` that use a user-scoped client to verify RLS access.
2. Remove or strictly gate debug endpoints in production code.
3. Never expose global queries (e.g., `admin.from('events').select('*')`) in endpoints callable by any user.

**Refinement:** Explicitly define `SUPABASE_URL` inside helper functions rather than relying on closure scope to prevent reference errors during refactoring or context shifts.
