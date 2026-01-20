## 2025-05-18 - Modal Accessibility Pattern
**Learning:** Shared UI modals (like `ConfirmModalComponent`) are often missing ARIA roles (`alertdialog`, `modal`) and keyboard focus management (Escape key, initial focus), creating traps for keyboard users.
**Action:** When implementing or refactoring modals, always include `role="alertdialog"`, `aria-modal="true"`, and use Angular `effect` + `setTimeout` to handle initial focus when using Signals-based conditional rendering (`@if`).
