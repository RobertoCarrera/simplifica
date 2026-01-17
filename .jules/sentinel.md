## 2026-01-17 - XSS in Search Highlighting
**Vulnerability:** Unsanitized HTML injection in search result highlighting.
**Learning:** `innerHTML` binding in Angular is dangerous even with trusted data if that data is manipulated (e.g., regex replacement) to include HTML tags without escaping the original content. The vulnerability arises when trusted text is modified to contain HTML tags (like `<mark>`) and then bound to `innerHTML`, bypassing Angular's sanitization for the added tags but inadvertently trusting the original text which might contain XSS vectors.
**Prevention:** Always escape user input or existing content before injecting HTML tags for highlighting. Use `split` and `map` logic instead of direct `replace` to separate safe HTML tags from content.
