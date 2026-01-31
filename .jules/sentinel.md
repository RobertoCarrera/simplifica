## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2026-02-18 - Deprecated Role Column Usage
**Vulnerability:** Availability and Authorization failure in Edge Functions (`upload-verifactu-cert`, `create-payment-link`, etc.). Functions queried `users.role` which was dropped in migration `20260111130000`.
**Learning:** Schema migrations that drop columns must be strictly cross-referenced with all Edge Function code, as they are not always part of the same build/type-check pipeline (or were missed due to file sync issues).
**Prevention:** Use `grep` or search to find all usages of dropped columns before finalizing the migration. Ensure CI/CD runs tests for Edge Functions against the *latest* schema.
