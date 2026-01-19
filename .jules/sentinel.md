## 2026-01-19 - Unescaped HTML in Search Highlighting
**Vulnerability:** XSS in `AdvancedSearchService.highlightMatches`. The method replaced query matches with HTML tags but returned the rest of the string raw, allowing injection via `[innerHTML]`.
**Learning:** Custom text highlighting logic often overlooks the need to escape the *non-matching* parts of the string when the result is bound to `innerHTML`.
**Prevention:** Always escape the entire string when generating HTML programmatically. For highlighting, escape the text first or split-and-escape parts before reassembling with safe HTML tags.
