## 2024-05-22 - Toast Accessibility Pattern
**Learning:** Shared UI components like `ToastComponent` were missing basic ARIA roles and labels, specifically `role="alert"`, `aria-live`, and `aria-label` on icon-only buttons. The application is in Spanish, so ARIA labels must be localized.
**Action:** When working on shared components, check for `role`, `aria-live`, and localized `aria-label` attributes. Default to `aria-hidden="true"` for decorative icons.
