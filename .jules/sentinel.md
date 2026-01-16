## 2025-10-26 - Defense in Depth for Trusted Content
**Vulnerability:** `TourOverlayComponent` used `[innerHTML]` directly on content from `OnboardingService` because the data was currently hardcoded/trusted.
**Learning:** Relying on data source trust (hardcoded mocks) is fragile; if the service later fetches from a remote API, XSS is introduced.
**Prevention:** Always use `SafeHtmlPipe` (with DOMPurify) even for trusted HTML content to ensure future-proofing and defense in depth.
