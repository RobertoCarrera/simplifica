# Palette's Journal 🎨

## 2024-05-22 - Accessible Theme Selector
**Learning:** Icon-only buttons and toggle switches often lack semantic meaning for screen readers. Using `aria-pressed` for toggles and `role="radio"` for selection grids significantly improves accessibility without changing visual design.
**Action:** When implementing theme or option selectors, always ensure the selected state is programmatically determinable via ARIA attributes.
