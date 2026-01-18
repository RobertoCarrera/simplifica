## 2025-02-23 - Regex instantiation in loops
**Learning:** Instantiating `RegExp` objects (e.g., `UUID_REGEX`) inside functions called from component templates (especially in `*ngFor` loops) significantly degrades performance because the regex is re-compiled on every change detection cycle for every item.
**Action:** Always define `RegExp` patterns as top-level constants outside the component class. For list rendering, pre-calculate the matching result in a View Model during data loading instead of in the template.
