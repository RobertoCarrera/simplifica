## 2024-05-22 - Global Reverse Tabnabbing Protection
**Vulnerability:** Reverse Tabnabbing via `target="_blank"` links.
**Learning:** `DOMPurify` hooks only protect content sanitized through it. Standard Angular templates are not processed by DOMPurify. A truly global protection requires monitoring the DOM.
**Prevention:** Implemented a global `MutationObserver` in `src/app/core/utils/security.config.ts` that monitors the DOM for any new or modified anchor tags with `target="_blank"`, automatically enforcing `rel="noopener noreferrer"`.
