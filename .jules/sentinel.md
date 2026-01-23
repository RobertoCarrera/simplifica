## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2026-03-08 - Ambiguous Company Context during Migration
**Vulnerability:** Authorization bypass where a user retains access to a company via a deprecated `users.company_id` column after being removed from the new `company_members` table.
**Learning:** When migrating from 1:1 (User:Company) to N:M relationships, legacy columns used for fallback authorization can become stale "backdoors" if not strictly validated against the new source of truth.
**Prevention:** Always validate legacy fallback columns against the new authority table. If a user has multiple valid roles (N:M) and no specific context is provided, and the legacy column matches one of them, use it as a tie-breaker. If it matches none, deny access.
