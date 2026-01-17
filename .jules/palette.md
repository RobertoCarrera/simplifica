## 2024-05-22 - Icon-Only Button Accessibility
**Learning:** Many icon-only buttons (using Bootstrap Icons `<i>` tags) lack `aria-label` attributes, making them inaccessible to screen readers.
**Action:** Systematically check buttons containing only `<i>` tags and add descriptive `aria-label`s mirroring their `title` attributes.
