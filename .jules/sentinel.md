## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2028-05-23 - Recurring Debug Endpoints Regression
**Vulnerability:** Insecure debug endpoints (`debug-test-update`, `debug-env`, etc.) in `verifactu-dispatcher` allow unauthenticated IDOR and data manipulation. These recur due to environment sync issues.
**Learning:** The codebase has a tendency to revert to an insecure state (Jan 2026 snapshot). "Deleted" code reappears.
**Prevention:** Regularly audit `verifactu-dispatcher` for the presence of `debug-` endpoints and re-delete them.
