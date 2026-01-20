## 2024-05-22 - [Angular Computed Signals & Intl.Collator]
**Learning:** Pre-calculating expensive UI derivatives (gradients, formatted dates) in a `computed` signal significantly reduces change detection overhead compared to template function calls, especially with `OnPush`.
**Action:** Always favor `ViewModel` interfaces with pre-calculated display properties over calling helper methods like `getDisplayName()` directly in the template loop.

## 2024-05-22 - [Sorting Performance]
**Learning:** Using `Intl.Collator` instantiated once is significantly faster and more correct for localized sorting than repeated `toLowerCase()` calls inside a sort function.
**Action:** Instantiate `Intl.Collator` as a top-level constant or static member when implementing sort logic.
