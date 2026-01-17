## 2024-05-23 - Data Table Accessibility
**Learning:** Reusable data tables often miss ARIA labels on search inputs and icon-only pagination buttons, significantly hampering screen reader navigation.
**Action:** Always add `aria-label` to search inputs and pagination controls, and `aria-current="page"` to the active page indicator in list components.
