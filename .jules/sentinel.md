## 2026-01-16 - Reverse Tabnabbing Protection in SafeHtmlPipe
**Vulnerability:** `SafeHtmlPipe` allowed `target="_blank"` attributes (via `ADD_ATTR`) but did not enforce `rel="noopener noreferrer"`. This exposed the application to Reverse Tabnabbing attacks where a malicious link could hijack the parent tab.
**Learning:** Configuring sanitizers to allow sensitive attributes like `target` requires complementary protections (like `rel="noopener"`) to be secure.
**Prevention:** Added a global `DOMPurify` hook in `SafeHtmlPipe` to automatically append `rel="noopener noreferrer"` to any link with `target="_blank"`.
