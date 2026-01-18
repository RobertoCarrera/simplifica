
## 2026-01-18 - XSS & Reverse Tabnabbing Protection
**Vulnerability:** External links in user-generated content (e.g., ticket comments) using `target="_blank"` lacked `rel="noopener noreferrer"`, exposing the application to Reverse Tabnabbing attacks where the opened page could manipulate `window.opener`. Also, inconsistent HTML sanitization (DOMPurify manual usage vs pipe) increased XSS risks.
**Learning:** `DOMPurify` does not enforce `rel="noopener noreferrer"` by default without a custom hook. Angular's `bypassSecurityTrustHtml` must be preceded by robust sanitization that includes these security attributes.
**Prevention:** Implemented a centralized `sanitizeHtml` utility with a `DOMPurify` hook that enforces `rel="noopener noreferrer"` (while preserving existing `rel` values). Updated `SafeHtmlPipe` and components to use this utility exclusively.
