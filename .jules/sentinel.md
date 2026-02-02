## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2026-03-18 - Fail Closed Regression in Payment Webhooks
**Vulnerability:** Payment webhooks (Stripe/PayPal) reverted to a "Fail Open" state where missing configuration or signatures allowed payment processing to proceed.
**Learning:** Security fixes involving logic flow (e.g., `if (config) check()` vs `if (!config) fail()`) are prone to regressions because the code "looks" correct (it verifies signatures!) but silently allows bypass when config is missing.
**Prevention:** Always structure security checks as guard clauses that throw/return error first (`if (!valid) return 401`) rather than wrapping verification in conditional blocks (`if (valid) process`).
