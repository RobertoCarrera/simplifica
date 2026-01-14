## 2024-05-24 - Accessibility Patterns in Shared Components
**Learning:** Shared UI components like `ThemeSelectorComponent` often miss basic ARIA attributes for state indication (e.g., `aria-pressed` for toggle buttons) and role definitions.
**Action:** When working on shared components, proactively check for:
1. State indication (`aria-pressed`, `aria-expanded`).
2. Labeling (`aria-label`, `aria-labelledby`) for icon-only buttons or when visual labels are insufficient.
3. Hiding decorative elements (`aria-hidden="true"`) to reduce screen reader noise.
4. Defining regions (`role="region"`, `role="group"`) to group related controls.
