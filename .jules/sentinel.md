## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2026-04-03 - Hardcoded Secrets in Edge Functions
**Vulnerability:** Hardcoded fallback values for sensitive environment variables (e.g., `ENCRYPTION_KEY`) in Edge Functions.
**Learning:** Developers often add fallbacks like `"default-dev-key"` for local development convenience, but these can accidentally be deployed to production, enabling attackers to decrypt sensitive data if the environment variable is missing.
**Prevention:** Never use fallbacks for secrets. Use `const KEY = Deno.env.get("KEY"); if (!KEY) throw new Error("Missing KEY");` to force explicit configuration in all environments.
