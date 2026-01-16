## 2024-05-22 - Modal Accessibility Pattern
**Learning:** Generic modal components (like `ConfirmModal`) often lack critical accessibility features (ARIA roles, focus management, keyboard support) because they are treated as simple overlays.
**Action:** When implementing or refactoring modals, always use `@angular/cdk/a11y` for focus trapping and ensure `role="alertdialog"` (or `dialog`) and `aria-modal="true"` are present. Always link title/desc with `aria-labelledby`/`describedby`.
