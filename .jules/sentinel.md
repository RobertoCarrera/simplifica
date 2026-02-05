## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2026-05-26 - Integrity Check Missing in Multi-Tenant Edge Functions
**Vulnerability:** IDOR/Integrity violation in `public-create-booking`. The function accepted `companyId` and `serviceId` but failed to verify their relationship, allowing cross-tenant bookings.
**Learning:** Accepting multiple IDs without cross-referencing ownership allows attackers to mix-and-match resources across tenants.
**Prevention:** Always validate that dependent resources (like Services) belong to the primary parent resource (like Company) before processing.
