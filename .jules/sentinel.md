# Sentinel Journal 🛡️

## 2025-02-23 - Inconsistent HTML Sanitization
**Vulnerability:** Found multiple usages of `[innerHTML]` bypassing the centralized sanitization strategy (`SafeHtmlPipe`). Specifically in `AdvancedSearchComponent` (search results) and `TourOverlayComponent` (onboarding steps).
**Learning:** Components created as "standalone" often miss global/core pipe imports, leading developers to rely on default Angular sanitization or none at all, bypassing established security patterns (DOMPurify).
**Prevention:** Enforce usage of `SafeHtmlPipe` for all `[innerHTML]` bindings via linting rules or code reviews. Ensure `SafeHtmlPipe` is flexible enough to handle legit use cases (like `class` attributes for highlighting).
