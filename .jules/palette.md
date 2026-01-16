## 2024-05-23 - Accessibility in Shared UI Components
**Learning:** Many shared UI components like `BtnNewComponent` (icon buttons) and `ConfirmModalComponent` lack basic ARIA attributes (`aria-label`, `role="alertdialog"`, `aria-labelledby`). This is a recurring pattern in the codebase.
**Action:** When touching shared components, always verify and add missing ARIA labels and roles. Specifically check for icon-only buttons and modal containers.
