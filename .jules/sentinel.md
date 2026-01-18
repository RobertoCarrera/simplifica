## 2026-01-18 - [Secure Links in SafeHtmlPipe]
**Vulnerability:** Reverse Tabnabbing (target="_blank" without rel="noopener noreferrer") in sanitized HTML.
**Learning:** DOMPurify sanitizes HTML but does not automatically enforce `rel="noopener noreferrer"` on `target="_blank"` links, leaving users vulnerable to phishing via tabnabbing even when XSS is prevented.
**Prevention:** Implemented a reusable `afterSanitizeAttributes` hook in `SafeHtmlPipe` to automatically inject `rel="noopener noreferrer"` for all `target="_blank"` anchors.
