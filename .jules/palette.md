## 2024-05-22 - Explicit State vs Toggle on Dual Buttons
**Learning:** When using two separate buttons for binary states (e.g., Light/Dark), avoid 'toggle' logic on the active button. Users expect the 'Light' button to enforce Light mode, not toggle to Dark if already active.
**Action:** Always bind specific 'set' actions (e.g., `setLightTheme()`) to explicit state buttons, rather than generic toggle functions.

## 2024-05-22 - Semantic Grouping for Settings
**Learning:** Settings like theme or color selection are often implemented as div-soups. Screen readers miss the context that these are related choices.
**Action:** Wrap related setting buttons in a container with `role="group"` and a descriptive `aria-label`, and use `aria-pressed` to indicate the active selection.
