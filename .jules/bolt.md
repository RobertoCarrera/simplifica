## 2024-05-23 - Angular Signals ViewModel Pattern
**Learning:** Using a ViewModel interface within a `computed` signal allows moving complex presentation logic (formatting, gradients, badge config) out of the template. This prevents function calls in the template `{{ getSomething(item) }}` which run on every change detection cycle, significantly improving performance in large lists.
**Action:** Identify `*ngFor` loops calling functions in the template and refactor them to use a `computed` signal that maps the data to a ViewModel with pre-calculated properties.
