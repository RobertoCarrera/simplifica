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
## 2026-02-19 - Cross-Tenant Leak via Legacy Role Checks
**Vulnerability:** `payment_integrations` policies checked if a user was an 'admin' globally (via legacy role concept) but failed to verify the user belonged to the *specific company* owning the record.
**Learning:** Removing a legacy column (`role`) and replacing it with a new system (`app_roles`) can leave RLS policies in a "half-migrated" state where they syntax-check pass but fail logic (checking global role instead of company membership).
**Prevention:** When refactoring auth/roles, explicitly audit ALL policies relying on the old mechanism. Always enforce `AND company_id = record.company_id` in RLS policies for multi-tenant tables. Use helper functions like `current_user_is_admin(company_id)` to encapsulate this logic.
