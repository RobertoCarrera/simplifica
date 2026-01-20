## 2025-05-18 - Modal Accessibility Pattern
**Learning:** Shared UI modals (like `ConfirmModalComponent`) are often missing ARIA roles (`alertdialog`, `modal`) and keyboard focus management (Escape key, initial focus), creating traps for keyboard users.
**Action:** When implementing or refactoring modals, always include `role="alertdialog"`, `aria-modal="true"`, and use Angular `effect` + `setTimeout` to handle initial focus when using Signals-based conditional rendering (`@if`).
## 2024-05-23 - Accessibility in Modals
**Learning:** Modals require careful state management for accessibility, specifically `aria-modal="true"`, `role="alertdialog"`, and focus trapping/restoration. Simply hiding/showing them is not enough for screen readers.
**Action:** Always implement `@HostListener` for Escape key and manage focus using `ViewChild` and `previousActiveElement` in any future modal components.
## 2024-05-23 - Accessibility Patterns for Icon-Only Buttons
**Learning:** Icon-only buttons often lack accessible names, making them invisible or confusing to screen reader users. Simply adding an icon class is not enough.
**Action:** Always add `aria-label` (and `title` for tooltip) to the `<button>` element. Add `aria-hidden="true"` to the `<i>` or `<svg>` icon element to prevent redundant or confusing announcements.
