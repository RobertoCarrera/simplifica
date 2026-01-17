## 2024-05-24 - [HIGH] Fix potential XSS in TourOverlayComponent
**Vulnerability:** The `TourOverlayComponent` was using `[innerHTML]` to render content from `OnboardingService` without any sanitization. While the content was considered "trusted" (hardcoded), this pattern creates a significant risk if the content source ever changes to include user input or external data.
**Learning:** Never trust "trusted" content when rendering HTML. The "trusted" assumption is fragile and often breaks as applications evolve. "Defense in depth" requires sanitization at the point of rendering, regardless of the source.
**Prevention:** Always use a sanitization pipe (like `SafeHtmlPipe` wrapping `DOMPurify`) when using `[innerHTML]`. Avoid `[innerHTML]` whenever possible in favor of text interpolation.
