## 2026-01-17 - Missing Labels on Icon-Only Controls
**Learning:** The codebase heavily relies on visual icons (Bootstrap Icons) for key actions (Close, Add) without accompanying text or ARIA labels, making them invisible to screen readers.
**Action:** Always audit component templates for `<button>` elements containing only `<i>` tags and immediately add `aria-label`.
