## 2024-05-23 - Accessibility Patterns for Icon-Only Buttons
**Learning:** Icon-only buttons often lack accessible names, making them invisible or confusing to screen reader users. Simply adding an icon class is not enough.
**Action:** Always add `aria-label` (and `title` for tooltip) to the `<button>` element. Add `aria-hidden="true"` to the `<i>` or `<svg>` icon element to prevent redundant or confusing announcements.
