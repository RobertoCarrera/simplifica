## 2024-05-22 - Inconsistent Modal Accessibility Patterns
**Learning:** Shared modal components (`AppModalComponent`, `ConfirmModalComponent`) currently implement modal logic (scroll locking, backdrop handling) independently and lack consistent accessibility features like focus trapping and keyboard dismissal (Escape key).
**Action:** When working on modals in this codebase, assume basic a11y features are missing. Future work should aim to consolidate modal logic into a shared service or directive (e.g., using `@angular/cdk/a11y`) to ensure consistent behavior across all modal types.
