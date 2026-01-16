## 2024-05-23 - Template Performance with Signals
**Learning:** Even with `OnPush` change detection and Signals, invoking functions inside template loops (like `@for` or `*ngFor`) executes those functions on every change detection cycle that targets the component.
**Action:** Move derived state calculations from template helper methods into a `computed` signal that maps the source data (e.g., `customers`) to a View Model (e.g., `CustomerView`). This ensures expensive logic (regex, date formatting, hashing) runs only when the source signal updates, not on every CD cycle.
