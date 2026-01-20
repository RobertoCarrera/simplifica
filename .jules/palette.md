## 2024-05-23 - Accessibility in Modals
**Learning:** Modals require careful state management for accessibility, specifically `aria-modal="true"`, `role="alertdialog"`, and focus trapping/restoration. Simply hiding/showing them is not enough for screen readers.
**Action:** Always implement `@HostListener` for Escape key and manage focus using `ViewChild` and `previousActiveElement` in any future modal components.
