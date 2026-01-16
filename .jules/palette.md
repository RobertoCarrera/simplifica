## 2024-05-23 - Accessibility in Dynamic Components
**Learning:** Dynamic components like Modals created with Angular Signals need explicit accessibility management (ARIA roles, focus management, keyboard support) as they are not standard HTML elements.
**Action:** Always add `role="alertdialog"`, `aria-modal="true"`, and `HostListener` for Escape key when creating overlay components.
