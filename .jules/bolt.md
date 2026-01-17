## 2024-05-22 - Optimize Customer List Rendering
**Learning:** Angular templates with function calls in `*ngFor` (e.g. `{{ getDisplayName(c) }}`) re-execute on every change detection cycle, even with `OnPush`, if they are part of the template structure.
**Action:** Moved expensive calculations (gradients, date formatting) to a View Model (`CustomerView`) and mapped the data inside a `computed` signal. This ensures calculations run only when the source data changes, not on every UI interaction.
