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

## 2026-04-10 - Hardcoded Secret Fallbacks
**Vulnerability:** Hardcoded fallbacks for sensitive environment variables (e.g. `const KEY = Deno.env.get("KEY") || "default-secret"`) were found in multiple Edge Functions.
**Learning:** Providing a default "dev" secret in code seems convenient but is a critical security risk. If the environment variable is missing in production (e.g. misconfiguration), the application silently falls back to a known insecure key, potentially allowing attackers to decrypt data or forge signatures.
**Prevention:** Never use default values for secrets. Explicitly check for the existence of the environment variable and `throw` an error if it is missing. This enforces "Fail Securely" - the application should crash rather than run in an insecure state.
