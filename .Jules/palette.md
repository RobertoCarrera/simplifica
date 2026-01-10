## 2024-05-22 - Angular Hydration & Accessibility Verification
**Learning:** In server-side rendered (SSR) or prerendered Angular apps, interactive elements like overlays might be flaky in automated tests if hydration isn't complete or if Zone.js interactions are missed. However, ARIA attributes (static HTML) are always verifiable.
**Action:** When verifying UX on complex SSR apps, rely on static attribute verification (ARIA, semantics) or force component states rather than relying solely on simulated clicks.
