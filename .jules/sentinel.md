# Sentinel's Security Journal 🛡️

This journal tracks CRITICAL security learnings, vulnerability patterns, and architectural decisions.

## 2025-05-22 - Unsafe HTML Highlighting Pattern
**Vulnerability:** Reflected XSS in search results. The `highlightMatches` function in `AdvancedSearchService` performed regex replacement to add `<mark>` tags but did not sanitize the input text. This output was bound to `[innerHTML]`, allowing injection of malicious scripts if the search result data contained HTML tags.
**Learning:** Highlighting logic that returns HTML for `[innerHTML]` must strictly separate trusted markup (like `<mark>`) from untrusted content. Replacing string matches without escaping the non-matching parts is a common trap.
**Prevention:** Always escape the *entire* input string first, or split the string and escape each part individually before reassembling with trusted highlighting tags. Never assume data from the backend (or mock data) is safe for `[innerHTML]`.
