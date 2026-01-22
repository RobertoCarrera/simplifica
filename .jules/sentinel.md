## 2025-02-18 - Safe HTML Pattern for Custom Content
**Vulnerability:** UI regression and potential XSS when handling custom markdown-to-HTML conversion.
**Learning:** Angular's default sanitizer strips `class` attributes from `[innerHTML]`, breaking styling for manually generated HTML (e.g. styled images). Fixing this by simply adding `bypassSecurityTrustHtml` creates an XSS vulnerability if input isn't sanitized first.
**Prevention:** Use the "Sanitize-then-Trust" pattern:
1. Generate the HTML string.
2. Sanitize using `DOMPurify.sanitize(html, { ADD_ATTR: ['class'] })`.
3. Wrap in `sanitizer.bypassSecurityTrustHtml(...)`.
4. Return `SafeHtml` type.

## 2026-02-18 - Search Highlighting XSS
**Vulnerability:** Reflected XSS in search results. `highlightMatches` function returned raw HTML (either original text or text with `<mark>` tags) which was bound to `[innerHTML]`. Malicious HTML in search results (e.g., ticket titles) would be executed.
**Learning:** When using `[innerHTML]` to display text with simple formatting (like highlighting), the underlying text MUST be escaped first. Simply wrapping matches in `<mark>` is not enough if the non-matching parts are left as raw HTML.
**Prevention:** Always escape the entire string before adding formatting tags. Pattern: `text.split(regex).map(part => isMatch(part) ? wrap(escape(part)) : escape(part)).join('')`.
