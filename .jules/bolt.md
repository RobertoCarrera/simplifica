## 2024-05-22 - Angular Signals View Model Pattern
**Learning:** Using computed signals to map raw data to "View Models" allows pre-calculating expensive display properties (like gradients or formatted names). This avoids function calls in the template (even with OnPush) and simplifies sorting/filtering logic.
**Action:** When a component has complex display logic for list items, create a View Model interface and a computed signal to transform the data once.
