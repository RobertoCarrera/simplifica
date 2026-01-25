## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2026-05-25 - Unauthorized Debug Endpoints in Edge Functions
**Vulnerability:** Critical IDOR and Remote Code Execution-like risk in `verifactu-dispatcher` edge function. Unprotected debug endpoints (`debug-test-update`, `debug-env`, `debug-last-event`) allowed unauthenticated users to modify database state, view environment variables, and access sensitive invoice data by guessing `company_id`.
**Learning:** File synchronization issues or rollbacks can reintroduce previously fixed vulnerabilities. Always verify the *current* state of the code, not just the memory of past fixes.
**Prevention:**
1. Never leave debug endpoints in production code blocks.
2. If debug actions are needed, secure them behind strict authentication AND a separate secret key check.
3. Use automated scanning or linting to detect keywords like `debug-` in production handlers.
